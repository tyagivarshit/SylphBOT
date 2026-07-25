import { getSharedRedisConnection, waitForRedisReady } from "../src/config/redis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const ACQUIRE_LOCK_SCRIPT = `
local val = redis.call("GET", KEYS[1])
if not val or val == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[1], "PX", tonumber(ARGV[2]))
  return "OK"
end
return nil
`;

async function main() {
  console.log("Waiting for Redis to be ready...");
  await waitForRedisReady();
  console.log("Redis is ready!");

  const redis = getSharedRedisConnection();
  const key = "test_reentrant_key";
  const token = "my_token_123";
  const ttlMs = 5000;

  // Clean up
  await redis.del(key);

  console.log("1. Acquiring lock first time...");
  let res = await redis.eval(ACQUIRE_LOCK_SCRIPT, 1, key, token, String(ttlMs));
  console.log("Result:", res);

  console.log("2. Acquiring lock second time with same token (re-entrant)...");
  res = await redis.eval(ACQUIRE_LOCK_SCRIPT, 1, key, token, String(ttlMs));
  console.log("Result:", res);

  console.log("3. Acquiring lock third time with DIFFERENT token...");
  res = await redis.eval(ACQUIRE_LOCK_SCRIPT, 1, key, "different_token", String(ttlMs));
  console.log("Result (should be null/nil):", res);

  await redis.del(key);
}

main().catch(console.error);
