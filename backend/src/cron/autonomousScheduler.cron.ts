import cron from "node-cron";
import logger from "../utils/logger";
import { runAutonomousScheduler } from "../services/autonomous/scheduler.service";

export const startAutonomousSchedulerCron = () =>
  cron.schedule("*/30 * * * *", async () => {
    try {
      const result = await runAutonomousScheduler({
        autoDispatch: true,
      });

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
