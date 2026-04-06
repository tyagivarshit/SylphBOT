import { Queue } from "bullmq";
import { env } from "../config/env";


export const automationQueue = new Queue("automation", {
  connection: {
    url: env.REDIS_URL,
  },
});