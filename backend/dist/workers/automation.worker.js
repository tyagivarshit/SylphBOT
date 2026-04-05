"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const commentAutomation_service_1 = require("../services/commentAutomation.service");
const redis = new ioredis_1.default(process.env.REDIS_URL);
new bullmq_1.Worker("automation", async (job) => {
    if (job.name === "comment") {
        await (0, commentAutomation_service_1.handleCommentAutomation)(job.data);
    }
}, {
    connection: redis,
    concurrency: 20,
});
