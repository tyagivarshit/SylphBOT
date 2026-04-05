"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWebhookEvent = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const ioredis_1 = __importDefault(require("ioredis"));
/*
====================================================
REDIS CONNECTION
====================================================
*/
const redis = new ioredis_1.default(process.env.REDIS_URL, {
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
const REDIS_TTL = 60 * 10; // 🔥 10 min (better than 1 hour)
/*
====================================================
KEY BUILDER (🔥 FIXED)
====================================================
*/
const buildKey = (eventId, platform) => {
    return `${REDIS_PREFIX}${platform}:${eventId}`;
};
/*
====================================================
REDIS LOCK
====================================================
*/
const acquireRedisLock = async (eventId, platform) => {
    const key = buildKey(eventId, platform);
    try {
        const result = await redis.set(key, "1", "EX", REDIS_TTL, "NX");
        return result === "OK";
    }
    catch (error) {
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
const checkDatabaseDuplicate = async (eventId) => {
    try {
        const existing = await prisma_1.default.webhookEvent.findUnique({
            where: { eventId },
            select: { id: true },
        });
        return !!existing;
    }
    catch (error) {
        console.error("[WEBHOOK DB CHECK ERROR]", error);
        return false;
    }
};
/*
====================================================
SAVE EVENT (SAFE)
====================================================
*/
const saveWebhookEvent = async (eventId, platform) => {
    try {
        await prisma_1.default.webhookEvent.create({
            data: {
                eventId,
                platform,
            },
        });
    }
    catch (error) {
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
const processWebhookEvent = async ({ eventId, platform, }) => {
    if (!eventId)
        return true;
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
    }
    catch (error) {
        console.error("[WEBHOOK PROCESS ERROR]", error);
        return true; // fail-open
    }
};
exports.processWebhookEvent = processWebhookEvent;
