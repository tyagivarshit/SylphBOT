import cron from "node-cron";
import logger from "../utils/logger";
import { runIntelligenceLoop } from "../services/intelligence/intelligenceOS.service";
import prisma from "../config/prisma";
import { acquireDistributedLock } from "../services/distributedLock.service";

export const startIntelligenceLoopCron = () =>
  cron.schedule("15 * * * *", async () => {
    const lock = await acquireDistributedLock({
      key: "intelligence:loop:leader",
      ttlMs: 90_000,
      refreshIntervalMs: 30_000,
      waitMs: 0,
    });

    if (!lock) {
      logger.info("Intelligence loop cron skipped because another leader is active");
      return;
    }

    try {
      const businesses = await prisma.business.findMany({
        where: {
          deletedAt: null,
          onboardingCompleted: true,
        },
        select: {
          id: true,
        },
        take: 20,
      });

      if (businesses.length) {
        for (const business of businesses) {
          await runIntelligenceLoop({
            businessId: business.id,
          });
        }

        logger.info(
          {
            businesses: businesses.length,
          },
          "Intelligence loop cron completed"
        );
        return;
      }

      logger.info("Intelligence loop cron skipped because no active business was found");
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Intelligence loop cron failed"
      );
    } finally {
      await lock.release().catch(() => undefined);
    }
  });
