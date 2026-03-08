import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import prisma from "./config/prisma";

import authRoutes from "./routes/auth.routes";
import clientRoutes from "./routes/client.routes";
import aiRoutes from "./routes/ai.routes";
import whatsappWebhook from "./routes/whatsapp.webhook";
import instagramWebhook from "./routes/instagram.webhook";
import billingRoutes from "./routes/billing.routes";
import { stripeWebhook } from "./routes/stripe.webhook";
import dashboardRoutes from "./routes/dashboard.routes";

import {
  authLimiter,
  aiLimiter,
  globalLimiter,
} from "./middleware/rateLimit.middleware";

import { startTrialExpiryCron } from "./cron/trial.cron";
import { env } from "./config/env";

const app = express();

/* ============================= */
/* 🚀 PRODUCTION HARDENING */
/* ============================= */

app.set("trust proxy", 1);

app.use(helmet());

app.use(compression());

app.use(globalLimiter);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

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
/* JSON PARSER */
/* ============================= */

app.use(express.json());

/* ============================= */
/* ROUTES */
/* ============================= */

app.get("/", (req, res) => {
  res.send("API Running 🚀");
});

app.use("/api/auth", authLimiter, authRoutes);

app.use("/api/clients", clientRoutes);

app.use("/api/ai", aiLimiter, aiRoutes);

app.use("/api/billing", billingRoutes);

app.use("/api/dashboard", dashboardRoutes);

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

startTrialExpiryCron();

export default app;