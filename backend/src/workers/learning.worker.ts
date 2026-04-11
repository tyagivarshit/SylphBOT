import { Worker } from "bullmq";

import { getWorkerRedisConnection } from "../config/redis";


export const startLearningWorker = () => {
  if (process.env.RUN_WORKER !== "true") {
    return null;
  }

  const worker = new Worker(
    "learning-queue",
    async (job) => {
      console.log("📚 Processing Learning Job:", job.data);

      // 🔥 Yaha tera AI / automation logic aayega
    },{
    connection: getWorkerRedisConnection() }
  );

  worker.on("completed", (job) => {
    console.log(`✅ Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err);
  });

  console.log("🧠 Learning Worker Started 🚀");
  return worker;
};
