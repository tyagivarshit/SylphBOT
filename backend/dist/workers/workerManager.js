"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThroughputLimits = exports.resolveWorkerConcurrency = exports.getWorkerCount = void 0;
const os_1 = __importDefault(require("os"));
const getWorkerCount = () => {
    const cpu = os_1.default.cpus().length;
    if (cpu <= 2)
        return 1;
    if (cpu <= 4)
        return 2;
    return cpu - 1;
};
exports.getWorkerCount = getWorkerCount;
const resolveWorkerConcurrency = (envKey, fallback, options) => {
    const min = Math.max(1, options?.min ?? 1);
    const max = Math.max(min, options?.max ?? 64);
    const raw = process.env[envKey];
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.min(Math.max(Math.floor(value), min), max);
};
exports.resolveWorkerConcurrency = resolveWorkerConcurrency;
const DEFAULT_THROUGHPUT_LIMITS = {
    LOCKED: {
        messagesPerMinute: 0,
        aiPerHour: 0,
    },
    FREE_LOCKED: {
        messagesPerMinute: 0,
        aiPerHour: 0,
    },
    BASIC: {
        messagesPerMinute: 20,
        aiPerHour: 50,
    },
    PRO: {
        messagesPerMinute: 50,
        aiPerHour: 120,
    },
    ELITE: {
        messagesPerMinute: 100,
        aiPerHour: 300,
    },
};
const getThroughputLimits = (planKey) => DEFAULT_THROUGHPUT_LIMITS[planKey || "LOCKED"] ||
    DEFAULT_THROUGHPUT_LIMITS.LOCKED;
exports.getThroughputLimits = getThroughputLimits;
