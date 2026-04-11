import os from "os";
import { UnrecoverableError, Worker } from "bullmq";
import prisma from "../config/prisma";
import { env } from "../config/env";
import {
  closeRedisConnection,
  getWorkerRedisConnection,
} from "../config/redis";
import {
  AIJobPayload,
  AIMessagePayload,
  AI_QUEUE_NAME,
  enqueueAIBatch,
} from "../queues/ai.queue";
import { handleIncomingMessage } from "../services/executionRouter.servce";

type NormalizedReply = {
  text: string;
  cta?: string | null;
};

const workerRedis = getWorkerRedisConnection();
const workerId = `${os.hostname()}:${process.pid}`;
const leaderLockKey = `${env.AI_QUEUE_PREFIX}:${AI_QUEUE_NAME}:leader`;

let worker: Worker<AIJobPayload> | null = null;
let renewTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

const normalizeReply = (reply: unknown): NormalizedReply | null => {
  if (typeof reply === "string") {
    const text = reply.trim();
    return text ? { text } : null;
  }

  if (!reply || typeof reply !== "object") {
    return null;
  }

  const candidate = reply as { message?: unknown; cta?: unknown };
  const text = String(candidate.message || "").trim();

  if (!text) {
    return null;
  }

  return {
    text,
    cta: typeof candidate.cta === "string" ? candidate.cta : null,
  };
};

const isRetryableError = (error: unknown) => {
  if (error instanceof UnrecoverableError) {
    return false;
  }

  const code = String((error as { code?: unknown })?.code || "");
  const message = String((error as { message?: unknown })?.message || "");

  if (
    ["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN"].includes(
      code
    )
  ) {
    return true;
  }

  return /ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|timed out|temporar/i.test(
    message
  );
};

const markSkipInboundPersist = (
  error: unknown,
  skipInboundPersist: boolean
) => {
  if (error && typeof error === "object") {
    (
      error as {
        skipInboundPersist?: boolean;
      }
    ).skipInboundPersist = skipInboundPersist;
  }
};

const persistInboundMessage = async (
  message: AIMessagePayload,
  batchId: string
) => {
  await prisma.message.create({
    data: {
      leadId: message.leadId,
      content: message.message,
      sender: "USER",
      metadata: {
        batchId,
        externalEventId: message.externalEventId || null,
        platform: message.platform || null,
      },
    },
  });

  await prisma.lead.update({
    where: {
      id: message.leadId,
    },
    data: {
      lastMessageAt: new Date(),
      unreadCount: {
        increment: 1,
      },
    },
  });
};

const persistAIReply = async (
  message: AIMessagePayload,
  batchId: string,
  reply: NormalizedReply
) => {
  await prisma.message.create({
    data: {
      leadId: message.leadId,
      content: reply.text,
      sender: "AI",
      metadata: {
        batchId,
        cta: reply.cta || null,
        platform: message.platform || null,
        sourceKind: message.kind || "router",
      },
    },
  });

  await prisma.lead.update({
    where: {
      id: message.leadId,
    },
    data: {
      lastMessageAt: new Date(),
    },
  });
};

const processMessage = async (message: AIMessagePayload, batchId: string) => {
  if (!message.businessId || !message.leadId || !message.message) {
    throw new UnrecoverableError("Invalid AI job payload");
  }

  const lead = await prisma.lead.findUnique({
    where: {
      id: message.leadId,
    },
    select: {
      id: true,
      isHumanActive: true,
    },
  });

  if (!lead) {
    throw new UnrecoverableError(`Lead not found: ${message.leadId}`);
  }

  let skipInboundPersist = Boolean(message.skipInboundPersist);

  try {
    if (!skipInboundPersist) {
      await persistInboundMessage(message, batchId);
      skipInboundPersist = true;
    }

    if (lead.isHumanActive) {
      return;
    }

    const rawReply = await handleIncomingMessage({
      businessId: message.businessId,
      leadId: message.leadId,
      message: message.message,
      plan: message.plan || null,
    });

    const reply = normalizeReply(rawReply);

    if (!reply) {
      return;
    }

    await persistAIReply(message, batchId, reply);
  } catch (error) {
    markSkipInboundPersist(error, skipInboundPersist);
    throw error;
  }
};

