import redis from "../config/redis";

const LEAD_LOCK_PREFIX = "ai_pipeline:lead_lock";
const REPLY_STATE_PREFIX = "ai_pipeline:reply_state";

const LEAD_LOCK_TTL_SECONDS = 120;
const REPLY_STATE_TTL_SECONDS = 60 * 60 * 24;

type ReplyDeliveryState = {
  savedMessageId?: string | null;
  sent: boolean;
};

const buildLeadLockKey = (leadId: string) => `${LEAD_LOCK_PREFIX}:${leadId}`;
const buildReplyStateKey = (jobKey: string) => `${REPLY_STATE_PREFIX}:${jobKey}`;

export const acquireLeadProcessingLock = async (
  leadId: string,
  jobKey: string
) => {
  const key = buildLeadLockKey(leadId);
  const result = await redis.set(
    key,
    jobKey,
    "EX",
    LEAD_LOCK_TTL_SECONDS,
    "NX"
  );

  return result === "OK";
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
