"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDuplicateJob = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const redisState_service_1 = require("./redisState.service");
const isDuplicateJob = async (jobId) => {
    const key = (0, redisState_service_1.buildIdempotencyRedisKey)(`queue:${jobId}`);
    const acquired = await redis_1.default.set(key, "1", "EX", redisState_service_1.IDEMPOTENCY_TTL_SECONDS, "NX");
    return acquired !== "OK";
};
exports.isDuplicateJob = isDuplicateJob;
