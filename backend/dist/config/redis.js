"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
/* ======================================
🔥 DEBUG: ENV CHECK
====================================== */
console.log("🔍 [REDIS DEBUG] ENV REDIS_URL:", process.env.REDIS_URL);
if (!process.env.REDIS_URL) {
    console.error("❌ [REDIS ERROR] REDIS_URL is missing!");
}
/* ======================================
🔥 REDIS INIT
====================================== */
const redis = new ioredis_1.default(process.env.REDIS_URL, {
    tls: {},
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
/* ======================================
🔥 EVENT LOGGING
====================================== */
redis.on("connect", () => {
    console.log("✅ [REDIS] Connected");
});
redis.on("ready", () => {
    console.log("🚀 [REDIS] Ready to use");
});
redis.on("error", (err) => {
    console.error("❌ [REDIS ERROR]:", err);
});
redis.on("close", () => {
    console.warn("⚠️ [REDIS] Connection closed");
});
redis.on("reconnecting", () => {
    console.warn("🔄 [REDIS] Reconnecting...");
});
redis.on("end", () => {
    console.warn("🛑 [REDIS] Connection ended");
});
/* ======================================
🔥 PING TEST (STARTUP CHECK)
====================================== */
(async () => {
    try {
        console.log("📡 [REDIS] Sending PING...");
        const res = await redis.ping();
        console.log("🏓 [REDIS] Ping response:", res);
    }
    catch (err) {
        console.error("❌ [REDIS PING FAILED]:", err);
    }
})();
exports.default = redis;
