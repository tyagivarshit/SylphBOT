import { Queue } from "bullmq";
import { env } from "../config/env";

export const aiQueue = new Queue("aiQueue", {
  connection: {
    url: env.REDIS_URL,
  },

  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 24 * 3600,
    },
  },
});

type AIJobPayload = Record<string, unknown>;

export const addAIJob = async (data: AIJobPayload) =>
  aiQueue.add("message", data);

export const addRouterJob = async (data: AIJobPayload) =>
  aiQueue.add("router", data);
