import prisma from "../../config/prisma";
import logger from "../../utils/logger";

const toJsonSafe = (value: unknown) => {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

export const recordAutonomousEvent = async ({
  businessId,
  type,
  meta,
}: {
  businessId: string;
  type: string;
  meta?: Record<string, unknown>;
}) => {
  const payload = toJsonSafe(meta || {});

  await prisma.analytics.create({
    data: {
      businessId,
      type,
      meta: payload as any,
    },
  });

  logger.info(
    {
      businessId,
      type,
      meta: payload,
    },
    "Autonomous engine event recorded"
  );
};

export const getAutonomousEvents = async ({
  businessId,
  limit = 20,
}: {
  businessId: string;
  limit?: number;
}) =>
  prisma.analytics.findMany({
    where: {
      businessId,
      type: {
        startsWith: "AUTONOMOUS_",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: Math.max(1, Math.min(limit, 100)),
  });
