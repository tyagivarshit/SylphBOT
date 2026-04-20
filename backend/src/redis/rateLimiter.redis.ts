import redis from "../config/redis";

/* ======================================
CONFIG
====================================== */

const LEGACY_RATE_PREFIX = "ai_rate_limit";
const AI_USAGE_TTL_SECONDS = 24 * 60 * 60;
const AI_HOURLY_RATE_TTL_SECONDS = 60 * 60;
const MESSAGE_MINUTE_RATE_TTL_SECONDS = 60;

type CounterWindowResult = {
  count: number;
  ttlSeconds: number;
};

type RateWindowResult = CounterWindowResult & {
  allowed: boolean;
};

/* ======================================
TIME KEYS
====================================== */

const pad = (value: number) => String(value).padStart(2, "0");

export const getRedisDateKey = (date = new Date()) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;

export const getRedisHourKey = (date = new Date()) =>
  `${getRedisDateKey(date)}:${pad(date.getUTCHours())}`;

export const getRedisMinuteKey = (date = new Date()) =>
  `${getRedisHourKey(date)}:${pad(date.getUTCMinutes())}`;

/* ======================================
KEY BUILDERS
====================================== */

export const getRateKey = (
  businessId: string,
  leadId: string,
  platform?: string
) =>
  platform
    ? `${LEGACY_RATE_PREFIX}:${platform}:${businessId}:${leadId}`
    : `${LEGACY_RATE_PREFIX}:${businessId}:${leadId}`;

export const buildAIUsageKey = (
  businessId: string,
  dateKey = getRedisDateKey()
) => `ai:usage:${businessId}:${dateKey}`;

export const buildAIRateKey = (
  businessId: string,
  hourKey = getRedisHourKey()
) => `ai:rate:${businessId}:${hourKey}`;

export const buildMessageRateKey = (
  businessId: string,
  minuteKey = getRedisMinuteKey()
) => `msg:rate:${businessId}:${minuteKey}`;

/* ======================================
LUA HELPERS
====================================== */

const incrementWithTtlScript = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local current = redis.call('INCR', key)
local keyTtl = redis.call('TTL', key)

if keyTtl < 0 then
  redis.call('EXPIRE', key, ttl)
  keyTtl = ttl
end

return {current, keyTtl}
`;

const consumeWindowScript = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or '0')
local keyTtl = redis.call('TTL', key)

if keyTtl < 0 and current > 0 then
  redis.call('EXPIRE', key, ttl)
  keyTtl = ttl
end

if current >= limit then
  if keyTtl < 0 then
    keyTtl = ttl
  end

  return {0, current, keyTtl}
end

local nextCount = redis.call('INCR', key)

if nextCount == 1 then
  redis.call('EXPIRE', key, ttl)
  keyTtl = ttl
else
  keyTtl = redis.call('TTL', key)
  if keyTtl < 0 then
    redis.call('EXPIRE', key, ttl)
    keyTtl = ttl
  end
end

return {1, nextCount, keyTtl}
`;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const incrementExpiringCounter = async (
  key: string,
  ttlSeconds: number
): Promise<CounterWindowResult> => {
  const raw = (await redis.eval(
    incrementWithTtlScript,
    1,
    key,
    String(ttlSeconds)
  )) as [unknown, unknown];

  return {
    count: toNumber(raw?.[0]),
    ttlSeconds: Math.max(toNumber(raw?.[1]), ttlSeconds),
  };
};

const consumeRateWindow = async (
  key: string,
  limit: number,
  ttlSeconds: number
): Promise<RateWindowResult> => {
  if (limit <= 0) {
    return {
      allowed: false,
      count: 0,
      ttlSeconds,
    };
  }

  const raw = (await redis.eval(
    consumeWindowScript,
    1,
    key,
    String(ttlSeconds),
    String(limit)
  )) as [unknown, unknown, unknown];

  return {
    allowed: toNumber(raw?.[0]) === 1,
    count: toNumber(raw?.[1]),
    ttlSeconds: Math.max(toNumber(raw?.[2]), ttlSeconds),
  };
};

/* ======================================
LEGACY API
====================================== */

export const incrementRate = async (
  businessId: string,
  leadId: string,
  platform?: string,
  windowSeconds = 60
) => {
  const key = getRateKey(businessId, leadId, platform);

  try {
    const result = await incrementExpiringCounter(key, windowSeconds);
    return result.count;
  } catch {
    return 0;
  }
};

export const getRate = async (
  businessId: string,
  leadId: string,
  platform?: string
) => {
  const key = getRateKey(businessId, leadId, platform);

  try {
    const value = await redis.get(key);
    return Number(value || 0);
  } catch {
    return 0;
  }
};

export const resetRate = async (
  businessId: string,
  leadId: string,
  platform?: string
) => {
  const key = getRateKey(businessId, leadId, platform);

  try {
    await redis.del(key);
  } catch {}
};

export const clearAllRates = async () => {
  try {
    const stream = redis.scanStream({
      match: `${LEGACY_RATE_PREFIX}:*`,
      count: 100,
    });

    const pipeline = redis.pipeline();

    stream.on("data", (keys: string[]) => {
      if (keys.length) {
        keys.forEach((key) => pipeline.del(key));
      }
    });

    return new Promise<void>((resolve, reject) => {
      stream.on("end", async () => {
        await pipeline.exec();
        resolve();
      });

      stream.on("error", reject);
    });
  } catch {}
};

/* ======================================
SCALING HELPERS
====================================== */

export const incrementDailyAIUsage = async (businessId: string) =>
  incrementExpiringCounter(
    buildAIUsageKey(businessId),
    AI_USAGE_TTL_SECONDS
  );

export const consumeBusinessAIHourlyRate = async (
  businessId: string,
  limit: number
) =>
  consumeRateWindow(
    buildAIRateKey(businessId),
    limit,
    AI_HOURLY_RATE_TTL_SECONDS
  );

export const consumeBusinessMessageMinuteRate = async (
  businessId: string,
  limit: number
) =>
  consumeRateWindow(
    buildMessageRateKey(businessId),
    limit,
    MESSAGE_MINUTE_RATE_TTL_SECONDS
  );
