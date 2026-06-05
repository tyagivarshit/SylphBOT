import prisma from "../config/prisma";
import redis from "../config/redis";
import {
  IDEMPOTENCY_TTL_SECONDS,
  buildIdempotencyRedisKey,
} from "./redisState.service";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliability/reliabilityOS.service";

export type WebhookPlatform =
  | "INSTAGRAM"
  | "WHATSAPP"
  | "STRIPE"
  | "OTHER";

interface WebhookCheckInput {
  eventId: string;
  platform: WebhookPlatform;
  correlationId?: string | null;
  tenantId?: string | null;
}

const buildKey = (eventId: string, platform: WebhookPlatform) =>
  buildIdempotencyRedisKey(`${platform}:${eventId}`);

const acquireRedisLock = async (
  eventId: string,
  platform: WebhookPlatform
): Promise<boolean> => {
  const key = buildKey(eventId, platform);

  try {
    const result = await redis.set(
      key,
      "1",
      "EX",
      IDEMPOTENCY_TTL_SECONDS,
      "NX"
    );

    return result === "OK";
  } catch (error) {
    console.error("[WEBHOOK REDIS ERROR]", error);
    return true;
  }
};

const checkDatabaseDuplicate = async (
  eventId: string
): Promise<boolean> => {
  try {
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
      select: { id: true },
    });

    return !!existing;
  } catch (error) {
    console.error("[WEBHOOK DB CHECK ERROR]", error);
    return false;
  }
};

const saveWebhookEvent = async (
  eventId: string,
  platform: WebhookPlatform,
  correlationId?: string | null
): Promise<boolean> => {
  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        platform,
        correlationId: correlationId || null,
      },
    });
    return true;
  } catch (error: any) {
    if (error?.code === "P2002") {
      return false;
    }

    console.error("[WEBHOOK SAVE ERROR]", error);
    throw error;
  }
};

export const processWebhookEvent = async ({
  eventId,
  platform,
  correlationId = null,
  tenantId = null,
}: WebhookCheckInput): Promise<boolean> => {
  if (process.env.WEBHOOK_DEDUP_ENABLED === "false") {
    return true;
  }

  if (!eventId) return true;
  const traceId = `webhook_${platform}_${eventId}`;

  try {
    const lockAcquired = await acquireRedisLock(eventId, platform);

    if (!lockAcquired) {
      await recordObservabilityEvent({
        businessId: tenantId,
        tenantId,
        eventType: "webhook.dedupe.duplicate",
        message: `[correlationId=${correlationId}] Webhook duplicate skipped for ${platform}`,
        severity: "info",
        context: {
          traceId,
          correlationId: correlationId || traceId,
          provider: platform,
          component: "webhook-reconciliation",
          phase: "providers",
          tenantId,
        },
        metadata: {
          eventId,
          reason: "redis_lock_exists",
          correlationId,
        },
      }).catch(() => undefined);
      return false;
    }

    const checkDbPromise = checkDatabaseDuplicate(eventId);
    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => {
        console.warn("[WEBHOOK DB CHECK TIMEOUT] fallback to false", { eventId, correlationId });
        resolve(false);
      }, 150)
    );
    const exists = await Promise.race([checkDbPromise, timeoutPromise]);

    if (exists) {
      await recordObservabilityEvent({
        businessId: tenantId,
        tenantId,
        eventType: "webhook.dedupe.duplicate",
        message: `[correlationId=${correlationId}] Webhook duplicate skipped for ${platform}`,
        severity: "info",
        context: {
          traceId,
          correlationId: correlationId || traceId,
          provider: platform,
          component: "webhook-reconciliation",
          phase: "providers",
          tenantId,
        },
        metadata: {
          eventId,
          reason: "db_duplicate",
          correlationId,
        },
      }).catch(() => undefined);
      return false;
    }

    // Save webhook event in a blocking manner
    const saved = await saveWebhookEvent(eventId, platform, correlationId);
    if (!saved) {
      await recordObservabilityEvent({
        businessId: tenantId,
        tenantId,
        eventType: "webhook.dedupe.duplicate",
        message: `[correlationId=${correlationId}] Webhook duplicate skipped for ${platform}`,
        severity: "info",
        context: {
          traceId,
          correlationId: correlationId || traceId,
          provider: platform,
          component: "webhook-reconciliation",
          phase: "providers",
          tenantId,
        },
        metadata: {
          eventId,
          reason: "db_unique_constraint",
          correlationId,
        },
      }).catch(() => undefined);
      return false;
    }

    await recordTraceLedger({
      traceId,
      correlationId: correlationId || traceId,
      businessId: tenantId,
      tenantId,
      stage: `webhook:${platform}:accepted`,
      status: "COMPLETED",
      endedAt: new Date(),
      metadata: {
        eventId,
        correlationId,
      },
    }).catch(() => undefined);
    return true;
  } catch (error) {
    console.error(`[WEBHOOK PROCESS ERROR] [correlationId=${correlationId}]`, error);
    await recordObservabilityEvent({
      businessId: tenantId,
      tenantId,
      eventType: "webhook.dedupe.error",
      message: `[correlationId=${correlationId}] Webhook dedupe failed for ${platform}`,
      severity: "error",
      context: {
        traceId,
        correlationId: correlationId || traceId,
        provider: platform,
        component: "webhook-reconciliation",
        phase: "providers",
        tenantId,
      },
      metadata: {
        eventId,
        error: String((error as { message?: unknown })?.message || error || "webhook_dedupe_failed"),
        correlationId,
      },
    }).catch(() => undefined);
    return true;
  }
};

export const rollbackWebhookEvent = async ({
  eventId,
  platform,
  correlationId = null,
  tenantId = null,
}: WebhookCheckInput) => {
  if (process.env.WEBHOOK_DEDUP_ENABLED === "false") {
    return;
  }

  if (!eventId) {
    return;
  }

  const traceId = `webhook_${platform}_${eventId}`;
  const redisKey = buildKey(eventId, platform);

  const [redisResult, dbResult] = await Promise.allSettled([
    redis.del(redisKey),
    prisma.webhookEvent.deleteMany({
      where: {
        eventId,
      },
    }),
  ]);

  await recordObservabilityEvent({
    businessId: tenantId,
    tenantId,
    eventType: "webhook.dedupe.rollback",
    message: `[correlationId=${correlationId}] Webhook dedupe rollback executed for ${platform}`,
    severity: "warn",
    context: {
      traceId,
      correlationId: correlationId || traceId,
      provider: platform,
      component: "webhook-reconciliation",
      phase: "providers",
      tenantId,
    },
    metadata: {
      eventId,
      redisRollback: redisResult.status,
      dbRollback: dbResult.status,
      correlationId,
    },
  }).catch(() => undefined);
};
