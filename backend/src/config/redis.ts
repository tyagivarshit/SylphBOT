import Redis from "ioredis";

console.log("REDIS_URL:", process.env.REDIS_URL);

let redis: Redis | null = null;

if (!process.env.REDIS_URL) {
  console.log("❌ REDIS_URL missing");
} else {
  redis = new Redis(process.env.REDIS_URL, {
    tls: {},
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected");
  });

  redis.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
  });
}

export default redis;