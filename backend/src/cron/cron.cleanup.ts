import prisma from "../config/prisma";

const DAYS_TO_KEEP = 30;

const getExpiryDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - DAYS_TO_KEEP);
  return date;
};

const cleanCommerceIdempotency = async () => {
  const expiry = getExpiryDate();
  const result = await prisma.externalCommerceIdempotency.deleteMany({
    where: {
      processedAt: {
        not: null,
        lt: expiry,
      },
    },
  });

  console.log(`External commerce idempotency rows cleaned: ${result.count}`);
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

const deactivateExpiredManualOverrides = async () => {
  const now = new Date();
  const result = await prisma.manualCommerceOverride.updateMany({
    where: {
      isActive: true,
      expiresAt: {
        lte: now,
      },
    },
    data: {
      isActive: false,
    },
  });

  console.log(`Expired manual commerce overrides deactivated: ${result.count}`);
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

    await Promise.all([
      cleanCommerceIdempotency(),
      cleanWebhookEvents(),
      deactivateExpiredManualOverrides(),
      cleanExpiredTokens(),
    ]);

    console.log("Cleanup completed");
  } catch (error) {
    console.error("Cleanup failed:", error);
  }
};
