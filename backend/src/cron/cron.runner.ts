import cron from "node-cron";
import { runCleanup } from "./cron.cleanup";

export const startCleanupCron = () =>
  cron.schedule("0 2 * * *", async () => {
    await runCleanup();
  });
