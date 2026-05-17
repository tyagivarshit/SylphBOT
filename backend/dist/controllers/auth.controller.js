"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getMe = exports.resetPassword = exports.forgotPassword = exports.resendVerificationEmail = exports.verifyEmail = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = __importDefault(require("../config/redis"));
const redis_2 = require("../config/redis");
const generateToken_1 = require("../utils/generateToken");
const authEmail_queue_1 = require("../queues/authEmail.queue");
const AppError_1 = require("../utils/AppError");
const authCookies_1 = require("../utils/authCookies");
const audit_service_1 = require("../services/audit.service");
const securityAlert_service_1 = require("../services/securityAlert.service");
const securityGovernanceOS_service_1 = require("../services/security/securityGovernanceOS.service");
const authBootstrap_service_1 = require("../services/authBootstrap.service");
const distributedLock_service_1 = require("../services/distributedLock.service");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const auth_middleware_1 = require("../middleware/auth.middleware");
/* ======================================
UTILS
====================================== */
const getIP = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
const getUA = (req) => req.headers["user-agent"] || "unknown";
const hashToken = (token) => crypto_1.default.createHash("sha256").update(token).digest("hex");
const normalizeEmail = (email) => email.trim().toLowerCase();
const verifyPassword = async (plainTextPassword, storedHash) => {
    try {
        return await bcryptjs_1.default.compare(plainTextPassword, storedHash);
    }
    catch {
        return false;
    }
};
const isStrongPassword = (password) => /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(password);
const LOGIN_SESSION_LEDGER_TIMEOUT_MS = 400;
const AUTH_ME_FALLBACK_QUERY_TIMEOUT_MS = 700;
const LOGIN_REFRESH_TOKEN_TIMEOUT_MS = 1800;
const LOGIN_BACKGROUND_TASK_TIMEOUT_MS = 1200;
const LOGIN_LIFECYCLE_LOCK_TTL_MS = 15000;
const LOGIN_LIFECYCLE_LOCK_WAIT_MS = 1200;
const LOGIN_LIFECYCLE_LOCK_POLL_MS = 60;
const buildLoginLifecycleLockKey = (input) => {
    const stableIdentity = String(input.userId || "").trim() || String(input.email || "").trim().toLowerCase();
    const fingerprint = hashToken(`${stableIdentity}:${String(input.ip || "").trim()}:${String(input.userAgent || "").trim()}`);
    return `auth:login:lifecycle:${fingerprint.slice(0, 28)}`;
};
const withFastTimeout = async (task, timeoutMs) => {
    let timeoutHandle = null;
    try {
        return await Promise.race([
            task,
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error("auth_operation_timeout"));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};
const runDetachedAuthTask = (label, task) => {
    setTimeout(() => {
        void task().catch((error) => {
            console.warn("AUTH_BACKGROUND_TASK_FAILED", {
                label,
                reason: String(error?.message || "auth_background_task_failed"),
            });
        });
    }, 20);
};
/* ======================================
RATE LIMIT
====================================== */
const checkGlobalLimit = async (ip) => {
    if (!(0, redis_2.isRedisHealthy)() || !(0, redis_2.isRedisWritable)()) {
        return;
    }
    const key = `global:${ip}`;
    try {
        const count = await withFastTimeout(redis_1.default.incr(key), 350);
        if (count === 1) {
            await withFastTimeout(redis_1.default.expire(key, 60), 350);
        }
        if (count > 60) {
            throw (0, AppError_1.tooManyRequests)("Too many requests");
        }
    }
    catch (error) {
        if (error?.code === "RATE_LIMIT" ||
            error?.statusCode === 429) {
            throw error;
        }
        // Fail open when Redis is degraded so auth endpoints remain responsive.
        return;
    }
};
/* ======================================
COOKIE CONFIG (PRODUCTION GRADE)
====================================== */
/* ======================================
SET COOKIES
====================================== */
const setCookies = (req, res, access, refresh) => {
    (0, authCookies_1.setAuthCookies)(res, req, access, refresh);
};
const writeAuthAuditLog = (req, input) => (0, audit_service_1.createAuditLog)({
    action: input.action,
    userId: input.userId || null,
    businessId: input.businessId || null,
    metadata: input.metadata || {},
    ip: getIP(req),
    userAgent: String(getUA(req)),
    requestId: req.requestId || null,
});
const pruneRefreshTokens = async (userId, retainCount = 4) => {
    const staleTokens = await prisma_1.default.refreshToken.findMany({
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
    await prisma_1.default.refreshToken.deleteMany({
        where: {
            id: {
                in: staleTokens.map((token) => token.id),
            },
        },
    });
};
/* ======================================
REGISTER
====================================== */
const register = async (req, res, next) => {
    const startedAt = Date.now();
    try {
        await checkGlobalLimit(getIP(req));
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(String(req.body.email || ""));
        const password = String(req.body.password || "");
        if (!name || !email || !password || !isStrongPassword(password)) {
            throw (0, AppError_1.badRequest)("Password must be at least 8 characters and include uppercase, lowercase, and a number");
        }
        const hashed = await bcryptjs_1.default.hash(password, 12);
        const rawToken = crypto_1.default.randomBytes(32).toString("hex");
        const verifyToken = hashToken(rawToken);
        const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const existingUser = await prisma_1.default.user.findUnique({
            where: { email },
            select: {
                id: true,
                isVerified: true,
            },
        });
        if (existingUser?.isVerified) {
            throw (0, AppError_1.conflict)("Email already exists");
        }
        if (existingUser) {
            await prisma_1.default.user.update({
                where: { id: existingUser.id },
                data: {
                    name,
                    password: hashed,
                    verifyToken,
                    verifyTokenExpiry,
                },
            });
        }
        else {
            await prisma_1.default.user.create({
                data: {
                    name,
                    email,
                    password: hashed,
                    verifyToken,
                    verifyTokenExpiry,
                },
            });
        }
        const verifyLink = `${env_1.env.FRONTEND_URL}/auth/verify-email?token=${rawToken}`;
        res.status(201).json({
            success: true,
            verificationRequired: true,
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            route: "auth.register",
            metadata: {
                status: "verification_required",
            },
        });
        void (0, authEmail_queue_1.scheduleVerificationEmail)(email, verifyLink);
    }
    catch (err) {
        next(err);
    }
};
exports.register = register;
/* ======================================
LOGIN
====================================== */
const login = async (req, res, next) => {
    const startedAt = Date.now();
    try {
        (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
            req,
            res,
            stage: "auth.login.start",
        });
        const ip = getIP(req);
        const userAgent = String(getUA(req));
        await checkGlobalLimit(ip);
        const email = normalizeEmail(String(req.body.email || ""));
        const password = String(req.body.password || "");
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user ||
            user.deletedAt ||
            !user.isActive ||
            !user.isVerified ||
            !(await verifyPassword(password, user.password))) {
            void writeAuthAuditLog(req, {
                action: "auth.login_failed",
                userId: user?.id || null,
                businessId: user?.businessId || null,
                metadata: {
                    email,
                },
            });
            void (0, securityAlert_service_1.recordFailedLoginAttempt)({
                businessId: user?.businessId || null,
                userId: user?.id || null,
                email,
                ip,
            });
            void (0, securityGovernanceOS_service_1.recordFraudSignal)({
                businessId: user?.businessId || null,
                tenantId: user?.businessId || null,
                signalType: "credential_stuffing",
                actorId: user?.id || email,
                ipFingerprint: hashToken(ip).slice(0, 20),
                severity: "MEDIUM",
                metadata: {
                    email,
                    route: req.originalUrl,
                },
            }).catch(() => undefined);
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_terminal_failure",
                value: Date.now() - startedAt,
                businessId: user?.businessId || null,
                route: "auth.login",
                metadata: {
                    reason: "invalid_credentials",
                },
            });
            throw (0, AppError_1.unauthorized)("Invalid credentials");
        }
        (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
            req,
            res,
            stage: "auth.login.verified",
        });
        const resolvedUser = {
            id: user.id,
            role: user.role,
            tokenVersion: user.tokenVersion,
            email: user.email,
            name: user.name,
        };
        const businessId = user.businessId || null;
        const lockKey = buildLoginLifecycleLockKey({
            userId: resolvedUser.id,
            email,
            ip,
            userAgent,
        });
        const loginResult = await (0, distributedLock_service_1.withDistributedLock)({
            key: lockKey,
            ttlMs: LOGIN_LIFECYCLE_LOCK_TTL_MS,
            waitMs: LOGIN_LIFECYCLE_LOCK_WAIT_MS,
            pollMs: LOGIN_LIFECYCLE_LOCK_POLL_MS,
            onUnavailable: async () => null,
            run: async () => {
                const accessToken = (0, generateToken_1.generateAccessToken)(resolvedUser.id, resolvedUser.role, businessId, resolvedUser.tokenVersion);
                const refreshRaw = (0, generateToken_1.generateRefreshToken)(resolvedUser.id, resolvedUser.tokenVersion);
                const hashedRefreshToken = hashToken(refreshRaw);
                await withFastTimeout(prisma_1.default.refreshToken.create({
                    data: {
                        token: hashedRefreshToken,
                        userId: resolvedUser.id,
                        userAgent,
                        ip,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    },
                }), LOGIN_REFRESH_TOKEN_TIMEOUT_MS);
                (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
                    req,
                    res,
                    stage: "auth.login.session_persisted",
                });
                (0, auth_middleware_1.primeAuthContextCacheForToken)({
                    accessToken,
                    userId: resolvedUser.id,
                    role: resolvedUser.role,
                    tokenVersion: resolvedUser.tokenVersion,
                    email: resolvedUser.email,
                    businessId,
                });
                void writeAuthAuditLog(req, {
                    action: "auth.login",
                    userId: resolvedUser.id,
                    businessId,
                    metadata: {
                        email: resolvedUser.email,
                        role: resolvedUser.role,
                    },
                });
                if ((0, requestLifecycle_1.isRequestLifecycleAborted)({ req, res }) || res.headersSent || res.writableEnded) {
                    return {
                        completed: false,
                    };
                }
                setCookies(req, res, accessToken, refreshRaw);
                res.json({
                    success: true,
                    user: {
                        id: resolvedUser.id,
                        email: resolvedUser.email,
                        name: resolvedUser.name,
                        businessId,
                    },
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "AUTH_MS",
                    value: Date.now() - startedAt,
                    businessId,
                    route: "auth.login",
                    metadata: {
                        source: "password",
                    },
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "auth_bootstrap_ms",
                    value: Date.now() - startedAt,
                    businessId,
                    route: "auth.login",
                    metadata: {
                        stage: "response_committed",
                        source: "password",
                    },
                });
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "auth_session_ready",
                    value: Date.now() - startedAt,
                    businessId,
                    route: "auth.login",
                    metadata: {
                        stage: "session_persisted",
                        source: "password",
                    },
                });
                runDetachedAuthTask("auth.login.prune_refresh_tokens", async () => {
                    await withFastTimeout(pruneRefreshTokens(resolvedUser.id, 4), LOGIN_BACKGROUND_TASK_TIMEOUT_MS);
                });
                runDetachedAuthTask("auth.login.session_ledger", async () => {
                    await withFastTimeout((0, securityGovernanceOS_service_1.issueSessionLedger)({
                        businessId,
                        tenantId: businessId,
                        userId: resolvedUser.id,
                        sessionKey: hashedRefreshToken,
                        ip,
                        userAgent,
                        deviceId: String(req.headers["x-device-id"] || "").trim() || null,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        metadata: {
                            source: "auth.login",
                        },
                    }), Math.max(LOGIN_SESSION_LEDGER_TIMEOUT_MS, LOGIN_BACKGROUND_TASK_TIMEOUT_MS));
                });
                (0, authBootstrap_service_1.primeAuthBootstrapContext)({
                    userId: resolvedUser.id,
                    preferredBusinessId: businessId,
                    profileSeed: {
                        email: resolvedUser.email,
                        name: resolvedUser.name,
                        avatar: user.avatar || null,
                    },
                }, {
                    shouldRun: () => !(0, requestLifecycle_1.isRequestLifecycleAborted)({ req, res }),
                });
                return {
                    completed: true,
                };
            },
        });
        if (!loginResult) {
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_duplicate_login_blocked",
                value: Date.now() - startedAt,
                businessId,
                route: "auth.login",
                metadata: {
                    reason: "inflight_lock_unavailable",
                    lockKey,
                },
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_processing_state",
                value: Date.now() - startedAt,
                businessId,
                route: "auth.login",
                metadata: {
                    state: "PROCESSING",
                    reason: "login_inflight",
                },
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "auth_inflight_reused",
                value: Date.now() - startedAt,
                businessId,
                route: "auth.login",
                metadata: {
                    source: "distributed_lock",
                },
            });
            return res.status(202).json({
                success: false,
                processing: true,
                retryable: true,
                code: "AUTH_LOGIN_PROCESSING",
                message: "Login is still processing. Please wait a moment and retry.",
            });
        }
        if (!loginResult.completed) {
            return;
        }
    }
    catch (err) {
        next(err);
    }
};
exports.login = login;
/* ======================================
VERIFY EMAIL
====================================== */
const verifyEmail = async (req, res, next) => {
    try {
        const rawToken = String(req.query.token || "").trim();
        if (!rawToken) {
            throw (0, AppError_1.badRequest)("Verification token is required");
        }
        const token = hashToken(rawToken);
        let onboardingEmailTarget = null;
        const user = await prisma_1.default.user.findFirst({
            where: {
                verifyToken: token,
                verifyTokenExpiry: { gt: new Date() },
            },
            select: {
                id: true,
            },
        });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired verification link",
            });
        }
        await (0, distributedLock_service_1.withDistributedLock)({
            key: `auth:verify-email:${user.id}`,
            ttlMs: 15000,
            waitMs: 5000,
            pollMs: 75,
            run: async () => {
                const current = await prisma_1.default.user.findUnique({
                    where: {
                        id: user.id,
                    },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        avatar: true,
                        businessId: true,
                        isVerified: true,
                    },
                });
                if (!current) {
                    return;
                }
                const shouldSendOnboardingEmail = !current.isVerified;
                const updatedUser = current.isVerified
                    ? current
                    : await prisma_1.default.user.update({
                        where: { id: current.id },
                        data: {
                            isVerified: true,
                            verifyToken: null,
                            verifyTokenExpiry: null,
                        },
                        select: {
                            id: true,
                            email: true,
                            name: true,
                            avatar: true,
                            businessId: true,
                            isVerified: true,
                        },
                    });
                const bootstrap = await (0, authBootstrap_service_1.ensureAuthBootstrapContext)({
                    userId: updatedUser.id,
                    preferredBusinessId: updatedUser.businessId || null,
                    profileSeed: {
                        email: updatedUser.email,
                        name: updatedUser.name,
                        avatar: updatedUser.avatar || null,
                    },
                });
                if (shouldSendOnboardingEmail && updatedUser.email) {
                    onboardingEmailTarget = {
                        email: updatedUser.email,
                        workspaceName: bootstrap.identity.workspace?.name || null,
                    };
                }
            },
        });
        if (onboardingEmailTarget?.email) {
            void (0, authEmail_queue_1.scheduleOnboardingEmail)(onboardingEmailTarget.email, onboardingEmailTarget.workspaceName);
        }
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
};
exports.verifyEmail = verifyEmail;
/* ======================================
RESEND VERIFICATION
====================================== */
const resendVerificationEmail = async (req, res, next) => {
    try {
        const email = normalizeEmail(String(req.body.email || ""));
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user || user.isVerified)
            return res.json({ success: true });
        const raw = crypto_1.default.randomBytes(32).toString("hex");
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                verifyToken: hashToken(raw),
                verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        await (0, authEmail_queue_1.scheduleVerificationEmail)(email, `${env_1.env.FRONTEND_URL}/auth/verify-email?token=${raw}`);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
};
exports.resendVerificationEmail = resendVerificationEmail;
/* ======================================
FORGOT PASSWORD
====================================== */
const forgotPassword = async (req, res, next) => {
    try {
        const email = normalizeEmail(String(req.body.email || ""));
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user)
            return res.json({ success: true });
        const raw = crypto_1.default.randomBytes(32).toString("hex");
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                resetToken: hashToken(raw),
                resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
            },
        });
        await (0, authEmail_queue_1.schedulePasswordResetEmail)(email, `${env_1.env.FRONTEND_URL}/auth/reset-password?token=${raw}`);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
};
exports.forgotPassword = forgotPassword;
/* ======================================
RESET PASSWORD
====================================== */
const resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;
        if (!token || !password || !isStrongPassword(password)) {
            throw (0, AppError_1.badRequest)("Password must be at least 8 characters and include uppercase, lowercase, and a number");
        }
        const user = await prisma_1.default.user.findFirst({
            where: {
                resetToken: hashToken(token),
                resetTokenExpiry: { gt: new Date() },
            },
        });
        if (!user)
            throw (0, AppError_1.badRequest)("Invalid token");
        await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                password: await bcryptjs_1.default.hash(password, 12),
                resetToken: null,
                resetTokenExpiry: null,
                tokenVersion: { increment: 1 },
            },
        });
        await prisma_1.default.refreshToken.deleteMany({
            where: { userId: user.id },
        });
        void writeAuthAuditLog(req, {
            action: "auth.password_reset",
            userId: user.id,
            businessId: user.businessId || null,
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
};
exports.resetPassword = resetPassword;
/* ======================================
GET ME
====================================== */
const getMe = async (req, res, next) => {
    const startedAt = Date.now();
    try {
        (0, requestLifecycle_1.throwIfRequestLifecycleAborted)({
            req,
            res,
            stage: "auth.me.start",
        });
        if (!req.user?.id)
            throw (0, AppError_1.unauthorized)("Not authenticated");
        let payload = {
            id: String(req.user.id),
            name: "Workspace User",
            email: String(req.user?.email || ""),
            role: String(req.user?.role || "AGENT"),
            businessId: String(req.user?.businessId || "").trim() || null,
        };
        if ((payload.businessId == null || !payload.email || payload.name === "Workspace User") &&
            (0, requestLifecycle_1.getRequestRemainingMs)({ req, res }, 0) > AUTH_ME_FALLBACK_QUERY_TIMEOUT_MS + 150) {
            const fallbackUser = await prisma_1.default.user
                .findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    businessId: true,
                },
            })
                .catch(() => null);
            if (fallbackUser) {
                payload = {
                    id: fallbackUser.id,
                    name: fallbackUser.name,
                    email: fallbackUser.email,
                    role: fallbackUser.role,
                    businessId: fallbackUser.businessId || null,
                };
            }
        }
        if ((0, requestLifecycle_1.isRequestLifecycleAborted)({ req, res }) || res.headersSent || res.writableEnded) {
            return;
        }
        (0, authBootstrap_service_1.primeAuthBootstrapContext)({
            userId: String(req.user.id),
            preferredBusinessId: payload.businessId,
            profileSeed: {
                email: payload.email || null,
                name: payload.name || null,
            },
        }, {
            shouldRun: () => !(0, requestLifecycle_1.isRequestLifecycleAborted)({ req, res }),
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
            success: true,
            user: payload,
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId: payload.businessId,
            route: "auth.me",
        });
    }
    catch (err) {
        next(err);
    }
};
exports.getMe = getMe;
/* ======================================
LOGOUT
====================================== */
const logout = async (req, res, next) => {
    const startedAt = Date.now();
    try {
        await prisma_1.default.refreshToken.deleteMany({
            where: { userId: req.user.id },
        });
        void writeAuthAuditLog(req, {
            action: "auth.logout",
            userId: req.user?.id || null,
            businessId: req.user?.businessId || null,
        });
        (0, authCookies_1.clearAuthCookies)(res, req);
        res.json({ success: true });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId: req.user?.businessId || null,
            route: "auth.logout",
        });
    }
    catch (err) {
        next(err);
    }
};
exports.logout = logout;
