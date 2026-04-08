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
const authCookies_1 = require("../utils/authCookies");
const googleOAuthState_1 = require("../utils/googleOAuthState");
/* ======================================
UTILS
====================================== */
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const buildAuthErrorUrl = (redirectOrigin, authError) => {
    const url = new URL("/auth/login", redirectOrigin);
    url.searchParams.set("authError", authError);
    return url.toString();
};
/* ======================================
GOOGLE INIT
====================================== */
const googleAuth = (req, res, next) => {
    try {
        const redirectOrigin = (0, googleOAuthState_1.resolveGoogleOAuthRedirectOrigin)(typeof req.query.redirectTo === "string"
            ? req.query.redirectTo
            : String(req.headers.referer ||
                req.headers.origin ||
                (0, googleOAuthState_1.getDefaultFrontendOrigin)()));
        const state = (0, googleOAuthState_1.createGoogleOAuthState)(redirectOrigin);
        passport_1.default.authenticate("google", {
            scope: ["profile", "email"],
            state,
            session: false,
        })(req, res, next);
    }
    catch {
        return res.redirect(buildAuthErrorUrl((0, googleOAuthState_1.getDefaultFrontendOrigin)(), "oauth_failed"));
    }
};
exports.googleAuth = googleAuth;
/* ======================================
GOOGLE CALLBACK
====================================== */
const googleCallback = async (req, res) => {
    try {
        const user = req.user;
        const state = (0, googleOAuthState_1.verifyGoogleOAuthState)(req.query.state);
        const redirectOrigin = state?.redirectOrigin || (0, googleOAuthState_1.getDefaultFrontendOrigin)();
        /* ======================================
        STATE VALIDATION
        ====================================== */
        if (!state) {
            console.warn("OAuth state mismatch");
            return res.redirect(buildAuthErrorUrl((0, googleOAuthState_1.getDefaultFrontendOrigin)(), "oauth_state_invalid"));
        }
        if (!user || !user.id || !user.isActive) {
            return res.redirect(buildAuthErrorUrl(redirectOrigin, user?.id ? "account_inactive" : "oauth_failed"));
        }
        const result = await prisma_1.default.$transaction(async (tx) => {
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
            const accessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, business.id, user.tokenVersion);
            const refreshRaw = (0, generateToken_1.generateRefreshToken)(user.id, user.tokenVersion);
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
        (0, authCookies_1.setAuthCookies)(res, req, result.accessToken, result.refreshRaw);
        console.log("GOOGLE LOGIN SUCCESS", {
            userId: user.id,
            businessId: result.businessId,
        });
        return res.redirect(`${redirectOrigin}/dashboard`);
    }
    catch (err) {
        console.error("GOOGLE CALLBACK ERROR", err);
        return res.redirect(buildAuthErrorUrl((0, googleOAuthState_1.getDefaultFrontendOrigin)(), "oauth_failed"));
    }
};
exports.googleCallback = googleCallback;
