"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueHealth = void 0;
const ai_queue_1 = require("../queues/ai.queue");
const getQueueHealth = async () => {
    const aiQueues = (0, ai_queue_1.getAIQueues)();
    const queueStats = await Promise.all(aiQueues.map(async (queue) => ({
        name: queue.name,
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        delayed: await queue.getDelayedCount(),
        failed: await queue.getFailedCount(),
    })));
    const waiting = queueStats.reduce((total, item) => total + item.waiting, 0);
    const active = queueStats.reduce((total, item) => total + item.active, 0);
    const delayed = queueStats.reduce((total, item) => total + item.delayed, 0);
    const failed = queueStats.reduce((total, item) => total + item.failed, 0);
    return {
        waiting,
        active,
        delayed,
        failed,
        partitions: queueStats,
    };
};
exports.getQueueHealth = getQueueHealth;
