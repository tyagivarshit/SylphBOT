import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

const FUNNEL_QUEUE_NAME = "funnelQueue";

const globalForFunnelQueue = globalThis as typeof globalThis & {
  __sylphFunnelQueue?: Queue;
};

export const initFunnelQueue = () => {
  if (!globalForFunnelQueue.__sylphFunnelQueue) {
    globalForFunnelQueue.__sylphFunnelQueue = createResilientQueue(
      new Queue(FUNNEL_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        prefix: "sylph",
        defaultJobOptions: buildQueueJobOptions(),
      }),
      FUNNEL_QUEUE_NAME
    );
  }

  return globalForFunnelQueue.__sylphFunnelQueue;
};

export const getFunnelQueue = () => initFunnelQueue();

export const closeFunnelQueue = async () => {
  await globalForFunnelQueue.__sylphFunnelQueue?.close().catch(() => undefined);
  globalForFunnelQueue.__sylphFunnelQueue = undefined;
};
