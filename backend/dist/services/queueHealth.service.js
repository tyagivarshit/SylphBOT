"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueueHealth = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const aiQueue = new bullmq_1.Queue("aiQueue", {
    connection: redis_1.redisConnection,
});
const getQueueHealth = async () => {
    const waiting = await aiQueue.getWaitingCount();
    const active = await aiQueue.getActiveCount();
    const delayed = await aiQueue.getDelayedCount();
    const failed = await aiQueue.getFailedCount();
    return {
        waiting,
        active,
        delayed,
        failed,
    };
};
exports.getQueueHealth = getQueueHealth;
