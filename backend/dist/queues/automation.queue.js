"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
exports.automationQueue = new bullmq_1.Queue("automation", {
    connection: (0, redis_1.getQueueRedisConnection)(),
});
