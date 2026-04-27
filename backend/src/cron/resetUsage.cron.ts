import cron from "node-cron";
import prisma from "../config/prisma";

/*
Runs on the first day of every month at 00:00
*/

export const startUsageResetCron = () => {

  return cron.schedule("0 0 1 * *", async () => {

    try {

      console.log("🔄 Running monthly usage reset...");

      await prisma.usage.deleteMany({});

      console.log("✅ Usage reset completed");

    } catch (error) {

      console.error("❌ Usage reset failed:", error);

    }

  });
};
