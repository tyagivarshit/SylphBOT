import http from "http";
import app from "./app";
import prisma from "./config/prisma";
import { env } from "./config/env";
import { closeRedisConnection } from "./config/redis";
import { closeAIQueue } from "./queues/ai.queue";
import { initSocket } from "./sockets/socket.server";
import logger from "./utils/logger";
import { captureExceptionWithContext } from "./observability/sentry";

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
  logger.error({ error }, "Server uncaught exception");
  captureExceptionWithContext(error, {
    tags: {
      layer: "server",
      event: "uncaughtException",
    },
  });
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  logger.error(
    {
      error,
    },
    "Server unhandled rejection"
  );
  captureExceptionWithContext(error, {
    tags: {
      layer: "server",
      event: "unhandledRejection",
    },
  });
});

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server listening");
});
