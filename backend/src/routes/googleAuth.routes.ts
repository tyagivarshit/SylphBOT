import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import  redis  from "../config/redis";
import {
  googleAuth,
  googleCallback,
} from "../controllers/googleAuth.controller";
import {
  getDefaultFrontendOrigin,
  getGoogleOAuthStateKey,
  GOOGLE_OAUTH_STATE_TTL_SECONDS,
  resolveGoogleOAuthRedirectOrigin,
  verifyGoogleOAuthState,
} from "../utils/googleOAuthState";

const router = Router();

/* ======================================
UTILS
====================================== */

const getIP = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

/* ======================================
OAUTH LIMITER (ATOMIC + SAFE)
====================================== */

const oauthLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const ip = getIP(req);
    const key = `oauth:${ip}`;

    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);

    const [[, count], [, ttl]] = (await multi.exec()) as any;

    if (ttl === -1) {
      await redis.expire(key, 60);
    }

    if (count > 20) {
      return res.status(429).json({
        success: false,
        message: "Too many OAuth attempts. Try again later.",
      });
    }

    next();
  } catch {
    return res.status(429).json({
      success: false,
      message: "Too many requests",
    });
  }
};

/* ======================================
SAFE WRAPPER
====================================== */

const safeHandler =
  (fn: any) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(() => {
      const loginUrl = new URL("/auth/login", getDefaultFrontendOrigin());
      loginUrl.searchParams.set("authError", "oauth_failed");
      return res.redirect(loginUrl.toString());
    });

const hasAuthCookies = (req: Request) =>
  Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);

const claimGoogleOAuthState = async (nonce: string) => {
  try {
    const result = await redis.set(
      getGoogleOAuthStateKey(nonce),
      "processing",
      "EX",
      GOOGLE_OAUTH_STATE_TTL_SECONDS,
      "NX"
    );

    return result === "OK";
  } catch (error) {
    console.error("GOOGLE OAUTH STATE CLAIM ERROR", error);
    return null;
  }
};

const releaseGoogleOAuthState = async (nonce: string) => {
  try {
    await redis.del(getGoogleOAuthStateKey(nonce));
  } catch (error) {
    console.error("GOOGLE OAUTH STATE RELEASE ERROR", error);
  }
};

const authenticateGoogleUser = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return new Promise<any>((resolve, reject) => {
    passport.authenticate(
      "google",
      {
        session: false,
      },
      (err: any, user: any) => {
        if (err) {
          return reject(err);
        }

        return resolve(user);
      }
    )(req, res, next);
  });
};

const buildAuthErrorUrl = (
  redirectOrigin: string,
  authError: string
) => {
  const loginUrl = new URL("/auth/login", redirectOrigin);
  loginUrl.searchParams.set("authError", authError);
  loginUrl.searchParams.set("error", "google_auth_failed");
  return loginUrl.toString();
};

const handleGoogleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const state = verifyGoogleOAuthState(req.query.state);
  const redirectOrigin = resolveGoogleOAuthRedirectOrigin(
    state?.redirectOrigin || getDefaultFrontendOrigin()
  );
  const loginUrl = buildAuthErrorUrl(
    redirectOrigin,
    req.query.error === "access_denied"
      ? "oauth_cancelled"
      : "oauth_failed"
  );

  if (!state) {
    return res.redirect(
      buildAuthErrorUrl(
        getDefaultFrontendOrigin(),
        "oauth_state_invalid"
      )
    );
  }

  const claimed = await claimGoogleOAuthState(state.nonce);

  // Browsers can replay the callback URL once cookies are already set.
  // Reuse the established session instead of re-spending the same auth code.
  if (claimed === false) {
    return hasAuthCookies(req)
      ? res.redirect(`${state.redirectOrigin}/dashboard`)
      : res.redirect(loginUrl);
  }

  let user: any;

  try {
    user = await authenticateGoogleUser(req, res, next);
  } catch (err: any) {
    await releaseGoogleOAuthState(state.nonce);

    console.error("GOOGLE PASSPORT ERROR", {
      message: err?.message,
      code: err?.code,
      status: err?.status,
    });

    return hasAuthCookies(req) && req.query.code
      ? res.redirect(`${state.redirectOrigin}/dashboard`)
      : res.redirect(loginUrl);
  }

  if (!user) {
    await releaseGoogleOAuthState(state.nonce);
    return res.redirect(loginUrl);
  }

  (req as any).user = user;

  try {
    await googleCallback(req, res);
  } catch (error) {
    await releaseGoogleOAuthState(state.nonce);
    console.error("GOOGLE CALLBACK ROUTE ERROR", error);
    return res.redirect(loginUrl);
  }
};

/* ======================================
ROUTES
====================================== */

router.get("/google", oauthLimiter, safeHandler(googleAuth));

router.get(
  "/google/callback",
  oauthLimiter,
  handleGoogleCallback
);

export default router;
