import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";
import { getWorkerRedisConnection } from "../config/redis";
import { enqueueAIBatch } from "./ai.queue";
import logger from "../utils/logger";
import { withRedisWorkerFailSafe } from "./queue.defaults";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const worker =
  shouldRunWorker
    ? new Worker(
        "inboxQueue",
        withRedisWorkerFailSafe("inboxQueue", async (job: any) => {
          const {
            businessId,
            leadId,
            message,
            plan,
            platform,
            senderId,
            pageId,
            phoneNumberId,
            accessTokenEncrypted,
            externalEventId,
            idempotencyKey,
            metadata,
            skipInboundPersist,
            retryCount,
          } = job.data;

          try {
            await enqueueAIBatch(
              [
                {
                  businessId,
                  leadId,
                  message,
                  plan,
                  kind: "router",
                  platform,
                  senderId,
                  pageId,
                  phoneNumberId,
                  accessTokenEncrypted,
                  externalEventId,
                  idempotencyKey,
                  metadata,
                  skipInboundPersist: skipInboundPersist ?? true,
                  retryCount: retryCount || 0,
                },
              ],
              {
                source: "router",
                idempotencyKey: idempotencyKey || externalEventId,
                forceUniqueJobId: true,
              }
            );

            logger.info(
              {
                legacyQueueJobId: job.id,
                businessId,
                leadId,
              },
              "Legacy inbox queue forwarded message to AI reply pipeline"
            );
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.error("Worker failed:", error.message);
              Sentry.captureException(error);
            } else {
              console.error("Worker failed:", error);
            }
            throw error;
          }
        }),
        {
          connection: getWorkerRedisConnection(),
        }
      )
    : null;

if (!shouldRunWorker) {
  console.log("[queues/inbox.queue] RUN_WORKER disabled, worker not started");
}

export default worker;
