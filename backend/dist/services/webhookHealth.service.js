"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebhookFailures = exports.logWebhookFailure = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const PREFIX = "webhook_errors";
const TTL = 60 * 60 * 24; // 24 hours
/* ======================================
KEY WITH TIME BUCKET (🔥 IMPORTANT)
====================================== */
const getKey = (platform) => {
    const now = new Date();
    const hour = now.getHours();
    return `${PREFIX}:${platform}:${hour}`;
};
/* ======================================
LOG FAILURE
====================================== */
const logWebhookFailure = async (platform) => {
    const key = getKey(platform);
    const count = await redis_1.default.incr(key);
    /* 🔥 SET TTL ONLY ON FIRST HIT */
    if (count === 1) {
        await redis_1.default.expire(key, TTL);
    }
    return count;
};
exports.logWebhookFailure = logWebhookFailure;
/* ======================================
GET CURRENT HOUR FAILURES
====================================== */
const getWebhookFailures = async (platform) => {
    const key = getKey(platform);
    const value = await redis_1.default.get(key);
    return Number(value || 0);
};
exports.getWebhookFailures = getWebhookFailures;
