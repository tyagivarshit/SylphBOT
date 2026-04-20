import crypto from "crypto";
import prisma from "../config/prisma";
import redis from "../config/redis";
import logger from "../utils/logger";
import { sanitizeMetadata } from "./audit.service";

export type SecurityAlertType =
  | "MULTIPLE_FAILED_LOGIN_ATTEMPTS"
  | "INVALID_API_KEY_USAGE"
  | "SUSPICIOUS_ACTIVITY";

type SecurityAlertInput = {
  businessId: string;
  type: SecurityAlertType;
  metadata?: Record<string, unknown> | null;
};

const ALERT_WINDOW_SECONDS = 15 * 60;
const ALERT_DEDUP_SECONDS = 10 * 60;
const FAILED_LOGIN_THRESHOLD = 5;
const INVALID_API_KEY_THRESHOLD = 5;

const toFingerprint = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

const incrementAlertCounter = async (key: string, ttlSeconds: number) => {
  const results = await redis
    .multi()
    .incr(key)
    .expire(key, ttlSeconds)
    .exec();

  const countResult = results?.[0]?.[1];
  const parsedCount = Number(countResult);

  return Number.isFinite(parsedCount) ? parsedCount : 0;
};

const claimAlertSlot = async (key: string, ttlSeconds: number) => {
  const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
};

export const createSecurityAlert = async (input: SecurityAlertInput) => {
  try {
    return await prisma.securityAlert.create({
      data: {
        businessId: input.businessId,
        type: input.type,
        metadata: sanitizeMetadata(input.metadata) || undefined,
      },
    });
  } catch (error) {
    logger.warn(
      {
        businessId: input.businessId,
        type: input.type,
        error,
      },
      "Security alert write failed"
    );

    return null;
  }
};

const emitThresholdAlert = async (input: {
  businessId: string;
  type: SecurityAlertType;
  metadata: Record<string, unknown>;
  dedupeKey: string;
}) => {
  try {
    const claimed = await claimAlertSlot(input.dedupeKey, ALERT_DEDUP_SECONDS);

    if (!claimed) {
      return null;
    }

    return await createSecurityAlert({
      businessId: input.businessId,
      type: input.type,
      metadata: input.metadata,
    });
  } catch (error) {
    logger.warn(
      {
        businessId: input.businessId,
        type: input.type,
        error,
      },
      "Security alert threshold evaluation failed"
    );

    return null;
  }
};

export const recordFailedLoginAttempt = async (input: {
  businessId?: string | null;
  userId?: string | null;
  email: string;
  ip: string;
}) => {
  if (!input.businessId) {
    return null;
  }

  try {
    const fingerprint = toFingerprint(
      `${input.businessId}:${input.email}:${input.ip}`
    );
    const counterKey = `security:failed-login:${fingerprint}`;
    const attempts = await incrementAlertCounter(
      counterKey,
      ALERT_WINDOW_SECONDS
    );

    if (attempts < FAILED_LOGIN_THRESHOLD) {
      return null;
    }

    return await emitThresholdAlert({
      businessId: input.businessId,
      type: "MULTIPLE_FAILED_LOGIN_ATTEMPTS",
      dedupeKey: `security:alert:failed-login:${fingerprint}`,
      metadata: {
        userId: input.userId || null,
        email: input.email,
        ip: input.ip,
        attempts,
        windowSeconds: ALERT_WINDOW_SECONDS,
      },
    });
  } catch (error) {
    logger.warn(
      {
        businessId: input.businessId,
        email: input.email,
        ip: input.ip,
        error,
      },
      "Failed login alert tracking failed"
    );

    return null;
  }
};

export const recordInvalidApiKeyAttempt = async (input: {
  businessId?: string | null;
  keyFingerprint: string;
  ip: string;
  path: string;
  method: string;
  reason?: string | null;
}) => {
  if (!input.businessId) {
    return null;
  }

  try {
    const fingerprint = toFingerprint(
      `${input.businessId}:${input.keyFingerprint}:${input.ip}:${input.reason || "invalid"}`
    );
    const counterKey = `security:invalid-api-key:${fingerprint}`;
    const attempts = await incrementAlertCounter(
      counterKey,
      ALERT_WINDOW_SECONDS
    );

    if (attempts < INVALID_API_KEY_THRESHOLD) {
      return null;
    }

    return await emitThresholdAlert({
      businessId: input.businessId,
      type: "INVALID_API_KEY_USAGE",
      dedupeKey: `security:alert:invalid-api-key:${fingerprint}`,
      metadata: {
        keyFingerprint: input.keyFingerprint,
        ip: input.ip,
        path: input.path,
        method: input.method,
        reason: input.reason || "invalid",
        attempts,
        windowSeconds: ALERT_WINDOW_SECONDS,
      },
    });
  } catch (error) {
    logger.warn(
      {
        businessId: input.businessId,
        ip: input.ip,
        path: input.path,
        error,
      },
      "Invalid API key alert tracking failed"
    );

    return null;
  }
};

export const recordSuspiciousActivity = async (input: {
  businessId?: string | null;
  fingerprint: string;
  metadata?: Record<string, unknown> | null;
}) => {
  if (!input.businessId) {
    return null;
  }

  try {
    const fingerprint = toFingerprint(`${input.businessId}:${input.fingerprint}`);

    return await emitThresholdAlert({
      businessId: input.businessId,
      type: "SUSPICIOUS_ACTIVITY",
      dedupeKey: `security:alert:suspicious:${fingerprint}`,
      metadata: {
        ...(input.metadata || {}),
      },
    });
  } catch (error) {
    logger.warn(
      {
        businessId: input.businessId,
        fingerprint: input.fingerprint,
        error,
      },
      "Suspicious activity alert tracking failed"
    );

    return null;
  }
};
