import redis from "../config/redis";
import {
  acquireDistributedLock,
  releaseDistributedLock,
  type DistributedLockHandle,
} from "./distributedLock.service";
import { writeRedisJsonIfChanged } from "./redisState.service";

const LEAD_LOCK_PREFIX = "ai_pipeline:lead_lock";
const REPLY_STATE_PREFIX = "ai_pipeline:reply_state";

const LEAD_LOCK_TTL_SECONDS = 120;
const REPLY_STATE_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_LOCK_WAIT_MS = 1200;
const DEFAULT_LOCK_POLL_MS = 50;
const LEAD_LOCK_REFRESH_MS = Math.floor((LEAD_LOCK_TTL_SECONDS * 1000) / 3);

const globalForAIPipelineState = globalThis as typeof globalThis & {
  __sylphLeadLockHandles?: Map<string, DistributedLockHandle>;
};

type ReplyDeliveryState = {
  savedMessageId?: string | null;
  confirmed: boolean;
  confirmedAt?: string | null;
  deliveryMode?: string | null;
  platform?: string | null;
  confirmedReply?: {
    text: string;
    cta?: string | null;
    angle?: string | null;
    variantId?: string | null;
    variantKey?: string | null;
    leadState?: string | null;
    messageType?: string | null;
    meta?: Record<string, unknown>;
    source?: string | null;
    latencyMs?: number | null;
    traceId?: string | null;
  } | null;
  sent: boolean;
};

const buildLeadLockKey = (leadId: string) => `${LEAD_LOCK_PREFIX}:${leadId}`;
const buildReplyStateKey = (jobKey: string) => `${REPLY_STATE_PREFIX}:${jobKey}`;
const buildLeadLockHandleKey = (leadId: string, jobKey: string) =>
  `${leadId}:${jobKey}`;

const getLeadLockHandles = () => {
  if (!globalForAIPipelineState.__sylphLeadLockHandles) {
    globalForAIPipelineState.__sylphLeadLockHandles = new Map();
  }

  return globalForAIPipelineState.__sylphLeadLockHandles;
};

export const acquireLeadProcessingLock = async (
  leadId: string,
  jobKey: string,
  options?: {
    waitMs?: number;
    pollMs?: number;
  }
) => {
  const key = buildLeadLockKey(leadId);
  const waitMs = Math.max(0, options?.waitMs ?? DEFAULT_LOCK_WAIT_MS);
  const pollMs = Math.max(10, options?.pollMs ?? DEFAULT_LOCK_POLL_MS);
  const lock = await acquireDistributedLock({
    key,
    token: jobKey,
    ttlMs: LEAD_LOCK_TTL_SECONDS * 1000,
    waitMs,
    pollMs,
    refreshIntervalMs: LEAD_LOCK_REFRESH_MS,
  });

  if (!lock) {
    return false;
  }

  getLeadLockHandles().set(buildLeadLockHandleKey(leadId, jobKey), lock);
  return true;
};

export const releaseLeadProcessingLock = async (
  leadId: string,
  jobKey: string
) => {
  const handleKey = buildLeadLockHandleKey(leadId, jobKey);
  const handle = getLeadLockHandles().get(handleKey);

  if (handle) {
    getLeadLockHandles().delete(handleKey);
    await handle.release().catch(() => undefined);
    return;
  }

  await releaseDistributedLock({
    key: buildLeadLockKey(leadId),
    token: jobKey,
  }).catch(() => undefined);
};

export const getReplyDeliveryState = async (
  jobKey: string
): Promise<ReplyDeliveryState> => {
  const raw = await redis.get(buildReplyStateKey(jobKey));

  if (!raw) {
    return {
      savedMessageId: null,
      confirmed: false,
      confirmedAt: null,
      deliveryMode: null,
      platform: null,
      confirmedReply: null,
      sent: false,
    };
  }

  try {
    const parsed = JSON.parse(raw) as ReplyDeliveryState;
    return {
      savedMessageId: parsed.savedMessageId || null,
      confirmed: Boolean(parsed.confirmed),
      confirmedAt: parsed.confirmedAt || null,
      deliveryMode: parsed.deliveryMode || null,
      platform: parsed.platform || null,
      confirmedReply:
        parsed.confirmedReply && typeof parsed.confirmedReply === "object"
          ? parsed.confirmedReply
          : null,
      sent: Boolean(parsed.sent),
    };
  } catch {
    return {
      savedMessageId: null,
      confirmed: false,
      confirmedAt: null,
      deliveryMode: null,
      platform: null,
      confirmedReply: null,
      sent: false,
    };
  }
};

const saveReplyDeliveryState = async (
  jobKey: string,
  state: ReplyDeliveryState
) => {
  if (state.sent && !state.confirmed) {
    throw new Error(
      `reply_sent_requires_confirmed_checkpoint:${jobKey}`
    );
  }

  await writeRedisJsonIfChanged(
    buildReplyStateKey(jobKey),
    state,
    REPLY_STATE_TTL_SECONDS
  );
};

export const markReplySaved = async (
  jobKey: string,
  messageId: string
) => {
  const current = await getReplyDeliveryState(jobKey);

  await saveReplyDeliveryState(jobKey, {
    savedMessageId: messageId,
    confirmed: current.confirmed,
    confirmedAt: current.confirmedAt || null,
    deliveryMode: current.deliveryMode || null,
    platform: current.platform || null,
    confirmedReply: current.confirmedReply || null,
    sent: current.sent,
  });
};

export const markReplyConfirmed = async (
  jobKey: string,
  input: {
    confirmedAt: string;
    deliveryMode: string;
    platform?: string | null;
    confirmedReply: NonNullable<ReplyDeliveryState["confirmedReply"]>;
  }
) => {
  const current = await getReplyDeliveryState(jobKey);

  await saveReplyDeliveryState(jobKey, {
    savedMessageId: current.savedMessageId || null,
    confirmed: true,
    confirmedAt: input.confirmedAt,
    deliveryMode: input.deliveryMode,
    platform: input.platform || null,
    confirmedReply: input.confirmedReply,
    sent: current.sent,
  });
};

export const markReplySent = async (jobKey: string) => {
  const current = await getReplyDeliveryState(jobKey);

  await saveReplyDeliveryState(jobKey, {
    savedMessageId: current.savedMessageId || null,
    confirmed: current.confirmed,
    confirmedAt: current.confirmedAt || null,
    deliveryMode: current.deliveryMode || null,
    platform: current.platform || null,
    confirmedReply: current.confirmedReply || null,
    sent: true,
  });
};
