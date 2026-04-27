import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

const AUTOMATION_QUEUE_NAME = "automation";

const globalForAutomationQueue = globalThis as typeof globalThis & {
  __sylphAutomationQueue?: Queue;
};

export const initAutomationQueue = () => {
  if (!globalForAutomationQueue.__sylphAutomationQueue) {
    globalForAutomationQueue.__sylphAutomationQueue = createResilientQueue(
      new Queue(AUTOMATION_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        defaultJobOptions: buildQueueJobOptions(),
      }),
      AUTOMATION_QUEUE_NAME
    );
  }

  return globalForAutomationQueue.__sylphAutomationQueue;
};

export const getAutomationQueue = () => initAutomationQueue();

export const closeAutomationQueue = async () => {
  await globalForAutomationQueue.__sylphAutomationQueue?.close().catch(() => undefined);
  globalForAutomationQueue.__sylphAutomationQueue = undefined;
};
