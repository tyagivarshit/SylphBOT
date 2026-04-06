import { Queue } from "bullmq";
import { env } from "../config/env"; 
export const funnelQueue = new Queue("funnelQueue", {
  connection: { url: process.env.REDIS_URL } ,
  prefix: "sylph",
});