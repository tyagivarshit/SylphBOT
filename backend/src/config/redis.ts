import Redis from "ioredis";

let redis: Redis | null = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    tls: {},
    maxRetriesPerRequest: null,
    retryStrategy: () => null, // stop infinite retry
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected");
  });

  redis.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
  });
} else {
  console.log("❌ REDIS_URL missing");
}

export default redis;