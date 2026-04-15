import redis from "../config/redis";

const LEAD_LOCK_PREFIX = "ai_pipeline:lead_lock";
const REPLY_STATE_PREFIX = "ai_pipeline:reply_state";

const LEAD_LOCK_TTL_SECONDS = 120;
const REPLY_STATE_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_LOCK_WAIT_MS = 1200;
const DEFAULT_LOCK_POLL_MS = 50;

type ReplyDeliveryState = {
  savedMessageId?: string | null;
  sent: boolean;
};

const buildLeadLockKey = (leadId: string) => `${LEAD_LOCK_PREFIX}:${leadId}`;
const buildReplyStateKey = (jobKey: string) => `${REPLY_STATE_PREFIX}:${jobKey}`;

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
  const deadline = Date.now() + waitMs;

  do {
    const result = await redis.set(
      key,
      jobKey,
      "EX",
      LEAD_LOCK_TTL_SECONDS,
      "NX"
    );

    if (result === "OK") {
      return true;
    }

    if (Date.now() >= deadline) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (Date.now() <= deadline);

  return false;
};

export const releaseLeadProcessingLock = async (
  leadId: string,
  jobKey: string
) => {
  const key = buildLeadLockKey(leadId);
  const current = await redis.get(key);

  if (current !== jobKey) {
    return;
  }

  await redis.del(key);
};

export const getReplyDeliveryState = async (
  jobKey: string
): Promise<ReplyDeliveryState> => {
  const raw = await redis.get(buildReplyStateKey(jobKey));

  if (!raw) {
    return { savedMessageId: null, sent: false };
  }

  try {
    const parsed = JSON.parse(raw) as ReplyDeliveryState;
    return {
      savedMessageId: parsed.savedMessageId || null,
      sent: Boolean(parsed.sent),
    };
  } catch {
    return { savedMessageId: null, sent: false };
  }
};

const saveReplyDeliveryState = async (
  jobKey: string,
  state: ReplyDeliveryState
) => {
  await redis.set(
    buildReplyStateKey(jobKey),
    JSON.stringify(state),
    "EX",
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
    sent: current.sent,
  });
};

export const markReplySent = async (jobKey: string) => {
  const current = await getReplyDeliveryState(jobKey);

  await saveReplyDeliveryState(jobKey, {
    savedMessageId: current.savedMessageId || null,
    sent: true,
  });
};
