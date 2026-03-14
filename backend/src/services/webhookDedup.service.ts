import prisma from "../config/prisma";
import Redis from "ioredis";

/*
====================================================
REDIS CONNECTION (RESILIENT)
====================================================
*/

const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  lazyConnect: true,
  reconnectOnError: () => true,
});

/*
====================================================
CONFIG
====================================================
*/

const REDIS_PREFIX = "sylph:webhook:event:";
const REDIS_TTL = 60 * 60; // 1 hour

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
REDIS KEY BUILDER
====================================================
*/

const buildKey = (eventId: string) => {
  return `${REDIS_PREFIX}${eventId}`;
};

/*
====================================================
FAST REDIS LOCK
Prevents race conditions across workers
====================================================
*/

const acquireRedisLock = async (
  eventId: string
): Promise<boolean> => {

  const key = buildKey(eventId);

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

    console.error("[WEBHOOK REDIS LOCK ERROR]", error);

    /* fail-open strategy */
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
SAVE EVENT
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

    /* race condition protection */

    if (error?.code === "P2002") {

      console.log(
        "[WEBHOOK DUPLICATE RACE]",
        platform,
        eventId
      );

      return;

    }

    console.error("[WEBHOOK SAVE ERROR]", error);

  }

};

/*
====================================================
MAIN PROCESSOR

Webhook
   ↓
Redis lock (fast)
   ↓
Database check (safe)
   ↓
Save event
   ↓
Process event
====================================================
*/

export const processWebhookEvent = async ({
  eventId,
  platform,
}: WebhookCheckInput): Promise<boolean> => {

  if (!eventId) return true;

  try {

    /* ----------------------------------------
    STEP 1 — REDIS LOCK
    ---------------------------------------- */

    const lockAcquired = await acquireRedisLock(eventId);

    if (!lockAcquired) {

      console.log(
        "[WEBHOOK BLOCKED REDIS]",
        platform,
        eventId
      );

      return false;

    }

    /* ----------------------------------------
    STEP 2 — DATABASE CHECK
    ---------------------------------------- */

    const dbDuplicate = await checkDatabaseDuplicate(eventId);

    if (dbDuplicate) {

      console.log(
        "[WEBHOOK BLOCKED DATABASE]",
        platform,
        eventId
      );

      return false;

    }

    /* ----------------------------------------
    STEP 3 — SAVE EVENT
    ---------------------------------------- */

    await saveWebhookEvent(eventId, platform);

    return true;

  } catch (error) {

    console.error("[WEBHOOK PROCESS ERROR]", error);

    /*
    FAIL OPEN STRATEGY
    Better process event than lose a message
    */

    return true;

  }

};