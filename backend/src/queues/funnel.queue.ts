import { Queue } from "bullmq";
const url = new URL(process.env.REDIS_URL!);

const connection = {
  host: url.hostname,
  port: Number(url.port),
  username: "default",
  password: url.password,
  tls: {},
};

export const funnelQueue = new Queue("funnelQueue", {
  connection: connection,
  prefix: "sylph",
});