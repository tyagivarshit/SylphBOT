import cron from "node-cron";
import prisma from "../config/prisma";
import { env } from "../config/env";
import {
  enqueueCalendarSyncHealthSweepJob,
  enqueueCalendarSyncOutboxEventJob,
} from "../queues/calendarSync.queue";
import { hasOutboxConsumerCheckpoint } from "../services/eventOutbox.service";
import logger from "../utils/logger";

const CALENDAR_SYNC_OUTBOX_CONSUMER_KEY = "calendar_sync.worker";

const resolveCalendarWebhookCallbackUrl = () => {
  const explicit = String(process.env.CALENDAR_WEBHOOK_CALLBACK_URL || "").trim();

  if (explicit) {
    return explicit;
  }

  if (env.BACKEND_URL) {
    return `${env.BACKEND_URL}/api/webhook/calendar/outlook`;
  }

  return "";
};

export const runCalendarSyncOutboxPump = async () => {
  const rows = await prisma.eventOutbox.findMany({
    where: {
      OR: [
        {
          eventType: {
            startsWith: "appointment.",
          },
        },
        {
          eventType: {
            startsWith: "calendar.sync.",
          },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 200,
  });

  for (const row of rows) {
    const processed = await hasOutboxConsumerCheckpoint({
      eventOutboxId: row.id,
      consumerKey: CALENDAR_SYNC_OUTBOX_CONSUMER_KEY,
    });

    if (processed) {
      continue;
    }

    await enqueueCalendarSyncOutboxEventJob({
      outboxId: row.id,
    }).catch(() => undefined);
  }

  return {
    scanned: rows.length,
  };
};

export const startCalendarSyncCron = () =>
  cron.schedule("*/1 * * * *", async () => {
    try {
      await runCalendarSyncOutboxPump();
      const callbackUrl = resolveCalendarWebhookCallbackUrl();

      if (callbackUrl) {
        await enqueueCalendarSyncHealthSweepJob({
          watchCallbackUrl: callbackUrl,
        });
      }
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Calendar sync cron failed"
      );
    }
  });
