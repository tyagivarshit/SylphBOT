import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

export const learningQueue = createResilientQueue(
  new Queue("learning-queue", {
    connection: getQueueRedisConnection(),
    defaultJobOptions: buildQueueJobOptions({
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }),
  }),
  "learning-queue"
);

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
