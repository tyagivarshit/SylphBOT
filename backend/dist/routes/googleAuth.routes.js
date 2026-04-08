"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const redis_1 = __importDefault(require("../config/redis"));
const googleAuth_controller_1 = require("../controllers/googleAuth.controller");
const googleOAuthState_1 = require("../utils/googleOAuthState");
const router = (0, express_1.Router)();
/* ======================================
UTILS
====================================== */
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";
/* ======================================
OAUTH LIMITER (ATOMIC + SAFE)
====================================== */
const oauthLimiter = async (req, res, next) => {
    try {
        const ip = getIP(req);
        const key = `oauth:${ip}`;
        const multi = redis_1.default.multi();
        multi.incr(key);
        multi.ttl(key);
        const [[, count], [, ttl]] = (await multi.exec());
        if (ttl === -1) {
            await redis_1.default.expire(key, 60);
        }
        if (count > 20) {
            return res.status(429).json({
                success: false,
                message: "Too many OAuth attempts. Try again later.",
            });
        }
        next();
    }
    catch {
        return res.status(429).json({
            success: false,
            message: "Too many requests",
        });
    }
};
/* ======================================
SAFE WRAPPER
====================================== */
const safeHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(() => {
    return res.redirect(`${(0, googleOAuthState_1.getDefaultFrontendOrigin)()}/auth/login`);
});
const hasAuthCookies = (req) => Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);
const claimGoogleOAuthState = async (nonce) => {
    try {
        const result = await redis_1.default.set((0, googleOAuthState_1.getGoogleOAuthStateKey)(nonce), "processing", "EX", googleOAuthState_1.GOOGLE_OAUTH_STATE_TTL_SECONDS, "NX");
        return result === "OK";
    }
    catch (error) {
        console.error("GOOGLE OAUTH STATE CLAIM ERROR", error);
        return null;
    }
};
const releaseGoogleOAuthState = async (nonce) => {
    try {
        await redis_1.default.del((0, googleOAuthState_1.getGoogleOAuthStateKey)(nonce));
    }
    catch (error) {
        console.error("GOOGLE OAUTH STATE RELEASE ERROR", error);
    }
};
const authenticateGoogleUser = (req, res, next) => {
    return new Promise((resolve, reject) => {
        passport_1.default.authenticate("google", {
            session: false,
        }, (err, user) => {
            if (err) {
                return reject(err);
            }
            return resolve(user);
        })(req, res, next);
    });
};
const handleGoogleCallback = async (req, res, next) => {
    const state = (0, googleOAuthState_1.verifyGoogleOAuthState)(req.query.state);
    const loginUrl = `${(0, googleOAuthState_1.getDefaultFrontendOrigin)()}/auth/login`;
    if (!state) {
        return res.redirect(loginUrl);
    }
    const claimed = await claimGoogleOAuthState(state.nonce);
    // Browsers can replay the callback URL once cookies are already set.
    // Reuse the established session instead of re-spending the same auth code.
    if (claimed === false) {
        return hasAuthCookies(req)
            ? res.redirect(`${state.redirectOrigin}/dashboard`)
            : res.redirect(loginUrl);
    }
    let user;
    try {
        user = await authenticateGoogleUser(req, res, next);
    }
    catch (err) {
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
    req.user = user;
    try {
        await (0, googleAuth_controller_1.googleCallback)(req, res);
    }
    catch (error) {
        await releaseGoogleOAuthState(state.nonce);
        console.error("GOOGLE CALLBACK ROUTE ERROR", error);
        return res.redirect(loginUrl);
    }
};
/* ======================================
ROUTES
====================================== */
router.get("/google", oauthLimiter, safeHandler(googleAuth_controller_1.googleAuth));
router.get("/google/callback", oauthLimiter, handleGoogleCallback);
exports.default = router;
