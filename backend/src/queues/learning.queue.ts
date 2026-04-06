import { Queue } from "bullmq";
import { env } from "../config/env";

export const learningQueue = new Queue("learning-queue", {
  connection: {
    url: env.REDIS_URL,
  },
});

// 🔥 Add job helper
export const addLearningJob = async (data: any) => {
  await learningQueue.add("learning-job", data, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  });
};