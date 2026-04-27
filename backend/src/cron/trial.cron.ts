import cron from "node-cron";
import prisma from "../config/prisma";

export const startTrialExpiryCron = () => {
  return cron.schedule("0 2 * * *", async () => {

    console.log("⏳ Running trial expiry check...");

    try {

      const now = new Date();

      const expiredSubscriptions =
        await prisma.subscription.findMany({
          where: {
            isTrial: true,
            status: "ACTIVE",
            currentPeriodEnd: {
              not: null,
              lt: now,
            },
          },
        });

      if (expiredSubscriptions.length === 0) {
        console.log("No expired trials found.");
        return;
      }

      console.log(
        `Found ${expiredSubscriptions.length} expired trials`
      );

      await prisma.subscription.updateMany({
        where: {
          id: {
            in: expiredSubscriptions.map((s) => s.id),
          },
        },
        data: {
          status: "INACTIVE",
          isTrial: false,
        },
      });

      console.log(
        `Deactivated ${expiredSubscriptions.length} expired trials`
      );

    } catch (error) {

      console.error("Trial Cron Error:", error);

    }

  });
};
