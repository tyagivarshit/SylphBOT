"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const AppError_1 = require("../utils/AppError");
const crypto_1 = __importDefault(require("crypto"));
const generateToken_1 = require("../utils/generateToken");
const authCookies_1 = require("../utils/authCookies");
/* ======================================
UTILS
====================================== */
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
/* ======================================
GET USER
====================================== */
const getUserWithBusiness = async (userId) => {
    return prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true,
            isActive: true,
            tokenVersion: true,
            businessId: true,
        },
    });
};
/* ======================================
PROTECT MIDDLEWARE (FINAL FIXED)
====================================== */
const protect = async (req, res, next) => {
    try {
        const accessToken = req.cookies?.accessToken;
        const refreshToken = req.cookies?.refreshToken;
        console.log("🍪 Cookies:", req.cookies);
        if (!accessToken && !refreshToken) {
            throw (0, AppError_1.unauthorized)("Not authorized");
        }
        /* =============================
        ACCESS TOKEN (FAST PATH)
        ============================= */
        if (accessToken) {
            try {
                const decoded = jsonwebtoken_1.default.verify(accessToken, env_1.env.JWT_SECRET);
                // 🔥 token type check (bonus security)
                if (decoded.type !== "access") {
                    throw (0, AppError_1.unauthorized)("Invalid token type");
                }
                const user = await getUserWithBusiness(decoded.id);
                if (!user ||
                    !user.isActive ||
                    user.tokenVersion !== decoded.tokenVersion) {
                    throw (0, AppError_1.unauthorized)("Invalid session");
                }
                req.user = {
                    id: user.id,
                    role: user.role,
                    businessId: user.businessId || null,
                };
                return next();
            }
            catch (err) {
                if (err.name !== "TokenExpiredError") {
                    throw (0, AppError_1.unauthorized)("Invalid access token");
                }
                // expired → go to refresh flow
            }
        }
        /* =============================
        REFRESH TOKEN FLOW
        ============================= */
        if (!refreshToken) {
            throw (0, AppError_1.unauthorized)("Session expired");
        }
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(refreshToken, env_1.env.JWT_REFRESH_SECRET);
            if (decoded.type !== "refresh") {
                throw (0, AppError_1.unauthorized)("Invalid token type");
            }
        }
        catch {
            (0, authCookies_1.clearAuthCookies)(res, req);
            throw (0, AppError_1.unauthorized)("Invalid refresh token");
        }
        const hashed = hashToken(refreshToken);
        const dbToken = await prisma_1.default.refreshToken.findFirst({
            where: {
                token: hashed,
                userId: decoded.id,
                expiresAt: { gt: new Date() },
            },
        });
        if (!dbToken) {
            (0, authCookies_1.clearAuthCookies)(res, req);
            throw (0, AppError_1.unauthorized)("Session expired");
        }
        const user = await getUserWithBusiness(decoded.id);
        if (!user ||
            !user.isActive ||
            user.tokenVersion !== decoded.tokenVersion) {
            (0, authCookies_1.clearAuthCookies)(res, req);
            throw (0, AppError_1.unauthorized)("Invalid session");
        }
        /* =============================
        NEW ACCESS TOKEN
        ============================= */
        const newAccessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, user.businessId || null, user.tokenVersion);
        res.cookie("accessToken", newAccessToken, {
            ...(0, authCookies_1.getAuthCookieOptions)(req),
            maxAge: 15 * 60 * 1000,
        });
        req.user = {
            id: user.id,
            role: user.role,
            businessId: user.businessId || null,
        };
        return next();
    }
    catch (err) {
        return next(err);
    }
};
exports.protect = protect;
