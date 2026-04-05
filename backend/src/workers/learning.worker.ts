import { Worker } from "bullmq";

import { env } from "../config/env";

const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};


export const startLearningWorker = () => {
  const worker = new Worker(
    "learning-queue",
    async (job) => {
      console.log("📚 Processing Learning Job:", job.data);

      // 🔥 Yaha tera AI / automation logic aayega
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log(`✅ Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err);
  });

  console.log("🧠 Learning Worker Started 🚀");
};