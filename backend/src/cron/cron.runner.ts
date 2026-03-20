import cron from "node-cron";
import { runCleanup } from "./cron.cleanup";

/* Runs daily at 2 AM */
cron.schedule("0 2 * * *", async () => {
  await runCleanup();
});