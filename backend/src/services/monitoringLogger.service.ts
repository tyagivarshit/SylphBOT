import logger from "../utils/logger";
import * as Sentry from "@sentry/node";

/*
=====================================================
CENTRAL MONITORING LOGGER
=====================================================
*/

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  leadId?: string;
  businessId?: string;
  platform?: string;
  event?: string;
  data?: any;
  error?: any;
}

/* ---------------- GENERIC LOGGER ---------------- */

export const logEvent = (
  level: LogLevel,
  message: string,
  payload?: LogPayload
) => {
  try {
    const logData = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    if (level === "info") {
      logger.info(logData, message);
    } else if (level === "warn") {
      logger.warn(logData, message);
    } else if (level === "error") {
      logger.error(logData, message);

      if (payload?.error) {
        Sentry.captureException(payload.error);
      }
    }
  } catch (err) {
    console.error("LOGGER FAILURE:", err);
  }
};

/* ---------------- AI EVENTS ---------------- */

export const logAIEvent = (payload: LogPayload) => {
  logEvent("info", "AI_EVENT", payload);
};

/* ---------------- BOOKING EVENTS ---------------- */

export const logBookingEvent = (payload: LogPayload) => {
  logEvent("info", "BOOKING_EVENT", payload);
};

/* ---------------- RATE LIMIT ---------------- */

export const logRateLimit = (payload: LogPayload) => {
  logEvent("warn", "RATE_LIMIT_HIT", payload);
};

/* ---------------- ERRORS ---------------- */

export const logError = (message: string, payload: LogPayload) => {
  logEvent("error", message, payload);
};