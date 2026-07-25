import Redis from "ioredis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("REDIS_URL not found in .env");
  process.exit(1);
}

async function main() {
  console.log("Connecting to Redis...");
  const redis = new Redis(redisUrl, {
    tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  });

  const leadId = "6a63755aad10ed3af4d70293";
  const lockKey = `ai_pipeline:lead_lock:${leadId}`;

  const value = await redis.get(lockKey);
  const ttl = await redis.ttl(lockKey);

  console.log(`Lock key: ${lockKey}`);
  console.log(`Value:`, value);
  console.log(`TTL (seconds):`, ttl);

  // Let's also check all keys matching lead_lock
  const keys = await redis.keys("ai_pipeline:lead_lock:*");
  console.log("All active lead locks:");
  for (const k of keys) {
    const val = await redis.get(k);
    const t = await redis.ttl(k);
    console.log(` - ${k}: value=${val}, ttl=${t}`);
  }

  await redis.quit();
}

main().catch(console.error);
