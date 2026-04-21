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

  logger.info({ signal }, "Server shutdown started");

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        signal,
      },
      "Server close failed during shutdown"
    );
  }

  const cleanupResults = await Promise.allSettled([
    prisma.$disconnect(),
    closeAIQueue(),
    closeRedisConnection(),
  ]);

  const cleanupErrors = cleanupResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) =>
      result.reason instanceof Error
        ? {
            name: result.reason.name,
            message: result.reason.message,
            stack: result.reason.stack,
          }
        : result.reason
    );

  if (cleanupErrors.length) {
    logger.error(
      {
        signal,
        cleanupErrors,
      },
      "Server shutdown completed with cleanup errors"
    );
  }

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
  logger.error({ err: error }, "Server uncaught exception");
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
      err: error,
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
