import { Router } from "express";
import {
  register,
  login,
  verifyEmail,
  resendVerificationEmail,
  logout,
  forgotPassword,
  resetPassword,
  getMe
} from "../controllers/auth.controller";

import { loginLimiter } from "../middleware/loginLimiter";
import { protect } from "../middleware/auth.middleware";

const router = Router();

/* ================= AUTH ================= */

router.post("/register", register);

/* 🔐 LOGIN */

router.post("/login", loginLimiter, login);

/* 🔐 CURRENT USER */

router.get("/me", protect, getMe);

/* ================= EMAIL ================= */

router.get("/verify-email", verifyEmail);

router.post("/resend-verification", resendVerificationEmail);

/* ================= SESSION ================= */

router.post("/logout", protect, logout);

/* ================= PASSWORD ================= */

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

export default router;