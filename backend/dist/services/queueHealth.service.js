"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueHealth = void 0;
const ai_queue_1 = require("../queues/ai.queue");
const authEmail_queue_1 = require("../queues/authEmail.queue");
const bookingReminder_queue_1 = require("../queues/bookingReminder.queue");
const followup_queue_1 = require("../queues/followup.queue");
const humanReminder_queue_1 = require("../queues/humanReminder.queue");
const receptionRuntime_queue_1 = require("../queues/receptionRuntime.queue");
const reliabilityOS_service_1 = require("./reliability/reliabilityOS.service");
const QUEUE_HEALTH_CACHE_TTL_MS = 5000;
const queueHealthCache = {
    expiresAt: 0,
};
const getQueueSnapshot = async (queue) => {
    const counts = await queue.getJobCounts("wait", "active", "failed", "delayed");
    return {
        name: queue.name,
        waiting: counts.wait ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        class: receptionRuntime_queue_1.RECEPTION_RUNTIME_WRITE_ONLY_DLQ_QUEUES.includes(queue.name)
            ? "observability"
            : "operational",
    };
};
const getAllQueues = () => [
    ...(0, ai_queue_1.getAIQueues)(),
    (0, followup_queue_1.getFollowupQueue)(),
    (0, bookingReminder_queue_1.getBookingReminderQueue)(),
    (0, authEmail_queue_1.getAuthEmailQueue)(),
    ...(0, humanReminder_queue_1.getHumanReminderQueues)(),
    ...(0, receptionRuntime_queue_1.getReceptionRuntimeQueues)(),
];
const loadQueueHealth = async () => Promise.all(getAllQueues().map(getQueueSnapshot));
const getQueueHealth = async () => {
    const now = Date.now();
    if (queueHealthCache.value && queueHealthCache.expiresAt > now) {
        return queueHealthCache.value;
    }
    if (queueHealthCache.promise) {
        return queueHealthCache.promise;
    }
    queueHealthCache.promise = loadQueueHealth()
        .then((snapshot) => {
        queueHealthCache.value = snapshot;
        queueHealthCache.expiresAt = Date.now() + QUEUE_HEALTH_CACHE_TTL_MS;
        const waiting = snapshot.reduce((acc, queue) => acc + Math.max(0, Number(queue.waiting || 0)), 0);
        const failed = snapshot.reduce((acc, queue) => acc + Math.max(0, Number(queue.failed || 0)), 0);
        const delayed = snapshot.reduce((acc, queue) => acc + Math.max(0, Number(queue.delayed || 0)), 0);
        const active = snapshot.reduce((acc, queue) => acc + Math.max(0, Number(queue.active || 0)), 0);
        const total = Math.max(1, waiting + failed + delayed + active);
        void (0, reliabilityOS_service_1.recordMetricSnapshot)({
            subsystem: "QUEUES",
            queueLag: waiting,
            workerUtilization: active / Math.max(1, waiting + active),
            dlqRate: failed / total,
            retryRate: delayed / total,
            lockContention: 0,
            providerErrorRate: 0,
            metadata: {
                queueCount: snapshot.length,
            },
        }).catch(() => undefined);
        return snapshot;
    })
        .finally(() => {
        queueHealthCache.promise = undefined;
    });
    return queueHealthCache.promise;
};
exports.getQueueHealth = getQueueHealth;
