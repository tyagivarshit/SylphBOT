import Redis from "ioredis";

async function main() {
  console.log("Checking if local Redis is running on 127.0.0.1:6379...");
  const client = new Redis("redis://127.0.0.1:6379", {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  });

  try {
    const pong = await client.ping();
    console.log(`Local Redis is RUNNING! Ping response: ${pong}`);
  } catch (err: any) {
    console.error("Local Redis is NOT running:", err.message);
  } finally {
    await client.quit();
  }
}

main().catch(console.error);
