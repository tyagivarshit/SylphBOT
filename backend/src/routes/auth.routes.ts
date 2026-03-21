import { Router } from "express";
import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  logout,
  forgotPassword,
  resetPassword,
  getMe,
} from "../controllers/auth.controller";

import { protect } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/rateLimit.middleware";
import { loginLimiter } from "../middleware/loginLimiter";

const router = Router();

/* ================= AUTH ================= */

router.post("/register", authLimiter, register);

/* 🔐 LOGIN (STRICT PROTECTION) */
router.post("/login", loginLimiter, authLimiter, login);

/* 🔐 CURRENT USER */
router.get("/me", protect, getMe);

/* ================= EMAIL ================= */

router.get("/verify-email", verifyEmail);
router.post("/resend-verification", authLimiter, resendVerificationEmail);

/* ================= SESSION ================= */

router.post("/logout", protect, logout);

/* ================= PASSWORD ================= */

router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

export default router;