import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL;
console.log("Testing Redis connection to:", redisUrl);

if (!redisUrl) {
  console.error("REDIS_URL is not set in .env!");
  process.exit(1);
}

const client = new Redis(redisUrl, {
  connectTimeout: 5000,
  tls: redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
});

client.on("connect", () => console.log("Redis connected event fired"));
client.on("ready", () => console.log("Redis ready event fired"));
client.on("error", (err) => console.error("Redis error event fired:", err));
client.on("close", () => console.log("Redis close event fired"));
client.on("end", () => console.log("Redis end event fired"));

async function run() {
  try {
    console.log("Waiting for client to be ready...");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for ready")), 6000);
      client.once("ready", () => {
        clearTimeout(timeout);
        resolve(true);
      });
      client.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    console.log("Setting key test_sylph...");
    const setRes = await client.set("test_sylph", "working_fine", "EX", 60);
    console.log("Set result:", setRes);

    console.log("Getting key test_sylph...");
    const getRes = await client.get("test_sylph");
    console.log("Get result:", getRes);

  } catch (err) {
    console.error("Run error:", err);
  } finally {
    client.disconnect();
  }
}

run();
