import { Worker } from "bullmq";

import { env } from "../config/env";


export const startLearningWorker = () => {
  const worker = new Worker(
    "learning-queue",
    async (job) => {
      console.log("📚 Processing Learning Job:", job.data);

      // 🔥 Yaha tera AI / automation logic aayega
    },{
    connection: { url: env.REDIS_URL } }
  );

  worker.on("completed", (job) => {
    console.log(`✅ Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err);
  });

  console.log("🧠 Learning Worker Started 🚀");
};