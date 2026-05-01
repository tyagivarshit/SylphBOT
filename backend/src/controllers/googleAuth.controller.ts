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

    const result = await prisma.$transaction(async (tx) => {
      let business = await tx.business.findFirst({
        where: { ownerId: user.id },
        select: { id: true },
      });

      if (!business) {
        const newBusiness = await tx.business.create({
          data: {
            name: `${user.name || "My"} Workspace`,
            ownerId: user.id,
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { businessId: newBusiness.id },
        });

        business = { id: newBusiness.id };
      }

      if (user.businessId !== business.id) {
        await tx.user.update({
          where: { id: user.id },
          data: { businessId: business.id },
        });
      }

      const accessToken = generateAccessToken(
        user.id,
        user.role,
        business.id,
        user.tokenVersion
      );

      const refreshRaw = generateRefreshToken(
        user.id,
        user.tokenVersion
      );

      const refreshToken = hashToken(refreshRaw);

      const count = await tx.refreshToken.count({
        where: { userId: user.id },
      });

      if (count >= 5) {
        const oldest = await tx.refreshToken.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
        });

        if (oldest) {
          await tx.refreshToken.delete({
            where: { id: oldest.id },
          });
        }
      }

      await tx.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          userAgent: req.headers["user-agent"],
          ip: getIP(req),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return {
        accessToken,
        refreshRaw,
        businessId: business.id,
      };
    });

    setAuthCookies(res, req, result.accessToken, result.refreshRaw);

    console.log("GOOGLE LOGIN SUCCESS", {
      userId: user.id,
      businessId: result.businessId,
    });

    return res.redirect(`${redirectOrigin}/dashboard`);
  } catch (err) {
    console.error("GOOGLE CALLBACK ERROR", err);
    return res.redirect(
      buildAuthErrorUrl(getDefaultFrontendOrigin(), "oauth_failed")
    );
  }
};
