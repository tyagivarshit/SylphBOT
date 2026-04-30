import cron from "node-cron";
import redis from "../config/redis";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import { acquireDistributedLock } from "../services/distributedLock.service";
import { generateConversationSummary } from "../services/conversationSummary.service";

const MESSAGE_LIMIT = 50;
const CLEANUP_BATCH = 100;
const INACTIVE_DAYS = 90;
const MESSAGE_CLEANUP_LEADER_KEY = "message-cleanup:leader";

const cleanupMessages = async () => {
  const leads = await prisma.lead.findMany({
    select: { id: true },
    take: CLEANUP_BATCH,
  });

  for (const lead of leads) {
    const messages = await prisma.message.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (messages.length <= MESSAGE_LIMIT) {
      continue;
    }

    const idsToDelete = messages.slice(MESSAGE_LIMIT).map((message) => message.id);
    await prisma.message.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
      },
    });
  }
};

const generateSummaries = async () => {
  const leads = await prisma.lead.findMany({
    select: { id: true },
    take: CLEANUP_BATCH,
  });

  for (const lead of leads) {
    await generateConversationSummary(lead.id);
  }
};

const clearRedisConversationCache = async () => {
  const keys = await redis.keys("conversation:*");

  if (!keys.length) {
    return;
  }

  await redis.del(...keys);
};

const cleanupInactiveLeads = async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);

  const leads = await prisma.lead.findMany({
    where: {
      lastMessageAt: {
        lt: cutoff,
      },
      deletedAt: null,
    },
    select: { id: true },
    take: CLEANUP_BATCH,
  });

  for (const lead of leads) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
};

export const runMessageCleanup = async () => {
  await cleanupMessages();
  await generateSummaries();
  await clearRedisConversationCache();
  await cleanupInactiveLeads();
};

export const startMessageCleanupCron = () =>
  cron.schedule("15 */2 * * *", async () => {
    const lock = await acquireDistributedLock({
      key: MESSAGE_CLEANUP_LEADER_KEY,
      ttlMs: 10 * 60_000,
      refreshIntervalMs: 2 * 60_000,
      waitMs: 0,
    });

    if (!lock) {
      return;
    }

    try {
      await runMessageCleanup();
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Message cleanup cron failed"
      );
    } finally {
      await lock.release().catch(() => undefined);
    }
  });
