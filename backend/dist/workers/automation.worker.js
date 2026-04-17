"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const commentAutomation_service_1 = require("../services/commentAutomation.service");
if (process.env.RUN_WORKER === "true") {
    new bullmq_1.Worker("automation", async (job) => {
        if (job.name === "comment") {
            await (0, commentAutomation_service_1.handleCommentAutomation)(job.data);
        }
    }, {
        connection: (0, redis_1.getWorkerRedisConnection)(),
        concurrency: 20,
    });
}
