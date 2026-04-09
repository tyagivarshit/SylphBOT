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
const email_service_1 = require("../services/email.service");
const AppError_1 = require("../utils/AppError");
const authCookies_1 = require("../utils/authCookies");
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
    console.log("🍪 Cookies set");
};
/* ======================================
REGISTER
====================================== */
const register = async (req, res, next) => {
    try {
        await checkGlobalLimit(getIP(req));
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(String(req.body.email || ""));
        const password = String(req.body.password || "");
        if (!name || !email || !password || !isStrongPassword(password)) {
            throw (0, AppError_1.badRequest)("Password must be at least 8 characters and include uppercase, lowercase, and a number");
        }
        const exists = await prisma_1.default.user.findUnique({ where: { email } });
        if (exists)
            throw (0, AppError_1.conflict)("Email already exists");
        const hashed = await bcryptjs_1.default.hash(password, 12);
        const rawToken = crypto_1.default.randomBytes(32).toString("hex");
        await prisma_1.default.user.create({
            data: {
                name,
                email,
                password: hashed,
                verifyToken: hashToken(rawToken),
                verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        const verifyLink = `${env_1.env.FRONTEND_URL}/auth/verify-email?token=${rawToken}`;
        res.status(201).json({
            success: true,
            verificationRequired: true,
        });
        (0, email_service_1.queueVerificationEmail)(email, verifyLink);
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
    try {
        await checkGlobalLimit(getIP(req));
        const email = normalizeEmail(String(req.body.email || ""));
        const password = String(req.body.password || "");
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user ||
            !user.isVerified ||
            !(await verifyPassword(password, user.password))) {
            throw (0, AppError_1.unauthorized)("Invalid credentials");
        }
        let business = await prisma_1.default.business.findFirst({
            where: { ownerId: user.id },
            select: { id: true },
        });
        /* ✅ SAFETY FALLBACK (ADDED) */
        if (!business) {
            const newBusiness = await prisma_1.default.business.create({
                data: {
                    name: `${user.name || "My"} Workspace`,
                    ownerId: user.id,
                },
            });
            await prisma_1.default.user.update({
                where: { id: user.id },
                data: { businessId: newBusiness.id },
            });
            business = { id: newBusiness.id };
        }
        const accessToken = (0, generateToken_1.generateAccessToken)(user.id, user.role, business?.id || null, user.tokenVersion);
        const refreshRaw = (0, generateToken_1.generateRefreshToken)(user.id, user.tokenVersion);
        const count = await prisma_1.default.refreshToken.count({
            where: { userId: user.id },
        });
        if (count >= 5) {
            const oldest = await prisma_1.default.refreshToken.findFirst({
                where: { userId: user.id },
                orderBy: { createdAt: "asc" },
            });
            if (oldest) {
                await prisma_1.default.refreshToken.delete({
                    where: { id: oldest.id },
                });
            }
        }
        await prisma_1.default.refreshToken.create({
            data: {
                token: hashToken(refreshRaw),
                userId: user.id,
                userAgent: getUA(req),
                ip: getIP(req),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        setCookies(req, res, accessToken, refreshRaw);
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                businessId: business?.id || null,
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
        const token = hashToken(req.query.token);
        const user = await prisma_1.default.user.findFirst({
            where: {
                verifyToken: token,
                verifyTokenExpiry: { gt: new Date() },
            },
        });
        /* ✅ IDEMPOTENT */
        if (!user) {
            return res.json({ success: true });
        }
        const updatedUser = await prisma_1.default.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                verifyToken: null,
                verifyTokenExpiry: null,
            },
        });
        /* ======================================
        🔥 DUPLICATE PREVENTION (ADDED)
        ====================================== */
        let existingBusiness = await prisma_1.default.business.findFirst({
            where: { ownerId: updatedUser.id },
            select: { id: true },
        });
        let business = existingBusiness;
        if (!existingBusiness) {
            business = await prisma_1.default.business.create({
                data: {
                    name: `${updatedUser.name || "My"} Workspace`,
                    ownerId: updatedUser.id,
                },
            });
        }
        /* ======================================
        🔥 LINK USER → BUSINESS
        ====================================== */
        await prisma_1.default.user.update({
            where: { id: updatedUser.id },
            data: {
                businessId: business.id,
            },
        });
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
        await (0, email_service_1.sendVerificationEmail)(email, `${env_1.env.FRONTEND_URL}/auth/verify-email?token=${raw}`);
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
        await (0, email_service_1.sendVerificationEmail)(email, `${env_1.env.FRONTEND_URL}/auth/reset-password?token=${raw}`);
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
    try {
        if (!req.user?.id)
            throw (0, AppError_1.unauthorized)("Not authenticated");
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                businessId: true, // 🔥 THIS FIXES EVERYTHING
            }
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
            success: true,
            user,
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
    try {
        await prisma_1.default.refreshToken.deleteMany({
            where: { userId: req.user.id },
        });
        (0, authCookies_1.clearAuthCookies)(res, req);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
};
exports.logout = logout;
