import { Queue, Worker } from "bullmq";
import redis from "../config/redis";

/* ================================
   CONNECTION
================================ */

const connection = redis;

/* ================================
   QUEUE
================================ */

export const exampleQueue = new Queue("example-queue", {
  connection,
});

/* ================================
   WORKER
================================ */

export const exampleWorker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection,
  }
);