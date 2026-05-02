import logger from "../utils/logger";
import {
  captureExceptionWithContext,
  initializeSentry,
} from "../observability/sentry";
import {
  initQueues,
  initWorkers,
  shutdown,
} from "../runtime/lifecycle";

let started = false;
let isShuttingDown = false;
const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

export const startWorkerRuntime = async () => {
  if (started) {
    return;
  }

  if (!shouldRunWorker) {
    logger.info(
      { runWorker: process.env.RUN_WORKER ?? null },
      "Worker runtime disabled by RUN_WORKER flag"
    );
    return;
  }

  try {
    started = true;
    initializeSentry();
    await initQueues();
    initWorkers({
      crmRefresh: true,
      revenueBrainEvents: true,
      aiPartition: true,
      followup: true,
      authEmail: true,
      appointmentOps: true,
      calendarSync: true,
      receptionRuntime: true,
      humanReminder: true,
    });
  } catch (error) {
    started = false;
    throw error;
  }

  const shutdownWorkerRuntime = async (exitCode = 0) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    await shutdown();
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdownWorkerRuntime(0);
  });

  process.on("SIGTERM", () => {
    void shutdownWorkerRuntime(0);
  });

  process.on("uncaughtException", (error) => {
    logger.error({ error }, "AI worker uncaught exception");
    captureExceptionWithContext(error, {
      tags: {
        worker: "ai.partition",
        event: "uncaughtException",
      },
    });
    void shutdownWorkerRuntime(1);
  });

  process.on("unhandledRejection", (error) => {
    logger.error({ error }, "AI worker unhandled rejection");
    captureExceptionWithContext(error, {
      tags: {
        worker: "ai.partition",
        event: "unhandledRejection",
      },
    });
    void shutdownWorkerRuntime(1);
  });
};

if (require.main === module) {
  void startWorkerRuntime().catch((error) => {
    logger.error({ error }, "AI worker failed to start");
    captureExceptionWithContext(error, {
      tags: {
        worker: "ai.partition",
        event: "startupFailure",
      },
    });
    process.exit(1);
  });
}
