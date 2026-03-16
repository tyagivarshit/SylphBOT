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

import { refreshAccessToken } from "../controllers/token.controller";
import { loginLimiter } from "../middleware/loginLimiter";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", register);

/* LOGIN WITH RATE LIMITER */

router.post("/login", loginLimiter, login);

router.post("/refresh", refreshAccessToken);

router.get("/verify-email", verifyEmail);

/* 🔐 CURRENT USER */

router.get("/me", protect, getMe);

/* NEW ROUTES */

router.post("/resend-verification", resendVerificationEmail);
router.post("/logout", logout);

/* PASSWORD RESET ROUTES */

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;