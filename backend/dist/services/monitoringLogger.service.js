"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logError = exports.logRateLimit = exports.logBookingEvent = exports.logAIEvent = exports.logEvent = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const Sentry = __importStar(require("@sentry/node"));
/* ---------------- GENERIC LOGGER ---------------- */
const logEvent = (level, message, payload) => {
    try {
        const logData = {
            ...payload,
            timestamp: new Date().toISOString(),
        };
        if (level === "info") {
            logger_1.default.info(logData, message);
        }
        else if (level === "warn") {
            logger_1.default.warn(logData, message);
        }
        else if (level === "error") {
            logger_1.default.error(logData, message);
            if (payload?.error) {
                Sentry.captureException(payload.error);
            }
        }
    }
    catch (err) {
        console.error("LOGGER FAILURE:", err);
    }
};
exports.logEvent = logEvent;
/* ---------------- AI EVENTS ---------------- */
const logAIEvent = (payload) => {
    (0, exports.logEvent)("info", "AI_EVENT", payload);
};
exports.logAIEvent = logAIEvent;
/* ---------------- BOOKING EVENTS ---------------- */
const logBookingEvent = (payload) => {
    (0, exports.logEvent)("info", "BOOKING_EVENT", payload);
};
exports.logBookingEvent = logBookingEvent;
/* ---------------- RATE LIMIT ---------------- */
const logRateLimit = (payload) => {
    (0, exports.logEvent)("warn", "RATE_LIMIT_HIT", payload);
};
exports.logRateLimit = logRateLimit;
/* ---------------- ERRORS ---------------- */
const logError = (message, payload) => {
    (0, exports.logEvent)("error", message, payload);
};
exports.logError = logError;
