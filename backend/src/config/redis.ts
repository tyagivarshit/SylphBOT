import Redis from "ioredis";

let redis: Redis | undefined;

if (!process.env.REDIS_URL) {
  console.log("❌ REDIS_URL not found");
} else {
  redis = new Redis(process.env.REDIS_URL, {
    tls: {},
    maxRetriesPerRequest: null,
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected");
  });

  redis.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
  });
}

export default redis;