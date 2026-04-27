import cron from "node-cron";
import logger from "../utils/logger";
import { runInboundSlaMonitorAsLeader } from "../services/inboundSlaMonitor.service";

export const startInboundSlaMonitorCron = () =>
  cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await runInboundSlaMonitorAsLeader();

      if (!result) {
        logger.info("Inbound SLA monitor skipped because another leader is active");
        return;
      }

      logger.info(
        {
          monitoredQueues: result.monitoredQueues,
          monitoredInteractions: result.monitoredInteractions,
          emitted: result.emitted,
        },
        "Inbound SLA monitor completed"
      );
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Inbound SLA monitor failed"
      );
    }
  });
