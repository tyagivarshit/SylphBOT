import prisma from "../config/prisma";

/* ======================================
CONFIG
====================================== */

const DAYS_TO_KEEP = 30;

/* ======================================
DATE HELPER
====================================== */

const getExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - DAYS_TO_KEEP);
  return date;
};

/* ======================================
STRIPE EVENT CLEANUP
====================================== */

const cleanStripeEvents = async () => {
  const expiry = getExpiryDate();

  const result = await prisma.stripeEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiry,
      },
    },
  });

  console.log(`🧹 Stripe events cleaned: ${result.count}`);
};

/* ======================================
WEBHOOK EVENT CLEANUP
====================================== */

const cleanWebhookEvents = async () => {
  const expiry = getExpiryDate();

  const result = await prisma.webhookEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiry,
      },
    },
  });

  console.log(`🧹 Webhook events cleaned: ${result.count}`);
};

/* ======================================
REFRESH TOKEN CLEANUP
====================================== */

const cleanExpiredTokens = async () => {
  const now = new Date();

  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  console.log(`🧹 Expired tokens removed: ${result.count}`);
};

/* ======================================
MAIN CLEANUP RUNNER
====================================== */

export const runCleanup = async () => {
  try {
    console.log("🧹 Running cleanup job...");

    await Promise.all([
      cleanStripeEvents(),
      cleanWebhookEvents(),
      cleanExpiredTokens(),
    ]);

    console.log("✅ Cleanup completed");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
};