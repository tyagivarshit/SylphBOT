"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const commentAutomation_service_1 = require("../services/commentAutomation.service");
new bullmq_1.Worker("automation", async (job) => {
    if (job.name === "comment") {
        await (0, commentAutomation_service_1.handleCommentAutomation)(job.data);
    }
}, {
    connection: { url: process.env.REDIS_URL },
    concurrency: 20,
});
