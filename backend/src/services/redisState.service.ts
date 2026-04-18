import redis from "../config/redis";

export const SALES_DECISION_TTL_SECONDS = 5 * 60;
export const SALES_LAST_REPLY_TTL_SECONDS = 2 * 60;
export const SALES_PROGRESSION_TTL_SECONDS = 10 * 60;
export const IDEMPOTENCY_TTL_SECONDS = 2 * 60;

export const buildDecisionRedisKey = (leadId: string) => `decision:${leadId}`;

export const buildLastReplyRedisKey = (leadId: string) =>
  `lastReply:${leadId}`;

export const buildProgressionRedisKey = (leadId: string) =>
  `progression:${leadId}`;

export const buildIdempotencyRedisKey = (eventId: string) =>
  `idempotency:${eventId}`;

export const writeRedisValueIfChanged = async (
  key: string,
  value: string,
  ttlSeconds: number
) => {
  const existing = await redis.get(key);

  if (existing === value) {
    return false;
  }

  await redis.set(key, value, "EX", ttlSeconds);
  return true;
};

export const writeRedisJsonIfChanged = async <T>(
  key: string,
  value: T,
  ttlSeconds: number
) => writeRedisValueIfChanged(key, JSON.stringify(value), ttlSeconds);

export const deleteRedisKeys = async (keys: string[]) => {
  const uniqueKeys = Array.from(
    new Set(
      keys
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    )
  );

  if (!uniqueKeys.length) {
    return 0;
  }

  return redis.del(...uniqueKeys);
};
