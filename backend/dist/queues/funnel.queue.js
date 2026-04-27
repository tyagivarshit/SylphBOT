"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeFunnelQueue = exports.getFunnelQueue = exports.initFunnelQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
const FUNNEL_QUEUE_NAME = "funnelQueue";
const globalForFunnelQueue = globalThis;
const initFunnelQueue = () => {
    if (!globalForFunnelQueue.__sylphFunnelQueue) {
        globalForFunnelQueue.__sylphFunnelQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(FUNNEL_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            prefix: "sylph",
            defaultJobOptions: (0, queue_defaults_1.buildQueueJobOptions)(),
        }), FUNNEL_QUEUE_NAME);
    }
    return globalForFunnelQueue.__sylphFunnelQueue;
};
exports.initFunnelQueue = initFunnelQueue;
const getFunnelQueue = () => (0, exports.initFunnelQueue)();
exports.getFunnelQueue = getFunnelQueue;
const closeFunnelQueue = async () => {
    await globalForFunnelQueue.__sylphFunnelQueue?.close().catch(() => undefined);
    globalForFunnelQueue.__sylphFunnelQueue = undefined;
};
exports.closeFunnelQueue = closeFunnelQueue;
