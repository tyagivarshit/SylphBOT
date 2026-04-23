"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const AppError_1 = require("../utils/AppError");
const crypto_1 = __importDefault(require("crypto"));
const generateToken_1 = require("../utils/generateToken");
const authCookies_1 = require("../utils/authCookies");
const requestContext_1 = require("../observability/requestContext");
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const getUserWithBusiness = async (userId) => prisma_1.default.user.findUnique({
    where: { id: userId },
    select: {
        id: true,
        role: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
        businessId: true,
        email: true,
        business: {
            select: {
                id: true,
                deletedAt: true,
            },
        },
    },
});
const resolveActiveBusinessId = (user) => {
    if (!user.businessId) {
        return null;
    }
    if (!user.business) {
        return null;
    }
    if (user.business?.deletedAt) {
        return null;
    }
    return user.businessId;
};
const bindAuthenticatedContext = (req, user) => {
    req.user = user;
    req.businessId = user.businessId;
    req.tenant = {
        businessId: user.businessId,
    };
    (0, requestContext_1.updateRequestContext)({
        userId: user.id,
        businessId: user.businessId,
    });
};
const getAuthorizationHeader = (value) => {
    if (Array.isArray(value)) {
        return value.find((entry) => typeof entry === "string" && entry.trim()) || null;
    }
    return typeof value === "string" && value.trim() ? value : null;
};
const getBearerToken = (authorizationHeader) => {
    const value = String(authorizationHeader || "").trim();
    if (!value) {
        return null;
    }
    const [scheme, ...tokenParts] = value.split(" ");
    const token = tokenParts.join(" ").trim();
    if (!/^Bearer$/i.test(scheme) || !token) {
        return null;
    }
    return token;
};
const protect = async (req, res, next) => {
    try {
        const authorizationHeader = getAuthorizationHeader(req.headers.authorization);
        const bearerToken = getBearerToken(authorizationHeader);
        const accessToken = req.cookies?.accessToken || bearerToken;
        const refreshToken = req.cookies?.refreshToken;
        if (!accessToken && !refreshToken) {
            throw (0, AppError_1.unauthorized)("Missing Authorization bearer token or session");
        }
        if (authorizationHeader && !bearerToken && !req.cookies?.accessToken) {
            throw (0, AppError_1.unauthorized)("Invalid Authorization header");
        }
        if (accessToken) {
            const decoded = (0, generateToken_1.verifyAccessToken)(accessToken);
            if (decoded?.id && typeof decoded.tokenVersion === "number") {
                const user = await getUserWithBusiness(decoded.id);
                if (user &&
                    user.isActive &&
                    !user.deletedAt &&
                    user.tokenVersion === decoded.tokenVersion) {
                    bindAuthenticatedContext(req, {
                        id: user.id,
                        role: user.role,
                        email: user.email,
                        businessId: resolveActiveBusinessId(user),
                    });
                    return next();
                }
            }
        }
        if (!refreshToken) {
            throw (0, AppError_1.unauthorized)(bearerToken ? "Invalid Authorization bearer token" : "Session expired");
        }
        const decoded = (0, generateToken_1.verifyRefreshToken)(refreshToken);
        if (!decoded?.id || typeof decoded.tokenVersion !== "number") {
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
            user.deletedAt ||
            user.tokenVersion !== decoded.tokenVersion) {
            (0, authCookies_1.clearAuthCookies)(res, req);
            throw (0, AppError_1.unauthorized)("Invalid session");
        }
        const newAccessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, resolveActiveBusinessId(user), user.tokenVersion);
        res.cookie("accessToken", newAccessToken, {
            ...(0, authCookies_1.getAuthCookieOptions)(req),
            maxAge: 15 * 60 * 1000,
        });
        bindAuthenticatedContext(req, {
            id: user.id,
            role: user.role,
            email: user.email,
            businessId: resolveActiveBusinessId(user),
        });
        return next();
    }
    catch (err) {
        return next(err);
    }
};
exports.protect = protect;
