import Redis from "ioredis";
import { Queue } from "bullmq";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const redisUrl = process.env.REDIS_URL;

async function checkQueue(queueName: string) {
  const queue = new Queue(queueName, {
    connection: new Redis(redisUrl!, {
      maxRetriesPerRequest: null,
      tls: redisUrl!.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    }),
  });

  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);

  console.log(`Queue: ${queueName}`);
  console.log(` - Waiting: ${waiting}`);
  console.log(` - Active: ${active}`);
  console.log(` - Delayed: ${delayed}`);
  console.log(` - Failed: ${failed}`);
  console.log(` - Completed: ${completed}`);

  if (waiting > 0 || active > 0) {
    console.log(" Jobs:");
    const jobs = await queue.getJobs(["waiting", "active"], 0, 5);
    for (const job of jobs) {
      console.log(`   - Job ID: ${job.id}`);
      console.log(`     State: ${await job.getState()}`);
      console.log(`     Attempts: ${job.attemptsMade} / ${job.opts.attempts}`);
      console.log(`     Data:`, JSON.stringify(job.data));
      if (job.failedReason) {
        console.log(`     Failed Reason: ${job.failedReason}`);
      }
    }
  }
  
  await queue.close();
}

async function main() {
  console.log("Checking BullMQ Queues in Redis...");
  
  const queues = [
    "webhook-ingest",
    "webhook-reconcile",
    "inbound-normalization",
    "inbound-classification",
    "inbound-routing",
    "revenue-brain-bridge",
    "ai-high",
    "ai-high-lane-realtime-p0",
    "ai-high-lane-realtime-p1",
    "ai-high-lane-webhook-p0",
    "ai-high-lane-webhook-p1",
    "ai-high-lane-orchestration-p0",
    "ai-high-lane-orchestration-p1",
    "ai-high-lane-autonomous-p0",
    "ai-high-lane-retry-p0",
    "aiQueue"
  ];

  for (const q of queues) {
    try {
      await checkQueue(q);
    } catch (err) {
      console.error(`Error checking queue ${q}:`, err);
    }
  }
}

main().catch(console.error);
