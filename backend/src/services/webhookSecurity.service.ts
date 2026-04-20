import crypto from "crypto";
import redis from "../config/redis";

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

const safeCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyMetaWebhookSignature = (input: {
  rawBody: Buffer;
  signature?: string | string[];
  secret?: string | null;
}) => {
  const secret = String(input.secret || "").trim();
  const rawSignature = Array.isArray(input.signature)
    ? input.signature[0]
    : input.signature;
  const normalizedSignature = String(rawSignature || "")
    .replace(/^sha256=/i, "")
    .replace(/^sha1=/i, "")
    .trim();

  if (!secret || !normalizedSignature || !Buffer.isBuffer(input.rawBody)) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(input.rawBody)
    .digest("hex");

  return safeCompare(normalizedSignature, expectedSignature);
};

const toEpochMs = (value: unknown) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
};

export const extractMetaWebhookTimestamp = (body: any) => {
  const candidates = [
    body?.entry?.[0]?.messaging?.[0]?.timestamp,
    body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.timestamp,
    body?.entry?.[0]?.changes?.[0]?.value?.comment?.timestamp,
    body?.entry?.[0]?.changes?.[0]?.value?.timestamp,
    body?.entry?.[0]?.time,
  ];

  for (const candidate of candidates) {
    const epochMs = toEpochMs(candidate);

    if (epochMs) {
      return epochMs;
    }
  }

  return null;
};

export const isWebhookTimestampFresh = (
  timestampMs: number | null,
  maxAgeMs = MAX_WEBHOOK_AGE_MS
) => {
  if (!timestampMs) {
    return false;
  }

  return Math.abs(Date.now() - timestampMs) <= maxAgeMs;
};

export const guardWebhookReplay = async (input: {
  platform: string;
  signature: string;
  timestampMs: number;
}) => {
  const key = crypto
    .createHash("sha1")
    .update(`${input.platform}:${input.signature}:${input.timestampMs}`)
    .digest("hex");

  const result = await redis.set(
    `webhook:replay:${key}`,
    "1",
    "EX",
    Math.max(1, Math.ceil(MAX_WEBHOOK_AGE_MS / 1000)),
    "NX"
  );

  return result === "OK";
};
