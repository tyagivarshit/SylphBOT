import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const aiQueue = new Queue("aiQueue", {
  connection: redisConnection,

  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 5000,
    },

    removeOnComplete: {
      age: 3600,
      count: 1000,
    },

    removeOnFail: {
      age: 24 * 3600,
    },
  },
});

/* ----------------------------------
ADD AI JOB
---------------------------------- */

export const addAIJob = async (data: any) => {

  const { leadId, message } = data;

  if (!leadId) {
    console.log("🚨 AI JOB BLOCKED: missing leadId");
    return;
  }

  if (!message || message.trim().length === 0) {
    console.log("🚨 AI JOB BLOCKED: empty message");
    return;
  }

  try {

    console.log("📥 ADDING AI JOB:", {
      leadId,
      message
    });

    const job = await aiQueue.add(
      "processAI",
      data,
      {
        jobId: `ai:${leadId}:${Date.now()}`,
        priority: 2,
        delay: 100,
        removeOnComplete: true,
      }
    );

    console.log("✅ AI JOB ADDED:", job.id);

  } catch (error) {

    console.error("🚨 AI QUEUE ERROR:", error);

  }

};