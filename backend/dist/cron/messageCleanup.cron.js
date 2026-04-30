"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMessageCleanupCron = exports.runMessageCleanup = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const redis_1 = __importDefault(require("../config/redis"));
const prisma_1 = __importDefault(require("../config/prisma"));
const logger_1 = __importDefault(require("../utils/logger"));
const distributedLock_service_1 = require("../services/distributedLock.service");
const conversationSummary_service_1 = require("../services/conversationSummary.service");
const MESSAGE_LIMIT = 50;
const CLEANUP_BATCH = 100;
const INACTIVE_DAYS = 90;
const MESSAGE_CLEANUP_LEADER_KEY = "message-cleanup:leader";
const cleanupMessages = async () => {
    const leads = await prisma_1.default.lead.findMany({
        select: { id: true },
        take: CLEANUP_BATCH,
    });
    for (const lead of leads) {
        const messages = await prisma_1.default.message.findMany({
            where: { leadId: lead.id },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });
        if (messages.length <= MESSAGE_LIMIT) {
            continue;
        }
        const idsToDelete = messages.slice(MESSAGE_LIMIT).map((message) => message.id);
        await prisma_1.default.message.deleteMany({
            where: {
                id: {
                    in: idsToDelete,
                },
            },
        });
    }
};
const generateSummaries = async () => {
    const leads = await prisma_1.default.lead.findMany({
        select: { id: true },
        take: CLEANUP_BATCH,
    });
    for (const lead of leads) {
        await (0, conversationSummary_service_1.generateConversationSummary)(lead.id);
    }
};
const clearRedisConversationCache = async () => {
    const keys = await redis_1.default.keys("conversation:*");
    if (!keys.length) {
        return;
    }
    await redis_1.default.del(...keys);
};
const cleanupInactiveLeads = async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);
    const leads = await prisma_1.default.lead.findMany({
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
        await prisma_1.default.lead.update({
            where: { id: lead.id },
            data: {
                deletedAt: new Date(),
            },
        });
    }
};
const runMessageCleanup = async () => {
    await cleanupMessages();
    await generateSummaries();
    await clearRedisConversationCache();
    await cleanupInactiveLeads();
};
exports.runMessageCleanup = runMessageCleanup;
const startMessageCleanupCron = () => node_cron_1.default.schedule("15 */2 * * *", async () => {
    const lock = await (0, distributedLock_service_1.acquireDistributedLock)({
        key: MESSAGE_CLEANUP_LEADER_KEY,
        ttlMs: 10 * 60000,
        refreshIntervalMs: 2 * 60000,
        waitMs: 0,
    });
    if (!lock) {
        return;
    }
    try {
        await (0, exports.runMessageCleanup)();
    }
    catch (error) {
        logger_1.default.error({
            error,
        }, "Message cleanup cron failed");
    }
    finally {
        await lock.release().catch(() => undefined);
    }
});
exports.startMessageCleanupCron = startMessageCleanupCron;
