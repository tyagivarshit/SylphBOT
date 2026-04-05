import { Queue } from "bullmq";

const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};
const aiQueue = new Queue("aiQueue", {
  connection: connection,
});

export const getQueueHealth = async () => {

  const waiting = await aiQueue.getWaitingCount();
  const active = await aiQueue.getActiveCount();
  const delayed = await aiQueue.getDelayedCount();
  const failed = await aiQueue.getFailedCount();

  return {
    waiting,
    active,
    delayed,
    failed,
  };

};