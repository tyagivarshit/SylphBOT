import { Queue } from "bullmq";

const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};

export const aiQueue = new Queue("aiQueue", {
  connection: connection,

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
ADD AI JOB (OLD - KEEP AS FALLBACK)
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
      message,
    });

    const job = await aiQueue.add("processAI", data, {
      jobId: `ai:${leadId}:${Date.now()}`,
      priority: 2, // lower priority than router
      delay: 100,
      removeOnComplete: true,
    });

    console.log("✅ AI JOB ADDED:", job.id);
  } catch (error) {
    console.error("🚨 AI QUEUE ERROR:", error);
  }
};

/* ----------------------------------
ADD ROUTER JOB (NEW - MAIN ENTRY)
---------------------------------- */

export const addRouterJob = async (data: any) => {
  const { leadId, message } = data;

  if (!leadId) {
    console.log("🚨 ROUTER JOB BLOCKED: missing leadId");
    return;
  }

  if (!message || message.trim().length === 0) {
    console.log("🚨 ROUTER JOB BLOCKED: empty message");
    return;
  }

  try {
    console.log("🧠 ADDING ROUTER JOB:", {
      leadId,
      message,
    });

    const job = await aiQueue.add("router", data, {
      jobId: `router:${leadId}:${Date.now()}`,
      priority: 1, // 🔥 highest priority
      delay: 50,
      removeOnComplete: true,
    });

    console.log("✅ ROUTER JOB ADDED:", job.id);
  } catch (error) {
    console.error("🚨 ROUTER QUEUE ERROR:", error);
  }
};