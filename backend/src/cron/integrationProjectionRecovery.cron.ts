import cron from "node-cron";
import { replayDeferredIntegrationProjectionReconciles } from "../services/integrationProjectionRecovery.service";

const RECOVERY_CRON_SCHEDULE =
  process.env.INTEGRATION_PROJECTION_RECOVERY_CRON || "*/1 * * * *";

export const startIntegrationProjectionRecoveryCron = () => {
  return cron.schedule(RECOVERY_CRON_SCHEDULE, async () => {
    try {
      await replayDeferredIntegrationProjectionReconciles();
    } catch (error) {
      console.warn("INTEGRATION_PROJECTION_RECOVERY_CRON_FAILED", {
        reason: String((error as Error)?.message || "projection_recovery_cron_failed"),
      });
    }
  });
};
