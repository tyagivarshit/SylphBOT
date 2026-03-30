import { format, toZonedTime, fromZonedTime } from "date-fns-tz";

/*
=====================================================
TIMEZONE HANDLER (GLOBAL PRODUCTION READY)
=====================================================
*/

const DEFAULT_TIMEZONE = "Asia/Kolkata";

/* =================================================
🌍 GET USER TIMEZONE
================================================= */

export const getTimezone = (tz?: string) => {
  try {
    return tz || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

/* =================================================
🌍 AUTO DETECT USER TIMEZONE (🔥 NEW)
================================================= */

export const detectUserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

/* =================================================
⏱️ UTC → USER TIMEZONE
================================================= */

export const toUserTimezone = (
  date: Date,
  timezone?: string
): Date => {
  try {
    const tz = getTimezone(timezone);
    return toZonedTime(date, tz);
  } catch (error) {
    console.error("TZ CONVERT ERROR:", error);
    return date;
  }
};

/* =================================================
⏱️ USER TIMEZONE → UTC
================================================= */

export const toUTC = (
  date: Date,
  timezone?: string
): Date => {
  try {
    const tz = getTimezone(timezone);
    return fromZonedTime(date, tz);
  } catch (error) {
    console.error("TZ UTC ERROR:", error);
    return date;
  }
};

/* =================================================
📅 FORMAT (USER FRIENDLY)
================================================= */

export const formatInTimezone = (
  date: Date,
  timezone?: string
): string => {
  try {
    const tz = getTimezone(timezone);

    return format(date, "dd MMM yyyy, hh:mm a", {
      timeZone: tz,
    });
  } catch (error) {
    console.error("TZ FORMAT ERROR:", error);
    return date.toISOString();
  }
};

/* =================================================
📅 FORMAT WITH TIMEZONE LABEL (🔥 BEST UX)
================================================= */

export const formatWithTimezone = (
  date: Date,
  timezone?: string
): string => {
  try {
    const tz = getTimezone(timezone);

    const formatted = format(date, "dd MMM yyyy, hh:mm a", {
      timeZone: tz,
    });

    return `${formatted} (${tz})`;
  } catch (error) {
    console.error("TZ FORMAT ERROR:", error);
    return date.toISOString();
  }
};

/* =================================================
🧠 SAFE DATE PARSE (USER INPUT → UTC)
================================================= */

export const safeParseDate = (
  input: string,
  timezone?: string
): Date | null => {
  try {
    const parsed = new Date(input);

    if (isNaN(parsed.getTime())) return null;

    return toUTC(parsed, timezone);
  } catch (error) {
    console.error("TZ PARSE ERROR:", error);
    return null;
  }
};

/* =================================================
🧪 VALIDATE DATE (🔥 NEW SAFETY)
================================================= */

export const isValidDate = (date: Date) => {
  return date instanceof Date && !isNaN(date.getTime());
};