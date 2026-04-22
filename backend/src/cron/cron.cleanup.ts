import prisma from "../config/prisma";
import { expirePastDueSubscriptions } from "../services/billingSync.service";

const DAYS_TO_KEEP = 30;

const getExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - DAYS_TO_KEEP);
  return date;
};

const cleanStripeEvents = async () => {
  const expiry = getExpiryDate();

  const result = await prisma.stripeEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiry,
      },
    },
  });

  console.log(`Stripe events cleaned: ${result.count}`);
};

const cleanBillingEvents = async () => {
  const expiry = getExpiryDate();

  const result = await prisma.billingEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiry,
      },
    },
  });

  console.log(`Billing events cleaned: ${result.count}`);
};

const cleanWebhookEvents = async () => {
  const expiry = getExpiryDate();

  const result = await prisma.webhookEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiry,
      },
    },
  });

  console.log(`Webhook events cleaned: ${result.count}`);
};

const cleanExpiredTokens = async () => {
  const now = new Date();

  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  console.log(`Expired tokens removed: ${result.count}`);
};

export const runCleanup = async () => {
  try {
    console.log("Running cleanup job...");

    const expiredCount = await expirePastDueSubscriptions();

    await Promise.all([
      cleanBillingEvents(),
      cleanStripeEvents(),
      cleanWebhookEvents(),
      cleanExpiredTokens(),
    ]);

    console.log(`Grace period expiries processed: ${expiredCount}`);
    console.log("Cleanup completed");
  } catch (error) {
    console.error("Cleanup failed:", error);
  }
};
