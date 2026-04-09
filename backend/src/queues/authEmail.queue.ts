import crypto from "crypto";
import { Queue } from "bullmq";
import { env } from "../config/env";
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

export const authEmailQueue = new Queue<AuthEmailJobData>(
  "authEmail",
  {
    connection: {
      url: env.REDIS_URL,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(env.REDIS_URL.startsWith("rediss://") ? { tls: {} } : {}),
    },
    prefix: "sylph",
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 15000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  }
);

const createJobId = (
  type: AuthEmailJobData["type"],
  to: string,
  link: string
) =>
  `${type}:${crypto
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
    await enqueueVerificationEmail(to, link);
  } catch (error) {
    console.error("[EMAIL_QUEUE] enqueue failed, using direct fallback", {
      type: "verify",
      to,
      error: error instanceof Error ? error.message : "Unknown queue error",
    });
    queueVerificationEmail(to, link);
  }
};

export const schedulePasswordResetEmail = async (
  to: string,
  link: string
) => {
  try {
    await enqueuePasswordResetEmail(to, link);
  } catch (error) {
    console.error("[EMAIL_QUEUE] enqueue failed, using direct fallback", {
      type: "reset",
      to,
      error: error instanceof Error ? error.message : "Unknown queue error",
    });
    queuePasswordResetEmail(to, link);
  }
};
