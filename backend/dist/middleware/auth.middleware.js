"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const AppError_1 = require("../utils/AppError");
const crypto_1 = __importDefault(require("crypto"));
const performanceMetrics_1 = require("../observability/performanceMetrics");
const generateToken_1 = require("../utils/generateToken");
const authCookies_1 = require("../utils/authCookies");
const requestContext_1 = require("../observability/requestContext");
const tenant_service_1 = require("../services/tenant.service");
const securityGovernanceOS_service_1 = require("../services/security/securityGovernanceOS.service");
const AUTH_CONTEXT_CACHE_TTL_MS = 15000;
const SESSION_ANOMALY_RECHECK_MS = 10000;
const authContextCache = new Map();
const sessionAnomalyCheckedAt = new Map();
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const getUserWithBusiness = async (userId) => prisma_1.default.user.findUnique({
    where: { id: userId },
    select: {
        id: true,
        role: true,
        isActive: true,
        deletedAt: true,
        tokenVersion: true,
        email: true,
        businessId: true,
    },
});
const bindAuthenticatedContext = (req, user) => {
    req.user = user;
    req.businessId = user.businessId;
    req.tenant = {
        businessId: user.businessId,
    };
    (0, requestContext_1.updateRequestContext)({
        userId: user.id,
        businessId: user.businessId,
        tenantId: user.businessId,
    });
};
const getIpAddress = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";
const getUserAgent = (req) => {
    const value = req.headers["user-agent"];
    return Array.isArray(value) ? value[0] : String(value || "unknown");
};
const getSessionKeyFromRequest = (req) => {
    const refreshToken = req.cookies?.refreshToken;
    const accessToken = req.cookies?.accessToken;
    const raw = String(refreshToken || accessToken || req.requestId || "").trim();
    return raw ? hashToken(raw) : null;
};
const resolveBusinessId = async (input) => {
    const fastPathBusinessId = String(input.userBusinessId || "").trim() ||
        String(input.preferredBusinessId || "").trim() ||
        null;
    if (fastPathBusinessId) {
        return fastPathBusinessId;
    }
    const identity = await (0, tenant_service_1.resolveUserWorkspaceIdentity)({
        userId: input.userId,
        preferredBusinessId: input.preferredBusinessId || null,
        bootstrapWorkspaceIfMissing: false,
        persistResolvedBusinessId: false,
    });
    return identity.businessId;
};
const enforceSessionAnomalyGuard = async (req, input) => {
    const sessionKey = getSessionKeyFromRequest(req);
    if (!sessionKey) {
        return;
    }
    const now = Date.now();
    const lastCheckedAt = sessionAnomalyCheckedAt.get(sessionKey) || 0;
    if (now - lastCheckedAt < SESSION_ANOMALY_RECHECK_MS) {
        return;
    }
    sessionAnomalyCheckedAt.set(sessionKey, now);
    const anomaly = await (0, securityGovernanceOS_service_1.trackSessionAnomaly)({
        sessionKey,
        businessId: input.businessId,
        tenantId: input.businessId,
        userId: input.userId,
        ip: getIpAddress(req),
        userAgent: getUserAgent(req),
        deviceId: String(req.headers["x-device-id"] || "").trim() || null,
    }).catch(() => null);
    if (anomaly?.locked) {
        throw (0, AppError_1.unauthorized)("Session locked due to anomaly");
    }
    if (anomaly?.challengeRequired) {
        const challengeHeader = Array.isArray(req.headers["x-mfa-challenge"])
            ? req.headers["x-mfa-challenge"][0]
            : req.headers["x-mfa-challenge"];
        const challengeKey = String(challengeHeader || "").trim();
        if (!challengeKey) {
            throw (0, AppError_1.unauthorized)(`Suspicious login challenge required${anomaly?.challengeKey ? ` (${anomaly.challengeKey})` : ""}`);
        }
        const consumed = await (0, securityGovernanceOS_service_1.authorizeSuspiciousSessionChallenge)({
            challengeKey,
            userId: input.userId,
            sessionKey,
        }).catch(() => ({
            consumed: false,
            reason: "mfa_challenge_consume_failed",
        }));
        if (!consumed.consumed) {
            throw (0, AppError_1.unauthorized)("Suspicious login challenge not satisfied");
        }
    }
};
const protect = async (req, res, next) => {
    const startedAt = Date.now();
    try {
        if (req.user?.id && typeof req.user.role === "string") {
            bindAuthenticatedContext(req, {
                id: req.user.id,
                role: req.user.role,
                email: req.user.email,
                businessId: req.user.businessId || null,
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "AUTH_MS",
                value: Date.now() - startedAt,
                businessId: req.user.businessId || null,
                route: req.originalUrl,
                metadata: {
                    source: "prebound",
                },
            });
            return next();
        }
        if (process.env.NODE_ENV === "integration" &&
            process.env.INTEGRATION_AUTH_BYPASS === "true") {
            const testUserIdHeader = req.headers["x-test-user-id"];
            const testBusinessIdHeader = req.headers["x-test-business-id"];
            const testRoleHeader = req.headers["x-test-user-role"];
            const testUserId = Array.isArray(testUserIdHeader)
                ? testUserIdHeader[0]
                : testUserIdHeader;
            const testBusinessId = Array.isArray(testBusinessIdHeader)
                ? testBusinessIdHeader[0]
                : testBusinessIdHeader;
            const testRole = Array.isArray(testRoleHeader)
                ? testRoleHeader[0]
                : testRoleHeader;
            if (typeof testUserId === "string" &&
                testUserId.trim() &&
                typeof testBusinessId === "string" &&
                testBusinessId.trim()) {
                bindAuthenticatedContext(req, {
                    id: testUserId.trim(),
                    role: String(testRole || "OWNER").trim() || "OWNER",
                    businessId: testBusinessId.trim(),
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "AUTH_MS",
                    value: Date.now() - startedAt,
                    businessId: testBusinessId.trim(),
                    route: req.originalUrl,
                    metadata: {
                        source: "integration_bypass",
                    },
                });
                return next();
            }
        }
        const accessToken = req.cookies?.accessToken;
        const refreshToken = req.cookies?.refreshToken;
        if (!accessToken && !refreshToken) {
            throw (0, AppError_1.unauthorized)("Missing session");
        }
        if (accessToken) {
            const decoded = (0, generateToken_1.verifyAccessToken)(accessToken);
            const accessTokenKey = hashToken(accessToken);
            if (decoded?.id && typeof decoded.tokenVersion === "number") {
                const cachedContext = authContextCache.get(accessTokenKey);
                if (cachedContext &&
                    cachedContext.expiresAt > Date.now() &&
                    cachedContext.tokenVersion === decoded.tokenVersion) {
                    bindAuthenticatedContext(req, {
                        id: cachedContext.userId,
                        role: cachedContext.role,
                        email: cachedContext.email,
                        businessId: cachedContext.businessId,
                    });
                    await enforceSessionAnomalyGuard(req, {
                        userId: cachedContext.userId,
                        businessId: cachedContext.businessId,
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "CACHE_HIT",
                        businessId: cachedContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            cache: "auth_context",
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "AUTH_MS",
                        value: Date.now() - startedAt,
                        businessId: cachedContext.businessId,
                        route: req.originalUrl,
                        metadata: {
                            source: "access_token_cache",
                        },
                    });
                    return next();
                }
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "CACHE_MISS",
                    route: req.originalUrl,
                    metadata: {
                        cache: "auth_context",
                    },
                });
                const user = await getUserWithBusiness(decoded.id);
                if (user &&
                    user.isActive &&
                    !user.deletedAt &&
                    user.tokenVersion === decoded.tokenVersion) {
                    const businessId = await resolveBusinessId({
                        userId: user.id,
                        userBusinessId: user.businessId || null,
                        preferredBusinessId: decoded.businessId || null,
                    });
                    bindAuthenticatedContext(req, {
                        id: user.id,
                        role: user.role,
                        email: user.email,
                        businessId,
                    });
                    await enforceSessionAnomalyGuard(req, {
                        userId: user.id,
                        businessId,
                    });
                    authContextCache.set(accessTokenKey, {
                        userId: user.id,
                        role: user.role,
                        email: user.email,
                        businessId,
                        tokenVersion: user.tokenVersion,
                        expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "AUTH_MS",
                        value: Date.now() - startedAt,
                        businessId,
                        route: req.originalUrl,
                        metadata: {
                            source: "access_token_db",
                        },
                    });
                    return next();
                }
            }
        }
        if (!refreshToken) {
            throw (0, AppError_1.unauthorized)("Session expired");
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
        const businessId = await resolveBusinessId({
            userId: user.id,
            userBusinessId: user.businessId || null,
            preferredBusinessId: null,
        });
        const newAccessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, businessId, user.tokenVersion);
        res.cookie("accessToken", newAccessToken, {
            ...(0, authCookies_1.getAuthCookieOptions)(req),
            maxAge: 15 * 60 * 1000,
        });
        bindAuthenticatedContext(req, {
            id: user.id,
            role: user.role,
            email: user.email,
            businessId,
        });
        await enforceSessionAnomalyGuard(req, {
            userId: user.id,
            businessId,
        });
        authContextCache.set(hashToken(newAccessToken), {
            userId: user.id,
            role: user.role,
            email: user.email,
            businessId,
            tokenVersion: user.tokenVersion,
            expiresAt: Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId,
            route: req.originalUrl,
            metadata: {
                source: "refresh_token",
            },
        });
        return next();
    }
    catch (err) {
        return next(err);
    }
};
exports.protect = protect;
