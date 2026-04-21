import crypto from "crypto";
import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import {
  queuePasswordResetEmail,
  queueVerificationEmail,
} from "../services/authEmail.service";

export type AuthEmailJobData =
  | {
      type: "verify";
      to: string;
      link: string;
    }
  | {
      type: "reset";
      to: string;
      link: string;
    };

export const authEmailQueue = createResilientQueue(
  new Queue<AuthEmailJobData>(
    "authEmail",
    {
      connection: getQueueRedisConnection(),
      prefix: "sylph",
      defaultJobOptions: buildQueueJobOptions({
        backoff: {
          type: "exponential",
          delay: 15000,
        },
      }),
    }
  ),
  "authEmail"
);

const createJobId = (
  type: AuthEmailJobData["type"],
  to: string,
  link: string
) =>
  `${type}-${crypto
    .createHash("sha256")
    .update(`${to}:${link}`)
    .digest("hex")}`;

export const enqueueVerificationEmail = async (
  to: string,
  link: string
) => {
  console.log("📩 Adding email job", { type: "verify", to });
  return authEmailQueue.add(
    "verify-email",
    {
      type: "verify",
      to,
      link,
    },
    {
      jobId: createJobId("verify", to, link),
    }
  );
};

export const enqueuePasswordResetEmail = async (
  to: string,
  link: string
) => {
  console.log("📩 Adding email job", { type: "reset", to });
  return authEmailQueue.add(
    "reset-password",
    {
      type: "reset",
      to,
      link,
    },
    {
      jobId: createJobId("reset", to, link),
    }
  );
};

export const scheduleVerificationEmail = async (
  to: string,
  link: string
) => {
  try {
    const job = await enqueueVerificationEmail(to, link);

    if (job) {
      return;
    }
  } catch (error) {
    console.error("[EMAIL_QUEUE] enqueue failed, using direct fallback", {
      type: "verify",
      to,
      error: error instanceof Error ? error.message : "Unknown queue error",
    });
  }

  queueVerificationEmail(to, link);
};

export const schedulePasswordResetEmail = async (
  to: string,
  link: string
) => {
  try {
    const job = await enqueuePasswordResetEmail(to, link);

    if (job) {
      return;
    }
  } catch (error) {
    console.error("[EMAIL_QUEUE] enqueue failed, using direct fallback", {
      type: "reset",
      to,
      error: error instanceof Error ? error.message : "Unknown queue error",
    });
  }

  queuePasswordResetEmail(to, link);
};
