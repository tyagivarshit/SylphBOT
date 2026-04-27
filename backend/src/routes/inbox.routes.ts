import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";
import { getWorkerRedisConnection } from "../config/redis";
import { enqueueAIBatch } from "../queues/ai.queue";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { assertPhase5ALegacyRuntimeEnabled } from "../services/runtimePolicy.service";

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForInboxRouteWorker = globalThis as typeof globalThis & {
  __sylphInboxRouteWorker?: Worker | null;
};

export const initLegacyInboxRouteWorker = () => {
  assertPhase5ALegacyRuntimeEnabled("legacy_inbox_route_worker");

  if (!shouldRunWorker) {
    console.log("[routes/inbox.routes] RUN_WORKER disabled, worker not started");
    return null;
  }

  if (globalForInboxRouteWorker.__sylphInboxRouteWorker) {
    return globalForInboxRouteWorker.__sylphInboxRouteWorker;
  }

  const worker = new Worker(
    "inboxQueue",
    withRedisWorkerFailSafe("inboxQueue", async (job: any) => {
      const { businessId, leadId, message, plan } = job.data;

      try {
        await enqueueAIBatch([
          {
            businessId,
            leadId,
            message,
            plan,
          },
        ]);
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
  );

  globalForInboxRouteWorker.__sylphInboxRouteWorker = worker;
  return worker;
};

export const closeLegacyInboxRouteWorker = async () => {
  await globalForInboxRouteWorker.__sylphInboxRouteWorker?.close().catch(() => undefined);
  globalForInboxRouteWorker.__sylphInboxRouteWorker = undefined;
};
