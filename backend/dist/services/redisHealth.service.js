"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRedisHealth = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const checkRedisHealth = async () => {
    try {
        await redis_1.default.ping();
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
