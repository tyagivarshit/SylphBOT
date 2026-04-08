import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { env } from "./config/env";


/* ========= CONFIG ========= */
import prisma from "./config/prisma";
import { protect } from "./middleware/auth.middleware";
import { attachBillingContext } from "./middleware/subscription.middleware";

/* ========= ROUTES ========= */
import authRoutes from "./routes/auth.routes";
import googleAuthRoutes from "./routes/googleAuth.routes";
import clientRoutes from "./routes/client.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappWebhook from "./routes/whatsapp.webhook";
import instagramWebhook from "./routes/instagram.webhook";
import billingRoutes from "./routes/billing.routes";// 🔥 HEALTH CHECK ROUTE (IMPORTANT FOR RENDER)
import stripeWebhookRoutes from "./routes/stripeWebhook.routes";
import dashboardRoutes from "./routes/dashboard.routes";

import commentTriggerRoutes from "./routes/commentTrigger.routes";
import messageRoutes from "./routes/message.routes";

import automationRoutes from "./routes/automation.routes";
import instagramRoutes from "./routes/instagram.routes";

import knowledgeRoutes from "./routes/knowledge.routes";
import trainingRoutes from "./routes/training.routes";

import leadRoutes from "./routes/lead.routes";
import analyticsRoutes from "./routes/analytics.routes";

/* ========= NEW ROUTES ========= */
import searchRoutes from "./routes/search.routes";
import notificationRoutes from "./routes/notification";
import userRoutes from "./routes/user.routes";
import securityRoutes from "./routes/security.routes";
import integrationRoutes from "./routes/integration.routes";
import oauthRoutes from "./routes/oauth.routes";

/* ✅ ADDED ROUTES */
import bookingRoutes from "./routes/booking.routes";
import availabilityRoutes from "./routes/availability.routes";

/* ========= MIDDLEWARE ========= */
import {
  aiLimiter,
  globalLimiter,
} from "./middleware/rateLimit.middleware";

import { monitoringMiddleware } from "./middleware/monitoring.middleware";

/* ========= CRONS ========= */
import { startTrialExpiryCron } from "./cron/trial.cron";
import { startMetaTokenRefreshCron } from "./cron/metaTokenRefresh.cron";
import { startUsageResetCron } from "./cron/resetUsage.cron";
import "./workers/bookingReminder.worker";

/* ========= ERRORS ========= */
import { isAppError } from "./utils/AppError";

import conversationRoutes from "./routes/conversation.routes";

const app = express();
console.log("🔥 REDIS FROM ENV:", env.REDIS_URL);

/* ======================================
🔥 TRUST PROXY
====================================== */
app.set("trust proxy", 1);

/* ======================================
🔥 SECURITY + PERFORMANCE
====================================== */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(compression());
app.use(globalLimiter);

/* ======================================
🔥 COOKIE PARSER
====================================== */
app.use(cookieParser());

/* ======================================
🔥 CORS
====================================== */
app.use(
  cors({
    origin: [
      "https://app.automexiaai.in"
    ],
    credentials: true,
  })
);

/* ======================================
🔥 REQUEST LOGGER
====================================== */
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    console.info(
      JSON.stringify({
        type: "request",
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration: Date.now() - start,
        ip: req.ip,
      })
    );
  });

  next();
});

/* ======================================
🔥 MONITORING
====================================== */
app.use(monitoringMiddleware);

/* ======================================
🔥 REQUEST TIMEOUT
====================================== */
app.use((req, res, next) => {
  res.setTimeout(15000, () => {
    console.error("⏱️ Request timeout:", req.originalUrl);
    if (!res.headersSent) {
      res.status(408).send("Request Timeout");
    }
  });
  next();
});

/* ======================================
🔥 WEBHOOKS (ORDER IMPORTANT)
====================================== */

app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

app.use(
  "/api/webhook/whatsapp",
  express.raw({ type: "application/json" }),
  whatsappWebhook
);

app.use(
  "/api/webhook/instagram",
  express.raw({
    type: "application/json",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  instagramWebhook
);

/* ======================================
🔥 JSON PARSER
====================================== */
app.use(express.json({ limit: "1mb" }));

/* ======================================
🔥 GLOBAL AUTH ONLY (FIXED)
====================================== */
app.use((req, res, next) => {
  const publicRoutes = [
  "/",
  "/health",
  "/api/auth",
  "/api/webhooks",
  "/api/webhook",
];

  const isPublic = publicRoutes.some((route) =>
    req.originalUrl.startsWith(route)
  );

  if (isPublic) return next();

  protect(req, res, next);
});

/* ======================================
🔥 ROUTES
====================================== */

app.get("/", (_req, res) => {
  res.send("API Running 🚀");
});

/* AUTH */
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);

/* FREE (AUTH ONLY) */
app.use("/api/dashboard", protect, dashboardRoutes);
app.use("/api/billing", protect, billingRoutes);
app.use("/api/user", protect, userRoutes);
app.use("/api/notifications", protect, notificationRoutes);

/* PREMIUM */
app.use("/api/ai", protect, attachBillingContext, aiLimiter, aiRoutes);

app.use("/api/automation", protect, attachBillingContext, automationRoutes);

app.use("/api/messages", protect, attachBillingContext, messageRoutes);

app.use("/api/conversations", protect, conversationRoutes);

app.use("/api/comment-triggers", protect, attachBillingContext, commentTriggerRoutes);

/* OTHER (AUTH ONLY) */
app.use("/api/clients", protect, clientRoutes);
app.use("/api/instagram", protect, instagramRoutes);
app.use("/api/knowledge", protect, knowledgeRoutes);
app.use("/api/training", protect, trainingRoutes);
app.use("/api/leads", protect, leadRoutes);
app.use("/api/analytics", protect, analyticsRoutes);
app.use("/api/search", protect, searchRoutes);
app.use("/api/security", protect, securityRoutes);
app.use("/api/integrations", protect, integrationRoutes);
app.use("/api/oauth", protect, oauthRoutes);

/* ✅ ADDED BOOKING + AVAILABILITY */
app.use("/api/booking", protect, attachBillingContext, bookingRoutes);
app.use("/api/availability", protect, attachBillingContext, availabilityRoutes);

/* ======================================
🔥 HEALTH
====================================== */
app.get("/health", (_req, res) => {
  res.status(200).json({ success: true });
});

/* ======================================
🔥 404
====================================== */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* ======================================
🔥 ERROR HANDLER
====================================== */
app.use((err: any, req: any, res: any, _next: any) => {
  console.error("ERROR:", {
    message: err.message,
    path: req.originalUrl,
    method: req.method,
  });

  if (isAppError(err)) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      details: err.details || null,
    });
  }

  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

/* ======================================
🔥 CRONS
====================================== */
if (process.env.ENABLE_CRON === "true") {
  startTrialExpiryCron();
  startMetaTokenRefreshCron();
  startUsageResetCron();
}

/* ======================================
🔥 CRASH SAFETY
====================================== */
process.on("uncaughtException", (err) => {
  console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 UNHANDLED REJECTION:", err);
});

export default app;
