import { Queue, Worker } from "bullmq";

const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};

export const exampleQueue = new Queue("example-queue", {
  connection,
});

export const exampleWorker = new Worker(
  "example-queue",
  async (job) => {
    console.log("Processing job:", job.data);
  },
  {
    connection,
  }
);