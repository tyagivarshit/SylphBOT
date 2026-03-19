import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import prisma from "./config/prisma";

import authRoutes from "./routes/auth.routes";
import googleAuthRoutes from "./routes/googleAuth.routes";
import clientRoutes from "./routes/client.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappWebhook from "./routes/whatsapp.webhook";
import instagramWebhook from "./routes/instagram.webhook";
import billingRoutes from "./routes/billing.routes";
import stripeWebhookRoutes from "./routes/stripeWebhook.routes";
import dashboardRoutes from "./routes/dashboard.routes";

/* 🟢 EXISTING */
import commentTriggerRoutes from "./routes/commentTrigger.routes";
import messageRoutes from "./routes/message.routes";

/* 🟢 NEW */
import automationRoutes from "./routes/automation.routes";
import instagramRoutes from "./routes/instagram.routes"; 
import { monitoringMiddleware } from "./middleware/monitoring.middleware";

/* 🟢 KNOWLEDGE BASE */
import knowledgeRoutes from "./routes/knowledge.routes";

/* 🔥 AI TRAINING */
import trainingRoutes from "./routes/training.routes";

/* 🔥 LEAD CONTROL (NEW) */
import leadRoutes from "./routes/lead.routes";

import {
  authLimiter,
  aiLimiter,
  globalLimiter,
} from "./middleware/rateLimit.middleware";

import { startTrialExpiryCron } from "./cron/trial.cron";
import { startMetaTokenRefreshCron } from "./cron/metaTokenRefresh.cron";
import { startUsageResetCron } from "./cron/resetUsage.cron";

import { env } from "./config/env";

const app = express();

/* ============================= */
/* 🚀 PRODUCTION HARDENING */
/* ============================= */

app.set("trust proxy", 1);

app.use(helmet());
app.use(compression());
app.use(globalLimiter);

/* ============================= */
/* COOKIE PARSER */
/* ============================= */

app.use(cookieParser());

/* ============================= */
/* CORS */
/* ============================= */

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

/* ============================= */
/* 🔥 STRIPE WEBHOOK (RAW BODY) */
/* ============================= */

app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

/* ============================= */
/* WHATSAPP WEBHOOK */
/* ============================= */

app.use(
  "/api/webhook/whatsapp",
  express.raw({ type: "application/json" }),
  whatsappWebhook
);

/* ============================= */
/* INSTAGRAM WEBHOOK */
/* ============================= */

app.use(
  "/api/webhook/instagram",
  express.raw({ type: "application/json" }),
  instagramWebhook
);

/* ============================= */
/* MONITORING */
/* ============================= */

app.use(monitoringMiddleware);

/* ============================= */
/* JSON PARSER */
/* ============================= */

app.use(express.json());

/* ============================= */
/* ROUTES */
/* ============================= */

app.get("/", (req, res) => {
  res.send("API Running 🚀");
});

/* AUTH */
app.use("/api/auth", authLimiter, authRoutes);

/* GOOGLE AUTH */
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

/* MESSAGE SYSTEM */
app.use("/api/messages", messageRoutes);

/* AUTOMATION FLOWS */
app.use("/api/automation", automationRoutes);

/* 🔥 INSTAGRAM MEDIA */
app.use("/api/instagram", instagramRoutes);

/* KNOWLEDGE BASE */
app.use("/api/knowledge", knowledgeRoutes);

/* 🔥 AI TRAINING */
app.use("/api/training", trainingRoutes);

/* 🔥 HUMAN / AI TOGGLE */
app.use("/api/leads", leadRoutes);

/* ============================= */
/* HEALTH */
/* ============================= */

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy 🚀",
  });
});

/* ============================= */
/* 404 HANDLER */
/* ============================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* ============================= */
/* GLOBAL ERROR HANDLER */
/* ============================= */

app.use((err: any, req: any, res: any, next: any) => {
  console.error("Global Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

/* ============================= */
/* CRONS */
/* ============================= */

startTrialExpiryCron();
startMetaTokenRefreshCron();
startUsageResetCron();

export default app;