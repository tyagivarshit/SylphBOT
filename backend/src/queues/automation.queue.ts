import { Queue } from "bullmq";
import redis from "../config/redis";


export const automationQueue = new Queue("automation", {
  connection: redis,
});