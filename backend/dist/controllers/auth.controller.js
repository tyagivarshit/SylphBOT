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
/* ======================================
RATE LIMIT
====================================== */
const checkGlobalLimit = async (ip) => {
    const key = `global:${ip}`;
    const count = await redis_1.default.incr(key);
    if (count === 1)
        await redis_1.default.expire(key, 60);
    if (count > 60)
        throw (0, AppError_1.tooManyRequests)("Too many requests");
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
        await checkGlobalLimit(getIP(req));
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
                ip: getIP(req),
            });
            void (0, securityGovernanceOS_service_1.recordFraudSignal)({
                businessId: user?.businessId || null,
                tenantId: user?.businessId || null,
                signalType: "credential_stuffing",
                actorId: user?.id || email,
                ipFingerprint: hashToken(getIP(req)).slice(0, 20),
                severity: "MEDIUM",
                metadata: {
                    email,
                    route: req.originalUrl,
                },
            }).catch(() => undefined);
            throw (0, AppError_1.unauthorized)("Invalid credentials");
        }
        const bootstrap = await (0, authBootstrap_service_1.ensureAuthBootstrapContext)({
            userId: user.id,
            preferredBusinessId: user.businessId || null,
            profileSeed: {
                email: user.email,
                name: user.name,
                avatar: user.avatar || null,
            },
        });
        const businessId = bootstrap.identity.businessId;
        const accessToken = (0, generateToken_1.generateAccessToken)(bootstrap.user.id, bootstrap.user.role, businessId, bootstrap.user.tokenVersion);
        const refreshRaw = (0, generateToken_1.generateRefreshToken)(bootstrap.user.id, bootstrap.user.tokenVersion);
        await pruneRefreshTokens(bootstrap.user.id, 4);
        await prisma_1.default.refreshToken.create({
            data: {
                token: hashToken(refreshRaw),
                userId: bootstrap.user.id,
                userAgent: getUA(req),
                ip: getIP(req),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        await (0, securityGovernanceOS_service_1.issueSessionLedger)({
            businessId,
            tenantId: businessId,
            userId: bootstrap.user.id,
            sessionKey: hashToken(refreshRaw),
            ip: getIP(req),
            userAgent: String(getUA(req)),
            deviceId: String(req.headers["x-device-id"] || "").trim() || null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            metadata: {
                source: "auth.login",
            },
        }).catch(() => undefined);
        void writeAuthAuditLog(req, {
            action: "auth.login",
            userId: bootstrap.user.id,
            businessId,
            metadata: {
                email: bootstrap.user.email,
                role: bootstrap.user.role,
            },
        });
        setCookies(req, res, accessToken, refreshRaw);
        res.json({
            success: true,
            user: {
                id: bootstrap.user.id,
                email: bootstrap.user.email,
                name: bootstrap.user.name,
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
        if (!req.user?.id)
            throw (0, AppError_1.unauthorized)("Not authenticated");
        const bootstrap = await (0, authBootstrap_service_1.ensureAuthBootstrapContext)({
            userId: req.user.id,
            preferredBusinessId: req.user?.businessId || null,
            profileSeed: {
                email: req.user?.email || null,
            },
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
            success: true,
            user: {
                id: bootstrap.user.id,
                name: bootstrap.user.name,
                email: bootstrap.user.email,
                role: bootstrap.user.role,
                businessId: bootstrap.identity.businessId,
            },
        });
        (0, performanceMetrics_1.emitPerformanceMetric)({
            name: "AUTH_MS",
            value: Date.now() - startedAt,
            businessId: bootstrap.identity.businessId,
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
