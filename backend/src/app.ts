import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import csrf from "csurf";
import prisma from "./config/prisma";

import authRoutes from "./routes/auth.routes";
import googleAuthRoutes from "./routes/googleAuth.routes";
import clientRoutes from "./routes/client.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappWebhook from "./routes/whatsapp.webhook";
import instagramWebhook from "./routes/instagram.webhook";
import billingRoutes from "./routes/billing.routes";
import { stripeWebhook } from "./routes/stripe.webhook";
import dashboardRoutes from "./routes/dashboard.routes";

/* 🟢 EXISTING */
import commentTriggerRoutes from "./routes/commentTrigger.routes";
import messageRoutes from "./routes/message.routes";

/* 🟢 NEW */
import automationRoutes from "./routes/automation.routes";
import { monitoringMiddleware } from "./middleware/monitoring.middleware";

/* 🟢 KNOWLEDGE BASE (NEW FEATURE) */
import knowledgeRoutes from "./routes/knowledge.routes";

import {
  authLimiter,
  aiLimiter,
  globalLimiter,
} from "./middleware/rateLimit.middleware";

import { startTrialExpiryCron } from "./cron/trial.cron";
import { startMetaTokenRefreshCron } from "./cron/metaTokenRefresh.cron";

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
/* CSRF PROTECTION */
/* ============================= */

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  }
});

/* ============================= */
/* STRIPE WEBHOOK (RAW BODY) */
/* ============================= */

app.post(
  "/api/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/* ============================= */
/* WHATSAPP WEBHOOK (RAW BODY) */
/* ============================= */

app.use(
  "/api/webhook/whatsapp",
  express.raw({ type: "application/json" }),
  whatsappWebhook
);

/* ============================= */
/* INSTAGRAM WEBHOOK (RAW BODY) */
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

/* AUTH ROUTES */

app.use("/api/auth", authRoutes);

/* GOOGLE AUTH */

app.use("/api/auth", googleAuthRoutes);

/* OTHER ROUTES */

app.use("/api/clients", clientRoutes);

app.use("/api/ai", aiLimiter, aiRoutes);

app.use("/api/billing", billingRoutes);

app.use("/api/dashboard", dashboardRoutes);

/* 🟢 COMMENT AUTOMATION */
app.use("/api/comment-triggers", commentTriggerRoutes);

/* 🟢 MESSAGE SYSTEM */
app.use("/api/messages", messageRoutes);

/* 🟢 AUTOMATION FLOWS */
app.use("/api/automations", automationRoutes);

/* 🟢 AI KNOWLEDGE BASE */
app.use("/api/knowledge", knowledgeRoutes);

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

export default app;