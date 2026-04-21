import express from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import passport from "passport";
import { env } from "./config/env";
import { configurePassport } from "./config/passport";
import { protect } from "./middleware/auth.middleware";
import { attachBillingContext } from "./middleware/subscription.middleware";

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
import searchRoutes from "./routes/search.routes";
import notificationRoutes from "./routes/notification";
import userRoutes from "./routes/user.routes";
import securityRoutes from "./routes/security.routes";
import auditRoutes from "./routes/audit.routes";
import integrationRoutes from "./routes/integration.routes";
import oauthRoutes from "./routes/oauth.routes";
import bookingRoutes from "./routes/booking.routes";
import availabilityRoutes from "./routes/availability.routes";
import conversationRoutes from "./routes/conversation.routes";
import healthRoutes from "./routes/health.routes";
import usageRoutes from "./routes/usage.routes";
import helpAiRoutes from "./routes/helpAi.routes";
import {
  AIMessagePayload,
  AI_QUEUE_NAME,
  enqueueAIBatch,
} from "./queues/ai.queue";

import {
  aiLimiter,
  globalLimiter,
} from "./middleware/rateLimit.middleware";
import { monitoringMiddleware } from "./middleware/monitoring.middleware";
import { requestContextMiddleware } from "./middleware/requestContext.middleware";
import { optionalApiKeyAuth } from "./middleware/apiKey.middleware";
import { hasPermission } from "./services/rbac.service";

import { startTrialExpiryCron } from "./cron/trial.cron";
import { startMetaTokenRefreshCron } from "./cron/metaTokenRefresh.cron";
import { startUsageResetCron } from "./cron/resetUsage.cron";

import { isAppError } from "./utils/AppError";
import { asyncHandler } from "./utils/asyncHandler";
import logger from "./utils/logger";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "./observability/sentry";

initializeSentry();
const app = express();
configurePassport();

app.set("trust proxy", 1);
app.disable("x-powered-by");

const allowedOrigins = new Set(env.ALLOWED_FRONTEND_ORIGINS);
const TRUSTED_SITE_SUFFIX = "automexiaai.in";
const sameSiteOrigins = new Set<string>();

const addSameSiteOrigins = (origin?: string) => {
  if (!origin) {
    return;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname !== TRUSTED_SITE_SUFFIX &&
      !hostname.endsWith(`.${TRUSTED_SITE_SUFFIX}`)
    ) {
      return;
    }

    for (const candidate of [
      TRUSTED_SITE_SUFFIX,
      `www.${TRUSTED_SITE_SUFFIX}`,
      `app.${TRUSTED_SITE_SUFFIX}`,
    ]) {
      sameSiteOrigins.add(`${url.protocol}//${candidate}`);
    }
  } catch {
    // Ignore invalid origins here because env validation already handles them.
  }
};

const isAllowedOrigin = (origin: string) => {
  const normalizedOrigin = new URL(origin).origin;

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  return sameSiteOrigins.has(normalizedOrigin);
};

addSameSiteOrigins(env.FRONTEND_ORIGIN);
addSameSiteOrigins(env.BACKEND_ORIGIN);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    try {
      const normalizedOrigin = new URL(origin).origin;

      if (isAllowedOrigin(normalizedOrigin)) {
        return callback(null, true);
      }
    } catch {
      return callback(new Error("Invalid CORS origin"));
    }

    console.warn("Blocked CORS origin", { origin });
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Api-Key",
    "Cache-Control",
    "Stripe-Signature",
    "X-Requested-With",
    "X-Request-Id",
    "Sentry-Trace",
    "Baggage",
  ],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400,
};

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },
    hsts: env.IS_PROD
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  })
);

app.use(requestContextMiddleware);
app.use(compression());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(globalLimiter);
app.use(cookieParser());
app.use(passport.initialize());

app.use(monitoringMiddleware);

app.use((req, res, next) => {
  res.setTimeout(15000, () => {
    req.logger?.error(
      {
        statusCode: 408,
      },
      "Request timeout"
    );
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: "Request Timeout",
        requestId: (req as any).requestId,
      });
    }
  });
  next();
});

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

app.use(
  "/webhook/instagram",
  express.raw({
    type: "application/json",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
  instagramWebhook
);

app.use(express.json({ limit: "1mb" }));

type EnqueueRequestBody = Partial<AIMessagePayload> & {
  messages?: Partial<AIMessagePayload>[];
  idempotencyKey?: string;
};

const normalizeIncomingMessage = (
  raw: Partial<AIMessagePayload>
): AIMessagePayload => {
  const message = String(raw.message || "").trim();
  const businessId = String(raw.businessId || "").trim();
  const leadId = String(raw.leadId || "").trim();

  if (!message || !businessId || !leadId) {
    throw new Error("businessId, leadId, and message are required");
  }

  return {
    businessId,
    leadId,
    message,
    kind: raw.kind || "router",
    plan: raw.plan,
    platform: raw.platform,
    senderId: raw.senderId,
    pageId: raw.pageId,
    phoneNumberId: raw.phoneNumberId,
    accessTokenEncrypted: raw.accessTokenEncrypted,
    externalEventId: raw.externalEventId?.trim(),
    idempotencyKey: raw.idempotencyKey?.trim(),
    metadata: raw.metadata,
    skipInboundPersist: raw.skipInboundPersist ?? false,
    retryCount: raw.retryCount ?? 0,
  };
};

const extractMessages = (body: EnqueueRequestBody) => {
  const payload = Array.isArray(body.messages) ? body.messages : [body];

  if (!payload.length) {
    throw new Error("messages array is required");
  }

  if (payload.length > env.AI_API_MAX_BATCH_SIZE) {
    throw new Error(
      `messages array exceeds limit of ${env.AI_API_MAX_BATCH_SIZE}`
    );
  }

  return payload.map(normalizeIncomingMessage);
};

app.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      message: "API Running",
      environment: env.NODE_ENV,
      queue: AI_QUEUE_NAME,
    });
  })
);

