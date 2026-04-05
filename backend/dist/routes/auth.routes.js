"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const loginLimiter_1 = require("../middleware/loginLimiter");
const router = (0, express_1.Router)();
/* ================= AUTH ================= */
router.post("/register", rateLimit_middleware_1.authLimiter, auth_controller_1.register);
/* 🔐 LOGIN (STRICT PROTECTION) */
router.post("/login", loginLimiter_1.loginLimiter, rateLimit_middleware_1.authLimiter, auth_controller_1.login);
/* 🔐 CURRENT USER */
router.get("/me", auth_middleware_1.protect, auth_controller_1.getMe);
/* ================= EMAIL ================= */
router.get("/verify-email", auth_controller_1.verifyEmail);
router.post("/resend-verification", rateLimit_middleware_1.authLimiter, auth_controller_1.resendVerificationEmail);
/* ================= SESSION ================= */
router.post("/logout", auth_middleware_1.protect, auth_controller_1.logout);
/* ================= PASSWORD ================= */
router.post("/forgot-password", rateLimit_middleware_1.authLimiter, auth_controller_1.forgotPassword);
router.post("/reset-password", rateLimit_middleware_1.authLimiter, auth_controller_1.resetPassword);
exports.default = router;
