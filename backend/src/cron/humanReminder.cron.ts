import cron from "node-cron";
import logger from "../utils/logger";
import { acquireDistributedLock } from "../services/distributedLock.service";
import { enqueueHumanReminderSweep } from "../queues/humanReminder.queue";

const HUMAN_REMINDER_LEADER_KEY = "human-reminder-sweep:leader";

export const startHumanReminderCron = () =>
  cron.schedule("*/3 * * * *", async () => {
    const lock = await acquireDistributedLock({
      key: HUMAN_REMINDER_LEADER_KEY,
      ttlMs: 120_000,
      waitMs: 0,
      refreshIntervalMs: 40_000,
    });

    if (!lock) {
      return;
    }

    try {
      await enqueueHumanReminderSweep({
        triggeredBy: "SCHEDULER",
        requestedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Human reminder cron failed"
      );
    } finally {
      await lock.release().catch(() => undefined);
    }
  });
