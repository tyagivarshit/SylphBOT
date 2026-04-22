"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLearningWorker = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const queue_defaults_1 = require("../queues/queue.defaults");
const shouldRunWorker = process.env.RUN_WORKER === "true" ||
    process.env.RUN_WORKER === undefined;
const startLearningWorker = () => {
    if (!shouldRunWorker) {
        console.log("[learning.worker] RUN_WORKER disabled, worker not started");
        return null;
    }
    const worker = new bullmq_1.Worker("learning-queue", (0, queue_defaults_1.withRedisWorkerFailSafe)("learning-queue", async (job) => {
        console.log("Processing Learning Job:", job.data);
    }), {
        connection: (0, redis_1.getWorkerRedisConnection)(),
    });
    worker.on("completed", (job) => {
        console.log(`Job completed: ${job.id}`);
    });
    worker.on("failed", (job, err) => {
        console.error(`Job failed: ${job?.id}`, err);
    });
    console.log("Learning Worker Started");
    return worker;
};
exports.startLearningWorker = startLearningWorker;
