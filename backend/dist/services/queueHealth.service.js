"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueHealth = void 0;
const ai_queue_1 = require("../queues/ai.queue");
const authEmail_queue_1 = require("../queues/authEmail.queue");
const automation_queue_1 = require("../queues/automation.queue");
const bookingReminder_queue_1 = require("../queues/bookingReminder.queue");
const followup_queue_1 = require("../queues/followup.queue");
const funnel_queue_1 = require("../queues/funnel.queue");
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
    };
};
const getAllQueues = () => [
    ...(0, ai_queue_1.getAIQueues)(),
    followup_queue_1.followupQueue,
    automation_queue_1.automationQueue,
    bookingReminder_queue_1.bookingReminderQueue,
    authEmail_queue_1.authEmailQueue,
    funnel_queue_1.funnelQueue,
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
        return snapshot;
    })
        .finally(() => {
        queueHealthCache.promise = undefined;
    });
    return queueHealthCache.promise;
};
exports.getQueueHealth = getQueueHealth;
