import cron from "node-cron";
import { replayDeferredIntegrationProjectionReconciles } from "../services/integrationProjectionRecovery.service";

const RECOVERY_CRON_SCHEDULE =
  process.env.INTEGRATION_PROJECTION_RECOVERY_CRON || "*/1 * * * *";

const STARTUP_TIME = Date.now();
const STARTUP_GRACE_PERIOD_MS = 60_000;

export const startIntegrationProjectionRecoveryCron = () => {
  return cron.schedule(RECOVERY_CRON_SCHEDULE, async () => {
    if (Date.now() - STARTUP_TIME < STARTUP_GRACE_PERIOD_MS) {
      console.info("Skipping integration projection recovery execution during startup grace period (60s).");
      return;
    }
    try {
      await replayDeferredIntegrationProjectionReconciles();
    } catch (error) {
      console.warn("INTEGRATION_PROJECTION_RECOVERY_CRON_FAILED", {
        reason: String((error as Error)?.message || "projection_recovery_cron_failed"),
      });
    }
  });
};
