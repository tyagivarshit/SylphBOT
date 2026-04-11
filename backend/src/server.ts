import { randomUUID } from "crypto";
import http from "http";
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { closeRedisConnection } from "./config/redis";
import {
  AIMessagePayload,
  AI_QUEUE_NAME,
  closeAIQueue,
  enqueueAIBatch,
} from "./queues/ai.queue";

type EnqueueRequestBody = Partial<AIMessagePayload> & {
  messages?: Partial<AIMessagePayload>[];
  idempotencyKey?: string;
};

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(compression());
app.use(
  cors({
    origin:
      env.ALLOWED_FRONTEND_ORIGINS.length > 0
        ? env.ALLOWED_FRONTEND_ORIGINS
        : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.use((req: express.Request & { requestId?: string }, res, next) => {
  const requestId = req.header("x-request-id") || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

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

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    queue: AI_QUEUE_NAME,
  });
});

app.get("/health", (req: express.Request & { requestId?: string }, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    queue: AI_QUEUE_NAME,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

app.post(
  "/v1/messages",
  async (req: express.Request & { requestId?: string }, res) => {
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      const body = (req.body || {}) as EnqueueRequestBody;
      const messages = extractMessages(body);

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
  }
);

app.use((req: express.Request & { requestId?: string }, res) => {
  res.status(404).json({
    success: false,
    requestId: req.requestId,
    message: "Route not found",
  });
});

const server = http.createServer(app);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 15000;

let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await Promise.allSettled([closeAIQueue(), closeRedisConnection()]);

  if (signal === "uncaughtException") {
    process.exit(1);
  }

  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  console.error(`[server] ${String(error.message || error)}`);
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  console.error(
    `[server] ${String((error as { message?: unknown })?.message || error)}`
  );
});

server.listen(env.PORT, () => {
  console.log(`[server] listening on ${env.PORT}`);
});
