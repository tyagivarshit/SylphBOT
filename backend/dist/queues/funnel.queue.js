"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.funnelQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
exports.funnelQueue = new bullmq_1.Queue("funnelQueue", {
    connection: redis_1.redisConnection,
    prefix: "sylph",
});
