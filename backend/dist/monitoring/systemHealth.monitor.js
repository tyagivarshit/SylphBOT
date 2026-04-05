"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemHealth = void 0;
const queueHealth_service_1 = require("../services/queueHealth.service");
const redisHealth_service_1 = require("../services/redisHealth.service");
const getSystemHealth = async () => {
    const queueHealth = await (0, queueHealth_service_1.getQueueHealth)();
    const redisHealth = await (0, redisHealth_service_1.checkRedisHealth)();
    return {
        redis: redisHealth,
        queues: queueHealth,
        uptime: process.uptime(),
    };
};
exports.getSystemHealth = getSystemHealth;
