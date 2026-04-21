import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import { handleCommentAutomation } from "../services/commentAutomation.service";
import logger from "../utils/logger";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "../observability/sentry";
import { runWithRequestContext } from "../observability/requestContext";
import {
  getSubscriptionAccess,
  logSubscriptionLockedAction,
} from "../middleware/subscriptionGuard.middleware";

initializeSentry();

if (process.env.RUN_WORKER === "true") {
  const worker = new Worker(
    "automation",
    withRedisWorkerFailSafe("automation", async (job: any) =>
      runWithRequestContext(
        {
          requestId: String(job.id || `${job.queueName}:${job.name}`),
          source: "worker",
          route: `queue:${job.queueName}`,
          queueName: job.queueName,
          jobId: String(job.id || `${job.queueName}:${job.name}`),
          leadId: job.data?.leadId || null,
          businessId: job.data?.businessId || null,
        },
        async () => {
          const subscriptionAccess = await getSubscriptionAccess(
            job.data?.businessId || ""
          ).catch(() => null);

          if (!subscriptionAccess?.allowed) {
            logSubscriptionLockedAction(
              {
                businessId: job.data?.businessId || null,
                queueName: job.queueName,
                jobId: job.id,
                leadId: job.data?.leadId || null,
                action: "automation_worker_job",
                lockReason: subscriptionAccess?.lockReason,
              },
              "Automation worker skipped job because subscription is locked"
            );
            return;
          }

          logger.info(
            {
              jobId: job.id,
              queueName: job.queueName,
              leadId: job.data?.leadId || null,
              businessId: job.data?.businessId || null,
              jobName: job.name,
            },
            "Automation worker job started"
          );

          if (job.name === "comment") {
            await handleCommentAutomation(job.data);
          }

          logger.info(
            {
              jobId: job.id,
              queueName: job.queueName,
              leadId: job.data?.leadId || null,
              businessId: job.data?.businessId || null,
              jobName: job.name,
            },
            "Automation worker job completed"
          );
        }
      )),
    {
      connection: getWorkerRedisConnection(),
      concurrency: 20,
    }
  );

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        queueName: job?.queueName || "automation",
        leadId: job?.data?.leadId || null,
        businessId: job?.data?.businessId || null,
        error,
      },
      "Automation worker job failed"
    );

    captureExceptionWithContext(error, {
      tags: {
        worker: "automation",
        queueName: job?.queueName || "automation",
      },
      extras: {
        jobId: job?.id,
        leadId: job?.data?.leadId || null,
        businessId: job?.data?.businessId || null,
      },
    });
  });

  worker.on("error", (error) => {
    logger.error(
      {
        queueName: "automation",
        error,
      },
      "Automation worker error"
    );

    captureExceptionWithContext(error, {
      tags: {
        worker: "automation",
        queueName: "automation",
      },
    });
  });

  logger.info({ queueName: "automation" }, "Automation worker started");
}
