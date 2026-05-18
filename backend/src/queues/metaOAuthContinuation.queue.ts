import crypto from "crypto";
import { Queue } from "bullmq";
import { getQueueRedisConnection } from "../config/redis";
import {
  buildQueueJobOptions,
  createResilientQueue,
} from "./queue.defaults";

export const META_OAUTH_CONTINUATION_QUEUE_NAME = "meta-oauth-continuation";

export type MetaOAuthContinuationJobPayload = {
  type: "META_OAUTH_CONTINUATION";
  operationId: string;
  replayToken: string;
  businessId: string;
  userId: string;
  platform: "INSTAGRAM" | "WHATSAPP";
  mode: "connect" | "reconnect";
  state: string;
  code?: string | null;
  shortTokenEncrypted?: string | null;
  longTokenEncrypted?: string | null;
  aiTone?: string | null;
  businessInfo?: string | null;
  pricingInfo?: string | null;
  faqKnowledge?: string | null;
  salesInstructions?: string | null;
  phoneNumberId?: string | null;
  facebookPageId?: string | null;
  instagramProfessionalAccountId?: string | null;
  traceId?: string | null;
  queuedAtIso?: string | null;
  source?: string | null;
};

const globalForMetaOAuthContinuationQueue =
  globalThis as typeof globalThis & {
    __sylphMetaOAuthContinuationQueue?: Queue<MetaOAuthContinuationJobPayload>;
  };

const createJobId = (payload: MetaOAuthContinuationJobPayload) => {
  const seed = [
    payload.operationId,
    payload.businessId,
    payload.platform,
    payload.mode,
  ].join(":");
  return `meta-oauth-continuation:${crypto
    .createHash("sha256")
    .update(seed)
    .digest("hex")}`;
};

export const initMetaOAuthContinuationQueue = () => {
  if (!globalForMetaOAuthContinuationQueue.__sylphMetaOAuthContinuationQueue) {
    globalForMetaOAuthContinuationQueue.__sylphMetaOAuthContinuationQueue =
      createResilientQueue(
        new Queue<MetaOAuthContinuationJobPayload>(
          META_OAUTH_CONTINUATION_QUEUE_NAME,
          {
            connection: getQueueRedisConnection(),
            prefix: "sylph",
            defaultJobOptions: buildQueueJobOptions({
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 1_000,
              },
            }),
          }
        ),
        META_OAUTH_CONTINUATION_QUEUE_NAME
      );
  }

  return globalForMetaOAuthContinuationQueue.__sylphMetaOAuthContinuationQueue;
};

export const getMetaOAuthContinuationQueue = () => initMetaOAuthContinuationQueue();

const isDuplicateJobError = (error: unknown) =>
  String((error as Error)?.message || "")
    .toLowerCase()
    .includes("jobid");

export const enqueueMetaOAuthContinuation = async (
  payload: MetaOAuthContinuationJobPayload
) => {
  const jobId = createJobId(payload);
  try {
    const job = await getMetaOAuthContinuationQueue().add(
      "meta-oauth-continuation",
      payload,
      {
        jobId,
        priority: 1,
      }
    );
    return {
      enqueued: Boolean(job),
      duplicate: false,
      jobId,
    };
  } catch (error) {
    if (isDuplicateJobError(error)) {
      return {
        enqueued: true,
        duplicate: true,
        jobId,
      };
    }
    throw error;
  }
};

export const closeMetaOAuthContinuationQueue = async () => {
  await globalForMetaOAuthContinuationQueue.__sylphMetaOAuthContinuationQueue
    ?.close()
    .catch(() => undefined);
  globalForMetaOAuthContinuationQueue.__sylphMetaOAuthContinuationQueue =
    undefined;
};