app.post("/v1/messages", optionalApiKeyAuth, asyncHandler(async (req: any, res) => {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const body = (req.body || {}) as EnqueueRequestBody;
    const messages = extractMessages(body);

    if (req.apiKey) {
      if (!hasPermission({ permissions: req.apiKey.permissions }, "messages:enqueue")) {
        return res.status(403).json({
          success: false,
          requestId: req.requestId,
          message: "API key does not have permission to enqueue messages",
        });
      }

      const crossTenantMessage = messages.find(
        (message) => message.businessId !== req.apiKey.businessId
      );

      if (crossTenantMessage) {
        return res.status(403).json({
          success: false,
          requestId: req.requestId,
          message: "Cross-tenant message enqueue is not allowed",
        });
      }
    }

    const enqueue = enqueueAIBatch(messages, {
      source: "api",
      idempotencyKey:
        typeof body.idempotencyKey === "string"
          ? body.idempotencyKey.trim()
          : undefined,
    });

    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Queue enqueue timeout"));
      }, env.API_REQUEST_TIMEOUT_MS);
    });

    const jobs = await Promise.race([enqueue, timeout]);

    res.status(202).json({
      success: true,
      requestId: req.requestId,
      queue: AI_QUEUE_NAME,
      accepted: messages.length,
      jobs: jobs.length,
    });
  } catch (error) {
    const message = String(
      (error as { message?: unknown })?.message || "Unable to enqueue messages"
    );
    const statusCode = /timeout/i.test(message) ? 503 : 400;

    res.status(statusCode).json({
      success: false,
      requestId: req.requestId,
      message,
    });
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}));

app.use("/api/auth", authRoutes);
app.use("/api/auth", googleAuthRoutes);

app.use("/api/dashboard", protect, dashboardRoutes);
app.use("/api/billing", protect, billingRoutes);
app.use("/api/usage", protect, usageRoutes);
app.use("/api/help-ai", protect, helpAiRoutes);
app.use("/api/user", protect, userRoutes);
app.use("/api/notifications", protect, notificationRoutes);

app.use("/api/ai", protect, attachBillingContext, aiLimiter, aiRoutes);
app.use("/api/automation", protect, attachBillingContext, automationRoutes);
app.use("/api/messages", protect, attachBillingContext, messageRoutes);
app.use("/api/conversations", protect, conversationRoutes);
app.use(
  "/api/comment-triggers",
  protect,
  attachBillingContext,
  commentTriggerRoutes
);

app.use("/api/clients", protect, clientRoutes);
app.use("/api/instagram", protect, instagramRoutes);
app.use("/api/knowledge", protect, knowledgeRoutes);
app.use("/api/training", protect, trainingRoutes);
app.use("/api/leads", protect, leadRoutes);
app.use("/api/analytics", protect, analyticsRoutes);
app.use("/api/audit", protect, auditRoutes);
app.use("/api/search", protect, searchRoutes);
app.use("/api/security", protect, securityRoutes);
app.use("/api/integrations", protect, integrationRoutes);
app.use("/api/oauth", protect, oauthRoutes);
app.use("/api/booking", protect, attachBillingContext, bookingRoutes);
app.use(
  "/api/availability",
  protect,
  attachBillingContext,
  availabilityRoutes
);
app.use("/api/health", healthRoutes);

app.get("/health", (req: any, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

app.use((req: any, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    requestId: req.requestId,
  });
});

app.use((err: any, req: any, res: any, _next: any) => {
  req.logger?.error(
    {
      error: err,
      path: req.originalUrl,
      method: req.method,
    },
    "Unhandled request error"
  );

  captureExceptionWithContext(err, {
    tags: {
      layer: "express",
    },
    extras: {
      path: req.originalUrl,
      method: req.method,
    },
  });

  if (isAppError(err)) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      details: err.details || null,
      requestId: req.requestId,
    });
  }

  return res.status(500).json({
    success: false,
    message: env.IS_PROD ? "Internal server error" : err.message,
    requestId: req.requestId,
  });
});

if (process.env.ENABLE_CRON === "true") {
  startTrialExpiryCron();
  startMetaTokenRefreshCron();
  startUsageResetCron();
}

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Unhandled uncaught exception in app");
  captureExceptionWithContext(err, {
    tags: {
      layer: "process",
      event: "uncaughtException",
    },
  });
});

process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled rejection in app");
  captureExceptionWithContext(err, {
    tags: {
      layer: "process",
      event: "unhandledRejection",
    },
  });
});

export default app;
