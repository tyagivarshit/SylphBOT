"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidDate = exports.safeParseDate = exports.formatWithTimezone = exports.formatInTimezone = exports.toUTC = exports.toUserTimezone = exports.detectUserTimezone = exports.getTimezone = void 0;
const date_fns_tz_1 = require("date-fns-tz");
/*
=====================================================
TIMEZONE HANDLER (GLOBAL PRODUCTION READY)
=====================================================
*/
const DEFAULT_TIMEZONE = "Asia/Kolkata";
/* =================================================
🌍 GET USER TIMEZONE
================================================= */
const getTimezone = (tz) => {
    try {
        return tz || DEFAULT_TIMEZONE;
    }
    catch {
        return DEFAULT_TIMEZONE;
    }
};
exports.getTimezone = getTimezone;
/* =================================================
🌍 AUTO DETECT USER TIMEZONE (🔥 NEW)
================================================= */
const detectUserTimezone = () => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    catch {
        return DEFAULT_TIMEZONE;
    }
};
exports.detectUserTimezone = detectUserTimezone;
/* =================================================
⏱️ UTC → USER TIMEZONE
================================================= */
const toUserTimezone = (date, timezone) => {
    try {
        const tz = (0, exports.getTimezone)(timezone);
        return (0, date_fns_tz_1.toZonedTime)(date, tz);
    }
    catch (error) {
        console.error("TZ CONVERT ERROR:", error);
        return date;
    }
};
exports.toUserTimezone = toUserTimezone;
/* =================================================
⏱️ USER TIMEZONE → UTC
================================================= */
const toUTC = (date, timezone) => {
    try {
        const tz = (0, exports.getTimezone)(timezone);
        return (0, date_fns_tz_1.fromZonedTime)(date, tz);
    }
    catch (error) {
        console.error("TZ UTC ERROR:", error);
        return date;
    }
};
exports.toUTC = toUTC;
/* =================================================
📅 FORMAT (USER FRIENDLY)
================================================= */
const formatInTimezone = (date, timezone) => {
    try {
        const tz = (0, exports.getTimezone)(timezone);
        return (0, date_fns_tz_1.format)(date, "dd MMM yyyy, hh:mm a", {
            timeZone: tz,
        });
    }
    catch (error) {
        console.error("TZ FORMAT ERROR:", error);
        return date.toISOString();
    }
};
exports.formatInTimezone = formatInTimezone;
/* =================================================
📅 FORMAT WITH TIMEZONE LABEL (🔥 BEST UX)
================================================= */
const formatWithTimezone = (date, timezone) => {
    try {
        const tz = (0, exports.getTimezone)(timezone);
        const formatted = (0, date_fns_tz_1.format)(date, "dd MMM yyyy, hh:mm a", {
            timeZone: tz,
        });
        return `${formatted} (${tz})`;
    }
    catch (error) {
        console.error("TZ FORMAT ERROR:", error);
        return date.toISOString();
    }
};
exports.formatWithTimezone = formatWithTimezone;
/* =================================================
🧠 SAFE DATE PARSE (USER INPUT → UTC)
================================================= */
const safeParseDate = (input, timezone) => {
    try {
        const parsed = new Date(input);
        if (isNaN(parsed.getTime()))
            return null;
        return (0, exports.toUTC)(parsed, timezone);
    }
    catch (error) {
        console.error("TZ PARSE ERROR:", error);
        return null;
    }
};
exports.safeParseDate = safeParseDate;
/* =================================================
🧪 VALIDATE DATE (🔥 NEW SAFETY)
================================================= */
const isValidDate = (date) => {
    return date instanceof Date && !isNaN(date.getTime());
};
exports.isValidDate = isValidDate;
