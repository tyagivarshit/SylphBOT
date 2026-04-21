"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.funnelQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
exports.funnelQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue("funnelQueue", {
    connection: (0, redis_1.getQueueRedisConnection)(),
    prefix: "sylph",
    defaultJobOptions: (0, queue_defaults_1.buildQueueJobOptions)(),
}), "funnelQueue");
