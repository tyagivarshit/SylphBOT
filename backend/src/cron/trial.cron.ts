import cron from "node-cron";
import prisma from "../config/prisma";

export const startTrialExpiryCron = () => {
  cron.schedule("0 2 * * *", async () => {
    console.log("⏳ Running trial expiry check...");

    try {
      const now = new Date();

      // 🔥 Find expired FREE_TRIAL subscriptions
      const expiredSubscriptions =
        await prisma.subscription.findMany({
          where: {
            status: "active", // 🔥 lowercase to match Stripe
            currentPeriodEnd: {
              not: null,
              lt: now,
            },
            plan: {
              name: "FREE_TRIAL",
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

      // 🔥 Get FREE plan
      const freePlan = await prisma.plan.findUnique({
        where: { name: "FREE" },
      });

      if (!freePlan) {
        console.error("FREE plan not configured.");
        return;
      }

      // 🔥 Batch downgrade (faster & safer)
      await prisma.subscription.updateMany({
        where: {
          id: {
            in: expiredSubscriptions.map((s) => s.id),
          },
        },
        data: {
          planId: freePlan.id,
          status: "active",
          currentPeriodEnd: null,
        },
      });

      console.log(
        `Downgraded ${expiredSubscriptions.length} subscriptions to FREE`
      );

    } catch (error) {
      console.error("Trial Cron Error:", error);
    }
  });
};