import prisma from "../config/prisma";
import redis from "../config/redis";


/*
====================================================
CONFIG
====================================================
*/

const REDIS_PREFIX = "sylph:webhook:event:";
const REDIS_TTL = 60 * 10; // 🔥 10 min (better than 1 hour)

/*
====================================================
TYPES
====================================================
*/

export type WebhookPlatform =
  | "INSTAGRAM"
  | "WHATSAPP"
  | "STRIPE"
  | "OTHER";

interface WebhookCheckInput {
  eventId: string;
  platform: WebhookPlatform;
}

/*
====================================================
KEY BUILDER (🔥 FIXED)
====================================================
*/

const buildKey = (eventId: string, platform: WebhookPlatform) => {
  return `${REDIS_PREFIX}${platform}:${eventId}`;
};

/*
====================================================
REDIS LOCK
====================================================
*/

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
      REDIS_TTL,
      "NX"
    );

    return result === "OK";

  } catch (error) {

    console.error("[WEBHOOK REDIS ERROR]", error);

    /* fail-open */
    return true;

  }

};

/*
====================================================
DATABASE CHECK
====================================================
*/

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

/*
====================================================
SAVE EVENT (SAFE)
====================================================
*/

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

/*
====================================================
MAIN PROCESSOR (10/10 FINAL)
====================================================
*/

export const processWebhookEvent = async ({
  eventId,
  platform,
}: WebhookCheckInput): Promise<boolean> => {

  if (!eventId) return true;

  try {

    /* STEP 1 — REDIS LOCK */
    const lockAcquired = await acquireRedisLock(eventId, platform);

    if (!lockAcquired) {
      return false;
    }

    /* STEP 2 — DB CHECK */
    const exists = await checkDatabaseDuplicate(eventId);

    if (exists) {
      return false;
    }

    /* STEP 3 — SAVE */
    await saveWebhookEvent(eventId, platform);

    return true;

  } catch (error) {

    console.error("[WEBHOOK PROCESS ERROR]", error);

    return true; // fail-open

  }

};