const scheduleRetryBatch = async (messages: AIMessagePayload[]) => {
  const retryAttempt = Math.max(
    1,
    ...messages.map((message) => message.retryCount || 1)
  );

  const delayMs = Math.min(
    env.AI_JOB_BACKOFF_MS * 2 ** (retryAttempt - 1),
    env.AI_JOB_BACKOFF_MS * 8
  );

  await enqueueAIBatch(messages, {
    source: "retry",
    delayMs,
    forceUniqueJobId: true,
  });
};

const acquireLeaderLock = async () => {
  const result = await workerRedis.set(
    leaderLockKey,
    workerId,
    "PX",
    env.AI_WORKER_LEADER_LOCK_TTL_MS,
    "NX"
  );

  if (result !== "OK") {
    throw new Error("ai.worker already running");
  }
};

const renewLeaderLock = async () => {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    end
    return 0
  `;

  const result = await workerRedis.eval(
    script,
    1,
    leaderLockKey,
    workerId,
    String(env.AI_WORKER_LEADER_LOCK_TTL_MS)
  );

  if (Number(result) !== 1) {
    throw new Error("Lost AI worker leader lock");
  }
};

const releaseLeaderLock = async () => {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
  `;

  await workerRedis.eval(script, 1, leaderLockKey, workerId);
};

const startLeaderLockHeartbeat = () => {
  renewTimer = setInterval(() => {
    void renewLeaderLock().catch((error) => {
      console.error(`[ai.worker] ${String(error.message || error)}`);
      void shutdown("leader-lock-lost");
    });
  }, env.AI_WORKER_LEADER_LOCK_RENEW_MS);

  renewTimer.unref();
};

const createWorker = () =>
  new Worker<AIJobPayload>(
    AI_QUEUE_NAME,
    async (job) => {
      if (!job.data.messages.length) {
        throw new UnrecoverableError("Empty AI job batch");
      }

      const retryableMessages: AIMessagePayload[] = [];

      for (const message of job.data.messages) {
        try {
          await processMessage(message, job.data.batchId);
        } catch (error) {
          const nextRetryCount = (message.retryCount || 0) + 1;
          const skipInboundPersist =
            (error as { skipInboundPersist?: boolean })?.skipInboundPersist ??
            message.skipInboundPersist ??
            false;

          if (isRetryableError(error) && nextRetryCount < env.AI_JOB_ATTEMPTS) {
            retryableMessages.push({
              ...message,
              retryCount: nextRetryCount,
              skipInboundPersist,
            });
            continue;
          }

          console.error(
            `[ai.worker] failed message lead=${message.leadId} retry=${message.retryCount || 0} ${String(
              (error as { message?: unknown })?.message || error
            )}`
          );
        }
      }

      if (retryableMessages.length) {
        await scheduleRetryBatch(retryableMessages);
      }
    },
    {
      connection: workerRedis,
      prefix: env.AI_QUEUE_PREFIX,
      concurrency: env.AI_WORKER_CONCURRENCY,
      limiter: {
        max: env.AI_WORKER_RATE_LIMIT_MAX,
        duration: env.AI_WORKER_RATE_LIMIT_DURATION_MS,
      },
      lockDuration: env.AI_WORKER_LOCK_DURATION_MS,
      stalledInterval: env.AI_WORKER_STALLED_INTERVAL_MS,
      maxStalledCount: 1,
      drainDelay: env.AI_WORKER_DRAIN_DELAY_SECONDS,
    }
  );

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (renewTimer) {
    clearInterval(renewTimer);
    renewTimer = null;
  }

  try {
    if (worker) {
      await worker.close();
      worker = null;
    }
  } catch {}

  try {
    await releaseLeaderLock();
  } catch {}

  await Promise.allSettled([prisma.$disconnect(), closeRedisConnection()]);

  if (signal === "uncaughtException") {
    process.exit(1);
  }

  if (signal === "leader-lock-lost" || signal === "bootstrap") {
    process.exit(1);
  }

  process.exit(0);
};

const bootstrap = async () => {
  await acquireLeaderLock();
  startLeaderLockHeartbeat();

  worker = createWorker();

  worker.on("error", (error) => {
    console.error(`[ai.worker] ${String(error.message || error)}`);
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[ai.worker] job failed id=${String(job?.id || "unknown")} ${String(
        error.message || error
      )}`
    );
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  console.error(`[ai.worker] ${String(error.message || error)}`);
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  console.error(
    `[ai.worker] ${String((error as { message?: unknown })?.message || error)}`
  );
});

void bootstrap().catch(async (error) => {
  console.error(`[ai.worker] ${String(error.message || error)}`);
  await shutdown("bootstrap");
  process.exit(1);
});
