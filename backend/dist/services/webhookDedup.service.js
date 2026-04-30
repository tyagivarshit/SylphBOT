"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWebhookEvent = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const redis_1 = __importDefault(require("../config/redis"));
const redisState_service_1 = require("./redisState.service");
const reliabilityOS_service_1 = require("./reliability/reliabilityOS.service");
const buildKey = (eventId, platform) => (0, redisState_service_1.buildIdempotencyRedisKey)(`${platform}:${eventId}`);
const acquireRedisLock = async (eventId, platform) => {
    const key = buildKey(eventId, platform);
    try {
        const result = await redis_1.default.set(key, "1", "EX", redisState_service_1.IDEMPOTENCY_TTL_SECONDS, "NX");
        return result === "OK";
    }
    catch (error) {
        console.error("[WEBHOOK REDIS ERROR]", error);
        return true;
    }
};
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
const processWebhookEvent = async ({ eventId, platform, }) => {
    if (!eventId)
        return true;
    const traceId = `webhook_${platform}_${eventId}`;
    try {
        const lockAcquired = await acquireRedisLock(eventId, platform);
        if (!lockAcquired) {
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                eventType: "webhook.dedupe.duplicate",
                message: `Webhook duplicate skipped for ${platform}`,
                severity: "info",
                context: {
                    traceId,
                    correlationId: traceId,
                    provider: platform,
                    component: "webhook-reconciliation",
                    phase: "providers",
                },
                metadata: {
                    eventId,
                    reason: "redis_lock_exists",
                },
            }).catch(() => undefined);
            return false;
        }
        const exists = await checkDatabaseDuplicate(eventId);
        if (exists) {
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                eventType: "webhook.dedupe.duplicate",
                message: `Webhook duplicate skipped for ${platform}`,
                severity: "info",
                context: {
                    traceId,
                    correlationId: traceId,
                    provider: platform,
                    component: "webhook-reconciliation",
                    phase: "providers",
                },
                metadata: {
                    eventId,
                    reason: "db_duplicate",
                },
            }).catch(() => undefined);
            return false;
        }
        await saveWebhookEvent(eventId, platform);
        await (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId,
            correlationId: traceId,
            stage: `webhook:${platform}:accepted`,
            status: "COMPLETED",
            endedAt: new Date(),
            metadata: {
                eventId,
            },
        }).catch(() => undefined);
        return true;
    }
    catch (error) {
        console.error("[WEBHOOK PROCESS ERROR]", error);
        await (0, reliabilityOS_service_1.recordObservabilityEvent)({
            eventType: "webhook.dedupe.error",
            message: `Webhook dedupe failed for ${platform}`,
            severity: "error",
            context: {
                traceId,
                correlationId: traceId,
                provider: platform,
                component: "webhook-reconciliation",
                phase: "providers",
            },
            metadata: {
                eventId,
                error: String(error?.message || error || "webhook_dedupe_failed"),
            },
        }).catch(() => undefined);
        return true;
    }
};
exports.processWebhookEvent = processWebhookEvent;
