process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";
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
import { PrewarmService } from "../services/prewarm.service";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import { container } from "../runtime/kernel/diContainer";
import { ExecutiveIdentityPlugin } from "../services/executive/plugin";

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
    PrewarmService.triggerAsyncPrewarm("worker_boot");

    // Bootstrap Universal Core Runtime
    if (!container.has("IMemoryEngine")) {
      await bootstrapper.bootstrap();
    }
    if (!container.has("IEmbeddingEngine")) {
      const { EmbeddingEngine } = await import("../services/embedding.service");
      container.registerInstance("IEmbeddingEngine", new EmbeddingEngine());
    }
    if (!container.has("IKnowledgeStore")) {
      const { KnowledgeStore } = await import("../services/knowledgeSearch.service");
      container.registerInstance("IKnowledgeStore", new KnowledgeStore());
    }
    const pluginRegistry = container.resolve<any>("IPluginRegistry");
    if (!pluginRegistry.getPlugin("plugin.executive.identity")) {
      await pluginRegistry.registerPlugin(new ExecutiveIdentityPlugin());
    }

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
      webhookIntake: true,
      integrationOnboardingProjection: true,
      metaOAuthContinuation: true,
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
