import { Worker } from "bullmq";
import { env } from "../config/env";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/authEmail.service";
import type { AuthEmailJobData } from "../queues/authEmail.queue";

const authEmailWorker = new Worker<AuthEmailJobData>(
  "authEmail",
  async (job) => {
    if (job.data.type === "verify") {
      await sendVerificationEmail(job.data.to, job.data.link);
      return;
    }

    await sendPasswordResetEmail(job.data.to, job.data.link);
  },
  {
    connection: {
      url: env.REDIS_URL,
    },
    prefix: "sylph",
    concurrency: 2,
  }
);

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

export default authEmailWorker;
