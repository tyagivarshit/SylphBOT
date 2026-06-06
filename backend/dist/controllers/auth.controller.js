"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getMe = exports.resetPassword = exports.forgotPassword = exports.resendVerificationEmail = exports.verifyEmail = exports.login = exports.register = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptWorker_1 = require("../utils/bcryptWorker");
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
const startupIsolation_service_1 = require("../runtime/startupIsolation.service");
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
    return (0, bcryptWorker_1.verifyPasswordWorker)(plainTextPassword, storedHash);
};
const extractBcryptCost = (storedHash) => {
    const match = /^\$2[abxy]\$(\d{2})\$/.exec(String(storedHash || "").trim());
    if (!match) {
        return null;
    }
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return Math.max(0, Math.floor(parsed));
};
const isStrongPassword = (password) => /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/.test(password);
const LOGIN_SESSION_LEDGER_TIMEOUT_MS = 400;
const AUTH_ME_FALLBACK_QUERY_TIMEOUT_MS = 700;
const LOGIN_REFRESH_TOKEN_TIMEOUT_MS = 1800;
const LOGIN_BACKGROUND_TASK_TIMEOUT_MS = 1200;
const LOGIN_LIFECYCLE_LOCK_TTL_MS = 15000;
const LOGIN_LIFECYCLE_LOCK_WAIT_MS = 450;
const LOGIN_LIFECYCLE_LOCK_POLL_MS = 60;
const LOGIN_PASSWORD_VERIFY_BASE_BUDGET_MS = 900;
const LOGIN_DB_PERSISTENCE_BASE_BUDGET_MS = 1800;
const LOGIN_LIFECYCLE_LOCK_BASE_BUDGET_MS = LOGIN_LIFECYCLE_LOCK_WAIT_MS;
const LOGIN_TOKEN_ISSUE_BASE_BUDGET_MS = 220;
const LOGIN_RESPONSE_COMMIT_BASE_BUDGET_MS = 320;
const LOGIN_ADAPTIVE_BUDGET_MAX_MULTIPLIER = 2.4;
const LOGIN_ADAPTIVE_BUDGET_MIN_MULTIPLIER = 1;
const LOGIN_PROCESSING_RETRY_AFTER_BASE_MS = 280;
const LOGIN_PROCESSING_RETRY_AFTER_MAX_MS = 1000;
class LoginStageTimeoutError extends Error {
    constructor(stage, budgetMs, elapsedMs) {
        super(`auth_stage_timeout:${stage}:${budgetMs}:${elapsedMs}`);
        this.name = "LoginStageTimeoutError";
        this.stage = stage;
        this.budgetMs = budgetMs;
        this.elapsedMs = elapsedMs;
    }
}
const buildLoginLifecycleLockKey = (input) => {
    const stableIdentity = String(input.userId || "").trim() || String(input.email || "").trim().toLowerCase();
    const fingerprint = hashToken(`${stableIdentity}:${String(input.ip || "").trim()}:${String(input.userAgent || "").trim()}`);
    return `auth:login:lifecycle:${fingerprint.slice(0, 28)}`;
};
const asNumber = (value, fallbackValue = 0) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }
    return parsed;
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const withShortTimeout = async (task, timeoutMs, timeoutMessage) => {
    let timeoutHandle = null;
    try {
        return await Promise.race([
            task,
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(timeoutMessage));
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
const computeAdaptiveLoginBudgets = (input) => {
    const startupSnapshot = (0, startupIsolation_service_1.getStartupIsolationSnapshot)();
    const startupWindowActive = Boolean(startupSnapshot?.startupWindowActive);
    const startupPressure = {
        eventLoopLagMs: Math.max(0, asNumber(startupSnapshot?.pressure?.eventLoopLagMs, 0)),
        cpuPressurePercent: Math.max(0, asNumber(startupSnapshot?.pressure?.cpuPressurePercent, 0)),
    };
    const requestQueue = {
        activeCritical: Math.max(0, Math.floor(asNumber(startupSnapshot?.requestPriority?.active?.critical, 0))),
        queuedCritical: Math.max(0, Math.floor(asNumber(startupSnapshot?.requestPriority?.queue?.critical, 0))),
    };
    const requestRemainingMs = (0, requestLifecycle_1.getRequestRemainingMs)({
        req: input.req,
        res: input.res,
    }, 10000);
    const pressureReasons = [];
    let multiplier = 1;
    if (startupWindowActive) {
        multiplier += 0.2;
        pressureReasons.push("startup_window_active");
    }
    if (input.startupContentionMs >= 150) {
        multiplier += 0.15;
        pressureReasons.push("request_priority_queue_delay");
    }
    if (startupPressure.eventLoopLagMs >= 45) {
        multiplier += 0.2;
        pressureReasons.push("event_loop_lag_elevated");
    }
    if (startupPressure.eventLoopLagMs >= 90) {
        multiplier += 0.2;
        pressureReasons.push("event_loop_lag_high");
    }
    if (startupPressure.cpuPressurePercent >= 65) {
        multiplier += 0.2;
        pressureReasons.push("cpu_pressure_elevated");
    }
    if (startupPressure.cpuPressurePercent >= 85) {
        multiplier += 0.2;
        pressureReasons.push("cpu_pressure_high");
    }
    if (requestQueue.activeCritical > 0 || requestQueue.queuedCritical > 0) {
        multiplier += 0.15;
        pressureReasons.push("critical_queue_contention");
    }
    if ((input.passwordHashCost || 0) >= 12) {
        multiplier += 0.3;
        pressureReasons.push("bcrypt_cost_high");
    }
    multiplier = clamp(Number(multiplier.toFixed(2)), LOGIN_ADAPTIVE_BUDGET_MIN_MULTIPLIER, LOGIN_ADAPTIVE_BUDGET_MAX_MULTIPLIER);
    const basePasswordBudgetMs = LOGIN_PASSWORD_VERIFY_BASE_BUDGET_MS +
        Math.max(0, ((input.passwordHashCost || 10) - 10) * 220);
    const stageBudgets = {
        password_verify_budget: Math.max(450, Math.round(basePasswordBudgetMs * multiplier)),
        db_persistence_budget: Math.max(600, Math.round(LOGIN_DB_PERSISTENCE_BASE_BUDGET_MS * multiplier)),
        lifecycle_lock_budget: Math.max(250, Math.round(LOGIN_LIFECYCLE_LOCK_BASE_BUDGET_MS * multiplier)),
        token_issue_budget: Math.max(120, Math.round(LOGIN_TOKEN_ISSUE_BASE_BUDGET_MS * multiplier)),
        response_commit_budget: Math.max(140, Math.round(LOGIN_RESPONSE_COMMIT_BASE_BUDGET_MS * multiplier)),
    };
    const degradedRuntime = startupWindowActive ||
        startupPressure.eventLoopLagMs >= 45 ||
        startupPressure.cpuPressurePercent >= 65 ||
        requestQueue.queuedCritical > 0 ||
        input.startupContentionMs >= 150;
    const processingRetryAfterMs = clamp(Math.round(LOGIN_PROCESSING_RETRY_AFTER_BASE_MS * multiplier), LOGIN_PROCESSING_RETRY_AFTER_BASE_MS, LOGIN_PROCESSING_RETRY_AFTER_MAX_MS);
    return {
        stageBudgets,
        multiplier,
        pressureReasons,
        startupWindowActive,
        startupPressure,
        requestQueue,
        requestRemainingMs,
        degradedRuntime,
        processingRetryAfterMs,
    };
};
const emitLoginBudgetTelemetry = (input) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "auth_processing_state",
        value: Math.max(0, Math.round(input.elapsedMs)),
        businessId: input.businessId,
        route: "auth.login",
        metadata: {
            stage: input.stage,
            policy: input.policy,
            budgetMs: input.budgetMs,
            elapsedMs: input.elapsedMs,
            withinBudget: input.elapsedMs <= input.budgetMs,
            outcome: input.outcome,
            ...(input.metadata || {}),
        },
    });
};
const sendLoginProcessing = (input) => input.res.status(202).json({
    success: false,
    processing: true,
    retryable: true,
    code: "AUTH_LOGIN_PROCESSING",
    processingCode: input.code,
    retryAfterMs: input.retryAfterMs,
    message: input.message,
    authLifecycle: {
        processingState: "PROCESSING",
        lifecycleState: "PROCESSING",
        sessionReady: false,
        retryable: true,
        retryAfterMs: input.retryAfterMs,
        terminal: false,
        reason: input.code,
    },
    metadata: {
        elapsedMs: Date.now() - input.startedAt,
        ...(input.metadata || {}),
    },
});
const withFastTimeout = async (task, timeoutMs) => {
    return withShortTimeout(task, timeoutMs, "fast_operation_timeout");
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
        const count = await withFastTimeout(redis_1.default.incr(key), 80);
        if (count === 1) {
            await withFastTimeout(redis_1.default.expire(key, 60), 80);
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
        const hashed = await (0, bcryptWorker_1.hashPasswordWorker)(password, 12);
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
    const loginTraceStart = Date.now();
    const startedAt = Date.now();
    try {
        const ip = getIP(req);
        const userAgent = String(getUA(req));
        await checkGlobalLimit(ip);
        const email = normalizeEmail(String(req.body.email || ""));
        const password = String(req.body.password || "");
        const tUserLookup = Date.now();
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        console.log("[LOGIN_TRACE] user_lookup_ms=", Date.now() - tUserLookup);
        const tPasswordVerify = Date.now();
        const passwordVerified = user
            ? await verifyPassword(password, user.password)
            : false;
        console.log("[LOGIN_TRACE] password_verify_ms=", Date.now() - tPasswordVerify);
        if (!user ||
            user.deletedAt ||
            !user.isActive ||
            !user.isVerified ||
            !passwordVerified) {
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
            throw (0, AppError_1.unauthorized)("Invalid credentials");
        }
        const resolvedUser = {
            id: user.id,
            role: user.role,
            tokenVersion: user.tokenVersion,
            email: user.email,
            name: user.name,
        };
        const businessId = user.businessId || null;
        const tAccessToken = Date.now();
        const accessToken = (0, generateToken_1.generateAccessToken)(resolvedUser.id, resolvedUser.role, businessId, resolvedUser.tokenVersion);
        console.log("[LOGIN_TRACE] access_token_ms=", Date.now() - tAccessToken);
        const tRefreshToken = Date.now();
        const refreshRaw = (0, generateToken_1.generateRefreshToken)(resolvedUser.id, resolvedUser.tokenVersion);
        console.log("[LOGIN_TRACE] refresh_token_ms=", Date.now() - tRefreshToken);
        const hashedRefreshToken = hashToken(refreshRaw);
        const tRefreshWrite = Date.now();
        await prisma_1.default.refreshToken.create({
            data: {
                token: hashedRefreshToken,
                userId: resolvedUser.id,
                userAgent,
                ip,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        console.log("[LOGIN_TRACE] refresh_write_ms=", Date.now() - tRefreshWrite);
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
        const tCookieWrite = Date.now();
        setCookies(req, res, accessToken, refreshRaw);
        console.log("[LOGIN_TRACE] cookie_write_ms=", Date.now() - tCookieWrite);
        const tResponse = Date.now();
        res.json({
            success: true,
            user: {
                id: resolvedUser.id,
                email: resolvedUser.email,
                name: resolvedUser.name,
                businessId,
            },
        });
        console.log("[LOGIN_TRACE] response_send_ms=", Date.now() - tResponse);
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId,
            route: "auth.login",
            metadata: {
                source: "password",
            },
        });
        runDetachedAuthTask("auth.login.prune_refresh_tokens", async () => {
            await withFastTimeout(pruneRefreshTokens(resolvedUser.id, 4), LOGIN_BACKGROUND_TASK_TIMEOUT_MS);
        });
        runDetachedAuthTask("auth.login.session_ledger", async () => {
            const sessionLedgerStartedAt = Date.now();
            let outcome = "ok";
            try {
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
            }
            catch (error) {
                outcome = "error";
                throw error;
            }
            finally {
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "session_ledger_ms",
                    value: Date.now() - sessionLedgerStartedAt,
                    businessId,
                    route: "auth.login",
                    metadata: {
                        source: "auth.login.session_ledger",
                        outcome,
                    },
                });
            }
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
            shouldRun: () => true,
        });
        console.log("[LOGIN_TRACE] TOTAL_LOGIN_MS=", Date.now() - loginTraceStart);
    }
    catch (err) {
        console.error("[LOGIN_TRACE] LOGIN_FAILED_AFTER_MS=", Date.now() - loginTraceStart);
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
                password: await (0, bcryptWorker_1.hashPasswordWorker)(password, 12),
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
            name: req.user?.name || "Workspace User",
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
