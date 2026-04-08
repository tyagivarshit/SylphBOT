"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addRouterJob = exports.addAIJob = exports.aiQueue = void 0;
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
exports.aiQueue = new bullmq_1.Queue("aiQueue", {
    connection: {
        url: env_1.env.REDIS_URL,
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: {
            age: 3600,
            count: 1000,
        },
        removeOnFail: {
            age: 24 * 3600,
        },
    },
});
const addAIJob = async (data) => exports.aiQueue.add("message", data);
exports.addAIJob = addAIJob;
const addRouterJob = async (data) => exports.aiQueue.add("router", data);
exports.addRouterJob = addRouterJob;
