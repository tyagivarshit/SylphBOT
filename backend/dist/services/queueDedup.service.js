"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDuplicateJob = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const PREFIX = "queue_dedup";
const TTL = 60; // seconds
const isDuplicateJob = async (jobId) => {
    const key = `${PREFIX}:${jobId}`;
    const exists = await redis_1.default.get(key);
    if (exists) {
        return true;
    }
    await redis_1.default.set(key, "1", "EX", TTL);
    return false;
};
exports.isDuplicateJob = isDuplicateJob;
