import http from "http";
import { configurePassport } from "./config/passport";
import { env } from "./config/env";
import { initSocket } from "./sockets/socket.server";
import logger from "./utils/logger";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "./observability/sentry";
import {
  initCrons,
  initQueues,
  shutdown,
} from "./runtime/lifecycle";

let isShuttingDown = false;

export const startServer = async () => {
  initializeSentry();
  configurePassport();
  await initQueues();

  if (process.env.ENABLE_CRON === "true") {
    initCrons();
  }

  const { default: app } = await import("./app");
  const server = http.createServer(app);
  initSocket(server);
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 15000;

  const shutdownServer = async (signal: string, exitCode = 0) => {
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

    await shutdown();
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdownServer("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdownServer("SIGTERM");
  });

  process.on("uncaughtException", (error) => {
    logger.error({ err: error }, "Server uncaught exception");
    captureExceptionWithContext(error, {
      tags: {
        layer: "server",
        event: "uncaughtException",
      },
    });
    void shutdownServer("uncaughtException", 1);
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

  return await new Promise<http.Server>((resolve) => {
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "Server listening");
      resolve(server);
    });
  });
};

if (require.main === module) {
  void startServer();
}
