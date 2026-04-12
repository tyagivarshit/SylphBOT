import http from "http";
import app from "./app";
import prisma from "./config/prisma";
import { env } from "./config/env";
import { closeRedisConnection } from "./config/redis";
import { closeAIQueue } from "./queues/ai.queue";
import { initSocket } from "./sockets/socket.server";

const server = http.createServer(app);
initSocket(server);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 15000;

let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await Promise.allSettled([
    prisma.$disconnect(),
    closeAIQueue(),
    closeRedisConnection(),
  ]);

  if (signal === "uncaughtException") {
    process.exit(1);
  }

  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (error) => {
  console.error(`[server] ${String(error.message || error)}`);
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  console.error(
    `[server] ${String((error as { message?: unknown })?.message || error)}`
  );
});

server.listen(env.PORT, () => {
  console.log(`[server] listening on ${env.PORT}`);
});
