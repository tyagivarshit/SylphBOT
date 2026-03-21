import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";

/* ========= CONFIG ========= */
import prisma from "./config/prisma";

/* ========= ROUTES ========= */
import authRoutes from "./routes/auth.routes";
import googleAuthRoutes from "./routes/googleAuth.routes";
import clientRoutes from "./routes/client.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappWebhook from "./routes/whatsapp.webhook";
import instagramWebhook from "./routes/instagram.webhook";
import billingRoutes from "./routes/billing.routes";
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

/* ========= ERRORS ========= */
import { isAppError } from "./utils/AppError";

const app = express();

/* ======================================
🔥 TRUST PROXY
====================================== */
app.set("trust proxy", 1);

/* ======================================
🔥 SECURITY + PERFORMANCE
====================================== */
app.use(helmet());
app.use(compression());
app.use(globalLimiter);

/* ======================================
🔥 COOKIE PARSER (CRITICAL)
====================================== */
app.use(cookieParser());

/* ======================================
🔥 CORS (FINAL FIX)
====================================== */
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

/* ======================================
🔥 BODY PARSER
====================================== */
app.use(express.json({ limit: "1mb" }));

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
🔥 RAW BODY (WEBHOOKS)
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
  express.raw({ type: "application/json" }),
  instagramWebhook
);

/* ======================================
🔥 ROUTES
====================================== */

app.get("/", (_req, res) => {
  res.send("API Running 🚀");
});

/* AUTH */
app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);

/* CLIENTS */
app.use("/api/clients", clientRoutes);

/* AI */
app.use("/api/ai", aiLimiter, aiRoutes);

/* BILLING */
app.use("/api/billing", billingRoutes);

/* DASHBOARD */
app.use("/api/dashboard", dashboardRoutes);

/* COMMENT AUTOMATION */
app.use("/api/comment-triggers", commentTriggerRoutes);

/* MESSAGE */
app.use("/api/messages", messageRoutes);

/* AUTOMATION */
app.use("/api/automation", automationRoutes);

/* INSTAGRAM */
app.use("/api/instagram", instagramRoutes);

/* KNOWLEDGE */
app.use("/api/knowledge", knowledgeRoutes);

/* TRAINING */
app.use("/api/training", trainingRoutes);

/* LEADS */
app.use("/api/leads", leadRoutes);

/* ANALYTICS */
app.use("/api/analytics", analyticsRoutes);

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
🔥 GLOBAL ERROR HANDLER
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

export default app;