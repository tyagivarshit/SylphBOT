import Redis from "ioredis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const redisUrl = process.env.REDIS_URL;

async function main() {
  const redis = new Redis(redisUrl!, {
    tls: redisUrl!.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
  });

  const key = "test_key_lock";
  const token = "test_token";

  // Clean up
  await redis.del(key);

  const res1 = await redis.set(key, token, "PX", 10000, "NX");
  console.log("First NX set result:", JSON.stringify(res1)); // Expected: "OK"

  const res2 = await redis.set(key, token, "PX", 10000, "NX");
  console.log("Second NX set result:", JSON.stringify(res2)); // Expected: null

  await redis.del(key);
  await redis.quit();
}

main().catch(console.error);
