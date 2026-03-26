import { format, toZonedTime, fromZonedTime } from "date-fns-tz";

/*
=====================================================
TIMEZONE HANDLER (PRODUCTION READY)
=====================================================
*/

const DEFAULT_TIMEZONE = "Asia/Kolkata";

/* ---------------- GET USER TIMEZONE ---------------- */

export const getTimezone = (tz?: string) => {
  try {
    return tz || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

/* ---------------- CONVERT UTC → USER TIMEZONE ---------------- */

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

/* ---------------- CONVERT USER → UTC ---------------- */

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

/* ---------------- FORMAT DATE ---------------- */

export const formatInTimezone = (
  date: Date,
  timezone?: string
): string => {
  try {
    const tz = getTimezone(timezone);

    return format(date, "yyyy-MM-dd HH:mm", {
      timeZone: tz,
    });
  } catch (error) {
    console.error("TZ FORMAT ERROR:", error);
    return date.toISOString();
  }
};

/* ---------------- SAFE DATE PARSE ---------------- */

export const safeParseDate = (
  input: string,
  timezone?: string
): Date | null => {
  try {
    const date = new Date(input);

    if (isNaN(date.getTime())) return null;

    return toUTC(date, timezone);
  } catch {
    return null;
  }
};