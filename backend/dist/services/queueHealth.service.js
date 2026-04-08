"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueHealth = void 0;
const ai_queue_1 = require("../queues/ai.queue");
const getQueueHealth = async () => {
    const waiting = await ai_queue_1.aiQueue.getWaitingCount();
    const active = await ai_queue_1.aiQueue.getActiveCount();
    const delayed = await ai_queue_1.aiQueue.getDelayedCount();
    const failed = await ai_queue_1.aiQueue.getFailedCount();
    return {
        waiting,
        active,
        delayed,
        failed,
    };
};
exports.getQueueHealth = getQueueHealth;
