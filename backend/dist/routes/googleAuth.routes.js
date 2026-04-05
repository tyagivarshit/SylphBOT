"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const redis_1 = require("../config/redis");
const googleAuth_controller_1 = require("../controllers/googleAuth.controller");
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
        const multi = redis_1.redis.multi();
        multi.incr(key);
        multi.ttl(key);
        const [[, count], [, ttl]] = (await multi.exec());
        if (ttl === -1) {
            await redis_1.redis.expire(key, 60);
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
    return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
});
/* ======================================
ROUTES
====================================== */
router.get("/google", oauthLimiter, safeHandler(googleAuth_controller_1.googleAuth));
router.get("/google/callback", oauthLimiter, passport_1.default.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/auth/login`,
}), safeHandler(googleAuth_controller_1.googleCallback));
exports.default = router;
