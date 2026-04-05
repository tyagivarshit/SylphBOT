"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleCallback = exports.googleAuth = void 0;
const passport_1 = __importDefault(require("passport"));
const prisma_1 = __importDefault(require("../config/prisma"));
const crypto_1 = __importDefault(require("crypto"));
const generateToken_1 = require("../utils/generateToken");
const isProd = process.env.NODE_ENV === "production";
/* ======================================
UTILS
====================================== */
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
/* 🔥 COOKIE OPTIONS */
const getCookieOptions = () => ({
    httpOnly: true,
    secure: false, // localhost fix
    sameSite: "lax",
    path: "/",
});
/* ======================================
GOOGLE INIT
====================================== */
const googleAuth = (req, res, next) => {
    try {
        const state = crypto_1.default.randomBytes(32).toString("hex");
        res.cookie("oauth_state", state, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 10 * 60 * 1000,
        });
        passport_1.default.authenticate("google", {
            scope: ["profile", "email"],
            state,
            session: false,
        })(req, res, next);
    }
    catch {
        return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }
};
exports.googleAuth = googleAuth;
/* ======================================
GOOGLE CALLBACK
====================================== */
const googleCallback = async (req, res) => {
    try {
        const user = req.user;
        const stateFromGoogle = req.query.state;
        const stateFromCookie = req.cookies?.oauth_state;
        /* ======================================
        STATE VALIDATION
        ====================================== */
        if (!stateFromGoogle || stateFromGoogle !== stateFromCookie) {
            console.warn("⚠️ OAuth state mismatch");
            return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
        }
        res.clearCookie("oauth_state");
        if (!user || !user.id || !user.isActive) {
            return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
        }
        const result = await prisma_1.default.$transaction(async (tx) => {
            /* ======================================
            🔥 BUSINESS CHECK / CREATE (FIXED)
            ====================================== */
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
            /* ======================================
            🔥 TOKENS
            ====================================== */
            const accessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, business.id, user.tokenVersion);
            const refreshRaw = (0, generateToken_1.generateRefreshToken)(user.id, user.tokenVersion);
            const refreshToken = hashToken(refreshRaw);
            /* SESSION LIMIT */
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
        /* ======================================
        SET COOKIES
        ====================================== */
        const cookieOptions = getCookieOptions();
        res.cookie("accessToken", result.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000,
        });
        res.cookie("refreshToken", result.refreshRaw, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        console.log("✅ GOOGLE LOGIN SUCCESS", {
            userId: user.id,
            businessId: result.businessId,
        });
        /* ======================================
        🔥 FINAL REDIRECT (FIXED)
        ====================================== */
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    }
    catch (err) {
        console.error("❌ GOOGLE CALLBACK ERROR", err);
        return res.redirect(`${process.env.FRONTEND_URL}/auth/login`);
    }
};
exports.googleCallback = googleCallback;
