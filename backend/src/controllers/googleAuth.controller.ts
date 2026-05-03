import { Request, Response, NextFunction } from "express";
import passport from "passport";
import prisma from "../config/prisma";
import crypto from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken";
import { setAuthCookies } from "../utils/authCookies";
import {
  createGoogleOAuthState,
  getDefaultFrontendOrigin,
  resolveGoogleOAuthRedirectOrigin,
  verifyGoogleOAuthState,
} from "../utils/googleOAuthState";
import { ensureAuthBootstrapContext } from "../services/authBootstrap.service";
import { emitPerformanceMetric } from "../observability/performanceMetrics";

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  "unknown";

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const buildAuthErrorUrl = (
  redirectOrigin: string,
  authError: string
) => {
  const url = new URL("/auth/login", redirectOrigin);
  url.searchParams.set("authError", authError);
  url.searchParams.set("error", "google_auth_failed");
  return url.toString();
};

const pruneRefreshTokens = async (userId: string, retainCount = 4) => {
  const staleTokens = await prisma.refreshToken.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: Math.max(0, retainCount),
    select: {
      id: true,
    },
  });

  if (!staleTokens.length) {
    return;
  }

  await prisma.refreshToken.deleteMany({
    where: {
      id: {
        in: staleTokens.map((token) => token.id),
      },
    },
  });
};

/* ======================================
GOOGLE INIT
====================================== */

export const googleAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const redirectOrigin = resolveGoogleOAuthRedirectOrigin(
      typeof req.query.redirectTo === "string"
        ? req.query.redirectTo
        : String(
            req.headers.referer ||
              req.headers.origin ||
              getDefaultFrontendOrigin()
          )
    );
    const state = createGoogleOAuthState(redirectOrigin);

    passport.authenticate("google", {
      scope: ["profile", "email"],
      state,
      session: false,
    })(req, res, next);
  } catch {
    return res.redirect(
      buildAuthErrorUrl(getDefaultFrontendOrigin(), "oauth_failed")
    );
  }
};

/* ======================================
GOOGLE CALLBACK
====================================== */

export const googleCallback = async (req: Request, res: Response) => {
  const startedAt = Date.now();
  try {
    const user = req.user as any;
    const state = verifyGoogleOAuthState(req.query.state);
    const redirectOrigin = state?.redirectOrigin || getDefaultFrontendOrigin();

    /* ======================================
    STATE VALIDATION
    ====================================== */

    if (!state) {
      console.warn("OAuth state mismatch");
      return res.redirect(
        buildAuthErrorUrl(
          getDefaultFrontendOrigin(),
          "oauth_state_invalid"
        )
      );
    }

    if (!user || !user.id || !user.isActive) {
      return res.redirect(
        buildAuthErrorUrl(
          redirectOrigin,
          user?.id ? "account_inactive" : "oauth_failed"
        )
      );
    }

    const bootstrap = await ensureAuthBootstrapContext({
      userId: user.id,
      preferredBusinessId: user.businessId || null,
      profileSeed: {
        email: user.email || null,
        name: user.name || null,
        avatar: user.avatar || null,
      },
    });

    const accessToken = generateAccessToken(
      bootstrap.user.id,
      bootstrap.user.role,
      bootstrap.identity.businessId,
      bootstrap.user.tokenVersion
    );

    const refreshRaw = generateRefreshToken(
      bootstrap.user.id,
      bootstrap.user.tokenVersion
    );
    const refreshToken = hashToken(refreshRaw);

    await pruneRefreshTokens(bootstrap.user.id, 4);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: bootstrap.user.id,
        userAgent: req.headers["user-agent"],
        ip: getIP(req),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    setAuthCookies(res, req, accessToken, refreshRaw);

    console.info("AUTH_GOOGLE_CALLBACK_OK", {
      userId: bootstrap.user.id,
      businessId: bootstrap.identity.businessId,
      source: bootstrap.identity.source,
    });
    emitPerformanceMetric({
      name: "AUTH_MS",
      value: Date.now() - startedAt,
      businessId: bootstrap.identity.businessId,
      route: "auth.google_callback",
      metadata: {
        source: "google_oauth",
      },
    });

    return res.redirect(`${redirectOrigin}/dashboard`);
  } catch (err) {
    console.error("GOOGLE CALLBACK ERROR", err);
    return res.redirect(
      buildAuthErrorUrl(getDefaultFrontendOrigin(), "oauth_failed")
    );
  }
};
