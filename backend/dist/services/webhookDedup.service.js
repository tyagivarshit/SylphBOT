"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollbackWebhookEvent = exports.processWebhookEvent = void 0;
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
const saveWebhookEvent = async (eventId, platform, correlationId) => {
    try {
        await prisma_1.default.webhookEvent.create({
            data: {
                eventId,
                platform,
                correlationId: correlationId || null,
            },
        });
        return true;
    }
    catch (error) {
        if (error?.code === "P2002") {
            return false;
        }
        console.error("[WEBHOOK SAVE ERROR]", error);
        throw error;
    }
};
const processWebhookEvent = async ({ eventId, platform, correlationId = null, tenantId = null, }) => {
    if (process.env.WEBHOOK_DEDUP_ENABLED === "false") {
        return true;
    }
    if (!eventId)
        return true;
    const traceId = `webhook_${platform}_${eventId}`;
    try {
        const lockAcquired = await acquireRedisLock(eventId, platform);
        if (!lockAcquired) {
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                businessId: tenantId,
                tenantId,
                eventType: "webhook.dedupe.duplicate",
                message: `[correlationId=${correlationId}] Webhook duplicate skipped for ${platform}`,
                severity: "info",
                context: {
                    traceId,
                    correlationId: correlationId || traceId,
                    provider: platform,
                    component: "webhook-reconciliation",
                    phase: "providers",
                    tenantId,
                },
                metadata: {
                    eventId,
                    reason: "redis_lock_exists",
                    correlationId,
                },
            }).catch(() => undefined);
            return false;
        }
        const checkDbPromise = checkDatabaseDuplicate(eventId);
        const timeoutPromise = new Promise((resolve) => setTimeout(() => {
            console.warn("[WEBHOOK DB CHECK TIMEOUT] fallback to false", { eventId, correlationId });
            resolve(false);
        }, 150));
        const exists = await Promise.race([checkDbPromise, timeoutPromise]);
        if (exists) {
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                businessId: tenantId,
                tenantId,
                eventType: "webhook.dedupe.duplicate",
                message: `[correlationId=${correlationId}] Webhook duplicate skipped for ${platform}`,
                severity: "info",
                context: {
                    traceId,
                    correlationId: correlationId || traceId,
                    provider: platform,
                    component: "webhook-reconciliation",
                    phase: "providers",
                    tenantId,
                },
                metadata: {
                    eventId,
                    reason: "db_duplicate",
                    correlationId,
                },
            }).catch(() => undefined);
            return false;
        }
        // Save webhook event in a blocking manner
        const saved = await saveWebhookEvent(eventId, platform, correlationId);
        if (!saved) {
            await (0, reliabilityOS_service_1.recordObservabilityEvent)({
                businessId: tenantId,
                tenantId,
                eventType: "webhook.dedupe.duplicate",
                message: `[correlationId=${correlationId}] Webhook duplicate skipped for ${platform}`,
                severity: "info",
                context: {
                    traceId,
                    correlationId: correlationId || traceId,
                    provider: platform,
                    component: "webhook-reconciliation",
                    phase: "providers",
                    tenantId,
                },
                metadata: {
                    eventId,
                    reason: "db_unique_constraint",
                    correlationId,
                },
            }).catch(() => undefined);
            return false;
        }
        await (0, reliabilityOS_service_1.recordTraceLedger)({
            traceId,
            correlationId: correlationId || traceId,
            businessId: tenantId,
            tenantId,
            stage: `webhook:${platform}:accepted`,
            status: "COMPLETED",
            endedAt: new Date(),
            metadata: {
                eventId,
                correlationId,
            },
        }).catch(() => undefined);
        return true;
    }
    catch (error) {
        console.error(`[WEBHOOK PROCESS ERROR] [correlationId=${correlationId}]`, error);
        await (0, reliabilityOS_service_1.recordObservabilityEvent)({
            businessId: tenantId,
            tenantId,
            eventType: "webhook.dedupe.error",
            message: `[correlationId=${correlationId}] Webhook dedupe failed for ${platform}`,
            severity: "error",
            context: {
                traceId,
                correlationId: correlationId || traceId,
                provider: platform,
                component: "webhook-reconciliation",
                phase: "providers",
                tenantId,
            },
            metadata: {
                eventId,
                error: String(error?.message || error || "webhook_dedupe_failed"),
                correlationId,
            },
        }).catch(() => undefined);
        return true;
    }
};
exports.processWebhookEvent = processWebhookEvent;
const rollbackWebhookEvent = async ({ eventId, platform, correlationId = null, tenantId = null, }) => {
    if (process.env.WEBHOOK_DEDUP_ENABLED === "false") {
        return;
    }
    if (!eventId) {
        return;
    }
    const traceId = `webhook_${platform}_${eventId}`;
    const redisKey = buildKey(eventId, platform);
    const [redisResult, dbResult] = await Promise.allSettled([
        redis_1.default.del(redisKey),
        prisma_1.default.webhookEvent.deleteMany({
            where: {
                eventId,
            },
        }),
    ]);
    await (0, reliabilityOS_service_1.recordObservabilityEvent)({
        businessId: tenantId,
        tenantId,
        eventType: "webhook.dedupe.rollback",
        message: `[correlationId=${correlationId}] Webhook dedupe rollback executed for ${platform}`,
        severity: "warn",
        context: {
            traceId,
            correlationId: correlationId || traceId,
            provider: platform,
            component: "webhook-reconciliation",
            phase: "providers",
            tenantId,
        },
        metadata: {
            eventId,
            redisRollback: redisResult.status,
            dbRollback: dbResult.status,
            correlationId,
        },
    }).catch(() => undefined);
};
exports.rollbackWebhookEvent = rollbackWebhookEvent;
