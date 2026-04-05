import { Queue } from "bullmq";
import { env } from "../config/env";

const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};

export const learningQueue = new Queue("learning-queue", {
  connection,
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