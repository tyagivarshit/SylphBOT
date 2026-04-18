import prisma from "../config/prisma";
import redis from "../config/redis";
import {
  IDEMPOTENCY_TTL_SECONDS,
  buildIdempotencyRedisKey,
} from "./redisState.service";

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

  try {
    const lockAcquired = await acquireRedisLock(eventId, platform);

    if (!lockAcquired) {
      return false;
    }

    const exists = await checkDatabaseDuplicate(eventId);

    if (exists) {
      return false;
    }

    await saveWebhookEvent(eventId, platform);
    return true;
  } catch (error) {
    console.error("[WEBHOOK PROCESS ERROR]", error);
    return true;
  }
};
