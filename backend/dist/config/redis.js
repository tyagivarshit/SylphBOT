"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = exports.redisConnection = void 0;
const ioredis_1 = require("ioredis");
/* BullMQ connection */
exports.redisConnection = {
    host: "127.0.0.1",
    port: 6379,
};
/* Redis client for rate limits, cache, etc */
exports.redis = new ioredis_1.Redis({
    host: "127.0.0.1",
    port: 6379,
});
