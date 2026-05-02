import crypto from "crypto";
import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";
import {
  sendBillingEmail,
  sendOnboardingEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
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
    }
  | {
      type: "onboarding";
      to: string;
      workspaceName?: string | null;
    }
  | {
      type: "billing";
      to: string;
      plan: string;
      amountMinor: number;
      currency: string;
      reference?: string | null;
    };

const AUTH_EMAIL_QUEUE_NAME = "authEmail";

const globalForAuthEmailQueue = globalThis as typeof globalThis & {
  __sylphAuthEmailQueue?: Queue<AuthEmailJobData>;
};

export const initAuthEmailQueue = () => {
  if (!globalForAuthEmailQueue.__sylphAuthEmailQueue) {
    globalForAuthEmailQueue.__sylphAuthEmailQueue = createResilientQueue(
      new Queue<AuthEmailJobData>(AUTH_EMAIL_QUEUE_NAME, {
        connection: getQueueRedisConnection(),
        prefix: "sylph",
        defaultJobOptions: buildQueueJobOptions({
          backoff: {
            type: "exponential",
            delay: 15000,
          },
        }),
      }),
      AUTH_EMAIL_QUEUE_NAME
    );
  }

  return globalForAuthEmailQueue.__sylphAuthEmailQueue;
};

export const getAuthEmailQueue = () => initAuthEmailQueue();

const createJobId = (type: AuthEmailJobData["type"], seed: string) =>
  `${type}-${crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")}`;

export const enqueueVerificationEmail = async (
  to: string,
  link: string
) => {
  console.log("[EMAIL_QUEUE] Adding email job", { type: "verify", to });
  return getAuthEmailQueue().add(
    "verify-email",
    {
      type: "verify",
      to,
      link,
    },
    {
      jobId: createJobId("verify", `${to}:${link}`),
    }
  );
};

export const enqueuePasswordResetEmail = async (
  to: string,
  link: string
) => {
  console.log("[EMAIL_QUEUE] Adding email job", { type: "reset", to });
  return getAuthEmailQueue().add(
    "reset-password",
    {
      type: "reset",
      to,
      link,
    },
    {
      jobId: createJobId("reset", `${to}:${link}`),
    }
  );
};

export const enqueueOnboardingEmail = async (
  to: string,
  workspaceName?: string | null
) => {
  console.log("[EMAIL_QUEUE] Adding email job", { type: "onboarding", to });
  return getAuthEmailQueue().add(
    "onboarding-email",
    {
      type: "onboarding",
      to,
      workspaceName: workspaceName || null,
    },
    {
      jobId: createJobId("onboarding", `${to}:${workspaceName || ""}`),
    }
  );
};

export const enqueueBillingEmail = async (input: {
  to: string;
  plan: string;
  amountMinor: number;
  currency: string;
  reference?: string | null;
}) => {
  console.log("[EMAIL_QUEUE] Adding email job", {
    type: "billing",
    to: input.to,
    plan: input.plan,
  });
  return getAuthEmailQueue().add(
    "billing-email",
    {
      type: "billing",
      to: input.to,
      plan: input.plan,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reference: input.reference || null,
    },
    {
      jobId: createJobId(
        "billing",
        `${input.to}:${input.plan}:${input.amountMinor}:${input.currency}:${input.reference || ""}`
      ),
    }
  );
};

const runWithQueueFallback = async (input: {
  type: AuthEmailJobData["type"];
  to: string;
  enqueue: () => Promise<unknown>;
  fallback: () => Promise<void>;
}) => {
  try {
    const job = await input.enqueue();

    if (job) {
      return;
    }
  } catch (error) {
    console.error("[EMAIL_QUEUE] enqueue failed, using direct fallback", {
      type: input.type,
      to: input.to,
      error: error instanceof Error ? error.message : "Unknown queue error",
    });
  }

  try {
    await input.fallback();
  } catch (error) {
    console.error("[EMAIL_QUEUE] direct fallback send failed", {
      type: input.type,
      to: input.to,
      error:
        error instanceof Error ? error.message : "Unknown direct fallback error",
    });
  }
};

export const scheduleVerificationEmail = async (
  to: string,
  link: string
) => {
  return runWithQueueFallback({
    type: "verify",
    to,
    enqueue: () => enqueueVerificationEmail(to, link),
    fallback: () => sendVerificationEmail(to, link),
  });
};

export const schedulePasswordResetEmail = async (
  to: string,
  link: string
) => {
  return runWithQueueFallback({
    type: "reset",
    to,
    enqueue: () => enqueuePasswordResetEmail(to, link),
    fallback: () => sendPasswordResetEmail(to, link),
  });
};

export const scheduleOnboardingEmail = async (
  to: string,
  workspaceName?: string | null
) => {
  return runWithQueueFallback({
    type: "onboarding",
    to,
    enqueue: () => enqueueOnboardingEmail(to, workspaceName),
    fallback: () => sendOnboardingEmail(to, workspaceName),
  });
};

export const scheduleBillingEmail = async (input: {
  to: string;
  plan: string;
  amountMinor: number;
  currency: string;
  reference?: string | null;
}) => {
  return runWithQueueFallback({
    type: "billing",
    to: input.to,
    enqueue: () => enqueueBillingEmail(input),
    fallback: () => sendBillingEmail(input),
  });
};

export const closeAuthEmailQueue = async () => {
  await globalForAuthEmailQueue.__sylphAuthEmailQueue?.close().catch(() => undefined);
  globalForAuthEmailQueue.__sylphAuthEmailQueue = undefined;
};
