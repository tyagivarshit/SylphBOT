"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDuplicateJob = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default(process.env.REDIS_URL);
const PREFIX = "queue_dedup";
const TTL = 60; // seconds
const isDuplicateJob = async (jobId) => {
    const key = `${PREFIX}:${jobId}`;
    const exists = await redis.get(key);
    if (exists) {
        return true;
    }
    await redis.set(key, "1", "EX", TTL);
    return false;
};
exports.isDuplicateJob = isDuplicateJob;
