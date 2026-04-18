import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";

export const learningQueue = new Queue("learning-queue", {
  connection: getQueueRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: true,
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
    removeOnComplete: true,
    removeOnFail: true,
  });
};
