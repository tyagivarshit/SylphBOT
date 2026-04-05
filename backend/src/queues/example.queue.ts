import { Queue, Worker } from "bullmq";

/* ================================
   CONNECTION
================================ */

const connection = process.env.REDIS_URL
  ? {
      connection: {
        host: new URL(process.env.REDIS_URL).hostname,
        port: Number(new URL(process.env.REDIS_URL).port),
        username: "default",
        password: new URL(process.env.REDIS_URL).password,
        tls: {},
      },
    }
  : undefined;

/* ================================
   QUEUE
================================ */

export const exampleQueue = new Queue(
  "example-queue",
  connection
);

/* ================================
   WORKER
================================ */

export const exampleWorker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  connection
);