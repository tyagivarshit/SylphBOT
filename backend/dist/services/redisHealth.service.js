"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRedisHealth = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default(process.env.REDIS_URL);
const checkRedisHealth = async () => {
    try {
        await redis.ping();
        return {
            status: "healthy",
        };
    }
    catch (error) {
        return {
            status: "unhealthy",
        };
    }
};
exports.checkRedisHealth = checkRedisHealth;
