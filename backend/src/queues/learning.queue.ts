import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import { buildQueueJobOptions } from "./queue.defaults";

export const learningQueue = new Queue("learning-queue", {
  connection: getQueueRedisConnection(),
  defaultJobOptions: buildQueueJobOptions({
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  }),
});

// 🔥 Add job helper
export const addLearningJob = async (data: any) => {
  await learningQueue.add("learning-job", data, {
    ...buildQueueJobOptions({
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }),
  });
};
