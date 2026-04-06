import Redis from "ioredis";
import { env } from "./env";

/* ======================================
🔥 DEBUG: ENV CHECK
====================================== */

console.log("🔍 [REDIS DEBUG] ENV REDIS_URL:", env.REDIS_URL);

if (!env.REDIS_URL) {
  console.error("❌ [REDIS ERROR] REDIS_URL is missing!");
}

/* ======================================
🔥 REDIS INIT
====================================== */

const redis = new Redis(env.REDIS_URL, {
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
  } catch (err) {
    console.error("❌ [REDIS PING FAILED]:", err);
  }
})();

export default redis;