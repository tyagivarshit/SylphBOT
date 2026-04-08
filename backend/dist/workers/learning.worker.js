"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLearningWorker = void 0;
const bullmq_1 = require("bullmq");
const startLearningWorker = () => {
    const worker = new bullmq_1.Worker("learning-queue", async (job) => {
        console.log("📚 Processing Learning Job:", job.data);
        // 🔥 Yaha tera AI / automation logic aayega
    }, {
        connection: { url: process.env.REDIS_URL }
    });
    worker.on("completed", (job) => {
        console.log(`✅ Job completed: ${job.id}`);
    });
    worker.on("failed", (job, err) => {
        console.error(`❌ Job failed: ${job?.id}`, err);
    });
    console.log("🧠 Learning Worker Started 🚀");
};
exports.startLearningWorker = startLearningWorker;
