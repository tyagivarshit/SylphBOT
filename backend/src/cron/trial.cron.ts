import cron from "node-cron";
import prisma from "../config/prisma";

export const startTrialExpiryCron = () => {
  return cron.schedule("0 2 * * *", async () => {
    console.log("Running trial expiry check...");

    try {
      const now = new Date();
      const expiredSubscriptions = await prisma.subscriptionLedger.findMany({
        where: {
          status: "TRIALING",
          trialEndsAt: {
            not: null,
            lt: now,
          },
        },
      });

      if (!expiredSubscriptions.length) {
        console.log("No expired trials found.");
        return;
      }

      await prisma.subscriptionLedger.updateMany({
        where: {
          id: {
            in: expiredSubscriptions.map((row) => row.id),
          },
        },
        data: {
          status: "EXPIRED",
          trialEndsAt: now,
          renewAt: null,
        },
      });

      console.log(`Expired ${expiredSubscriptions.length} trial subscriptions`);
    } catch (error) {
      console.error("Trial Cron Error:", error);
    }
  });
};
