import prisma from "../config/prisma";
import { generateConversationSummary } from "../services/conversationSummary.service";
import redis from "../config/redis";


/*
---------------------------------------------------
CONFIG
---------------------------------------------------
*/

const MESSAGE_LIMIT = 50;
const CLEANUP_BATCH = 100;
const INACTIVE_DAYS = 90;

/*
---------------------------------------------------
CLEAN OLD MESSAGES
---------------------------------------------------
*/

const cleanupMessages = async () => {

  console.log("🧹 Message cleanup started");

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

    if (messages.length <= MESSAGE_LIMIT) continue;

    const idsToDelete = messages
      .slice(MESSAGE_LIMIT)
      .map((m) => m.id);

    await prisma.message.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    console.log(`🗑 Cleaned messages for lead ${lead.id}`);

  }

};

/*
---------------------------------------------------
GENERATE CONVERSATION SUMMARIES
---------------------------------------------------
*/

const generateSummaries = async () => {

  console.log("🧠 Generating conversation summaries");

  const leads = await prisma.lead.findMany({
    select: { id: true },
    take: CLEANUP_BATCH,
  });

  for (const lead of leads) {

    await generateConversationSummary(lead.id);

  }

};

/*
---------------------------------------------------
CLEAR REDIS CONVERSATION CACHE
---------------------------------------------------
*/

const clearRedisCache = async () => {

  console.log("⚡ Clearing conversation cache");

  const keys = await redis.keys("conversation:*");

  if (!keys.length) return;

  await redis.del(keys);

  console.log(`⚡ Cleared ${keys.length} cache keys`);

};

/*
---------------------------------------------------
INACTIVE LEAD CLEANUP
---------------------------------------------------
*/

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

    console.log(`📦 Archived inactive lead ${lead.id}`);

  }

};

/*
---------------------------------------------------
MAIN CRON JOB
---------------------------------------------------
*/

export const runMessageCleanup = async () => {

  console.log("🚀 Message cleanup cron started");

  try {

    await cleanupMessages();

    await generateSummaries();

    await clearRedisCache();

    await cleanupInactiveLeads();

    console.log("✅ Message cleanup completed");

  } catch (error) {

    console.error("🚨 Message cleanup failed:", error);

  }

};