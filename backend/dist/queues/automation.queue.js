"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeAutomationQueue = exports.getAutomationQueue = exports.initAutomationQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("./queue.defaults");
const AUTOMATION_QUEUE_NAME = "automation";
const globalForAutomationQueue = globalThis;
const initAutomationQueue = () => {
    if (!globalForAutomationQueue.__sylphAutomationQueue) {
        globalForAutomationQueue.__sylphAutomationQueue = (0, queue_defaults_1.createResilientQueue)(new bullmq_1.Queue(AUTOMATION_QUEUE_NAME, {
            connection: (0, redis_1.getQueueRedisConnection)(),
            defaultJobOptions: (0, queue_defaults_1.buildQueueJobOptions)(),
        }), AUTOMATION_QUEUE_NAME);
    }
    return globalForAutomationQueue.__sylphAutomationQueue;
};
exports.initAutomationQueue = initAutomationQueue;
const getAutomationQueue = () => (0, exports.initAutomationQueue)();
exports.getAutomationQueue = getAutomationQueue;
const closeAutomationQueue = async () => {
    await globalForAutomationQueue.__sylphAutomationQueue?.close().catch(() => undefined);
    globalForAutomationQueue.__sylphAutomationQueue = undefined;
};
exports.closeAutomationQueue = closeAutomationQueue;
