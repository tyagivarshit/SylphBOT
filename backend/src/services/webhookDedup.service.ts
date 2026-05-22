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
  platform: WebhookPlatform
) => {
  try {
    await prisma.webhookEvent.create({
      data: {
        eventId,
        platform,
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return;
    }

    console.error("[WEBHOOK SAVE ERROR]", error);
  }
};

export const processWebhookEvent = async ({
  eventId,
  platform,
}: WebhookCheckInput): Promise<boolean> => {
  if (!eventId) return true;
  const traceId = `webhook_${platform}_${eventId}`;

  try {
    const lockAcquired = await acquireRedisLock(eventId, platform);

    if (!lockAcquired) {
      await recordObservabilityEvent({
        eventType: "webhook.dedupe.duplicate",
        message: `Webhook duplicate skipped for ${platform}`,
        severity: "info",
        context: {
          traceId,
          correlationId: traceId,
          provider: platform,
          component: "webhook-reconciliation",
          phase: "providers",
        },
        metadata: {
          eventId,
          reason: "redis_lock_exists",
        },
      }).catch(() => undefined);
      return false;
    }

    const checkDbPromise = checkDatabaseDuplicate(eventId);
    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => {
        console.warn("[WEBHOOK DB CHECK TIMEOUT] fallback to false", { eventId });
        resolve(false);
      }, 150)
    );
    const exists = await Promise.race([checkDbPromise, timeoutPromise]);

    if (exists) {
      await recordObservabilityEvent({
        eventType: "webhook.dedupe.duplicate",
        message: `Webhook duplicate skipped for ${platform}`,
        severity: "info",
        context: {
          traceId,
          correlationId: traceId,
          provider: platform,
          component: "webhook-reconciliation",
          phase: "providers",
        },
        metadata: {
          eventId,
          reason: "db_duplicate",
        },
      }).catch(() => undefined);
      return false;
    }

    // Save webhook event asynchronously in the background (non-blocking)
    void saveWebhookEvent(eventId, platform).catch((err) => {
      console.error("[WEBHOOK SAVE BACKGROUND ERROR]", err);
    });

    await recordTraceLedger({
      traceId,
      correlationId: traceId,
      stage: `webhook:${platform}:accepted`,
      status: "COMPLETED",
      endedAt: new Date(),
      metadata: {
        eventId,
      },
    }).catch(() => undefined);
    return true;
  } catch (error) {
    console.error("[WEBHOOK PROCESS ERROR]", error);
    await recordObservabilityEvent({
      eventType: "webhook.dedupe.error",
      message: `Webhook dedupe failed for ${platform}`,
      severity: "error",
      context: {
        traceId,
        correlationId: traceId,
        provider: platform,
        component: "webhook-reconciliation",
        phase: "providers",
      },
      metadata: {
        eventId,
        error: String((error as { message?: unknown })?.message || error || "webhook_dedupe_failed"),
      },
    }).catch(() => undefined);
    return true;
  }
};

export const rollbackWebhookEvent = async ({
  eventId,
  platform,
}: WebhookCheckInput) => {
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
    eventType: "webhook.dedupe.rollback",
    message: `Webhook dedupe rollback executed for ${platform}`,
    severity: "warn",
    context: {
      traceId,
      correlationId: traceId,
      provider: platform,
      component: "webhook-reconciliation",
      phase: "providers",
    },
    metadata: {
      eventId,
      redisRollback: redisResult.status,
      dbRollback: dbResult.status,
    },
  }).catch(() => undefined);
};
