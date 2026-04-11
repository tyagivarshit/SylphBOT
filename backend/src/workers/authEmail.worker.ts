import { Worker } from "bullmq";
import { getWorkerRedisConnection } from "../config/redis";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/authEmail.service";
import type { AuthEmailJobData } from "../queues/authEmail.queue";

const authEmailWorker =
  process.env.RUN_WORKER === "true"
    ? new Worker<AuthEmailJobData>(
  "authEmail",
  async (job) => {
    console.log("📥 JOB RECEIVED", job.name, job.data);
    if (job.data.type === "verify") {
      await sendVerificationEmail(job.data.to, job.data.link);
      return;
    }

    await sendPasswordResetEmail(job.data.to, job.data.link);
  },
  {
    connection: getWorkerRedisConnection(),
    prefix: "sylph",
    concurrency: 2,
  }
)
    : null;

if (authEmailWorker) {
  authEmailWorker.on("completed", (job) => {
    console.log("[EMAIL_QUEUE] completed", {
      id: job.id,
      name: job.name,
      type: job.data.type,
      to: job.data.to,
    });
  });

  authEmailWorker.on("failed", (job, error) => {
    console.error("[EMAIL_QUEUE] failed", {
      id: job?.id,
      name: job?.name,
      type: job?.data?.type,
      to: job?.data?.to,
      error: error.message,
    });
  });
}

export default authEmailWorker;
