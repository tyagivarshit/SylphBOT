import { JobsOptions, Queue } from "bullmq";
import { env } from "../config/env";

export const AI_QUEUE_PARTITIONS = Math.max(
  1,
  Number(process.env.AI_QUEUE_PARTITIONS || 24)
);
const AI_QUEUE_BASE_NAME = "aiQueue";

const defaultJobOptions: JobsOptions = {
  attempts: 8,
  backoff: {
    type: "fixed",
    delay: 500,
  },
  removeOnComplete: {
    age: 3600,
    count: 10000,
  },
  removeOnFail: {
    age: 24 * 3600,
  },
};

export type AIJobPayload = {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  platform?: string;
  senderId?: string;
  pageId?: string;
  phoneNumberId?: string;
  accessTokenEncrypted?: string;
  externalEventId?: string;
};

const buildQueueName = (partition: number) =>
  `${AI_QUEUE_BASE_NAME}-p${partition}`;

const getLeadPartition = (leadId: string) => {
  let hash = 0;

  for (let index = 0; index < leadId.length; index += 1) {
    hash = (hash * 31 + leadId.charCodeAt(index)) >>> 0;
  }

  return hash % AI_QUEUE_PARTITIONS;
};

export const aiQueues = Array.from(
  { length: AI_QUEUE_PARTITIONS },
  (_, partition) =>
    new Queue(buildQueueName(partition), {
      connection: {
        url: env.REDIS_URL,
      },
      defaultJobOptions,
    })
);

export const aiQueue = aiQueues[0];

export const getAIQueues = () => aiQueues;

export const getAIQueueNames = () => aiQueues.map((queue) => queue.name);

export const getAIQueueForLead = (leadId: string) =>
  aiQueues[getLeadPartition(leadId)];

const buildJobId = (name: "message" | "router", data: AIJobPayload) => {
  if (!data.externalEventId) {
    return undefined;
  }

  return `${name}:${(data.platform || "UNKNOWN").toUpperCase()}:${data.externalEventId}`;
};

const addLeadScopedJob = (
  name: "message" | "router",
  data: AIJobPayload
) => {
  const queue = getAIQueueForLead(data.leadId);
  const jobId = buildJobId(name, data);

  return queue.add(name, data, jobId ? { jobId } : undefined);
};

export const addAIJob = async (data: AIJobPayload) =>
  addLeadScopedJob("message", data);

export const addRouterJob = async (data: AIJobPayload) =>
  addLeadScopedJob("router", data);
