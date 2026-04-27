import cron from "node-cron";
import logger from "../utils/logger";
import { runAutonomousSchedulerAsLeader } from "../services/autonomous/scheduler.service";

export const startAutonomousSchedulerCron = () =>
  cron.schedule("*/30 * * * *", async () => {
    try {
      const result = await runAutonomousSchedulerAsLeader({
        autoDispatch: true,
      });

      if (!result) {
        logger.info("Autonomous scheduler cron skipped because another leader is active");
        return;
      }

      logger.info(
        {
          evaluatedLeads: result.evaluatedLeads,
          queued: result.queued,
          blocked: result.blocked,
        },
        "Autonomous scheduler cron completed"
      );
    } catch (error) {
      logger.error(
        {
          error,
        },
        "Autonomous scheduler cron failed"
      );
    }
  });
