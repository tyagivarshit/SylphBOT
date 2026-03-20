import rateLimit from "express-rate-limit";

/* ======================================
🔥 KEY GENERATOR (IMPORTANT)
====================================== */

const keyGenerator = (req: any) => {
  return req.user?.businessId || req.ip;
};

/* ======================================
🔐 AUTH LIMITER
====================================== */

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "TOO_MANY_ATTEMPTS",
    message: "Too many login attempts. Try again later.",
  },
});

/* ======================================
🤖 AI LIMITER
====================================== */

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "AI_RATE_LIMIT",
    message: "Too many AI requests. Slow down.",
  },
});

/* ======================================
🌍 GLOBAL LIMITER
====================================== */

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
});