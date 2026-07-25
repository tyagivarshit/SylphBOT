import { acquireLeadProcessingLock, releaseLeadProcessingLock } from "../src/services/aiPipelineState.service";
import { waitForRedisReady } from "../src/config/redis";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  console.log("Waiting for Redis to be ready...");
  await waitForRedisReady();
  console.log("Redis is ready!");

  const leadId = "6a63755aad10ed3af4d70293";
  const jobKey = "test_job_key_123";

  console.log(`Attempting to acquire lock for lead: ${leadId} with jobKey: ${jobKey}...`);
  const acquired = await acquireLeadProcessingLock(leadId, jobKey, {
    waitMs: 1200,
    pollMs: 50,
  });

  console.log("Lock acquisition outcome:", acquired);

  if (acquired) {
    console.log("Releasing lock...");
    await releaseLeadProcessingLock(leadId, jobKey);
    console.log("Lock released!");
  }
}

main().catch(console.error);
