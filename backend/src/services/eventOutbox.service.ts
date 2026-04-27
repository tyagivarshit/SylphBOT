import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";

const stringifyOutboxError = (error: unknown) =>
  String((error as { message?: unknown })?.message || error || "outbox_failed").slice(
    0,
    2000
  );

export const createDurableOutboxEvent = async ({
  businessId,
  eventType,
  aggregateType,
  aggregateId,
  payload,
  dedupeKey,
}: {
  businessId?: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  dedupeKey?: string | null;
}) => {
  const normalizedDedupeKey = String(dedupeKey || "").trim() || null;

  if (normalizedDedupeKey) {
    const existing = await prisma.eventOutbox.findUnique({
      where: {
        dedupeKey: normalizedDedupeKey,
      },
    });

    if (existing) {
      return existing;
    }
  }

  try {
    return await prisma.eventOutbox.create({
      data: {
        businessId: businessId || null,
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey: normalizedDedupeKey,
      },
    });
  } catch (error) {
    if (!normalizedDedupeKey) {
      throw error;
    }

    const existing = await prisma.eventOutbox.findUnique({
      where: {
        dedupeKey: normalizedDedupeKey,
      },
    });

    if (existing) {
      return existing;
    }

    throw error;
  }
};

export const markEventOutboxPublished = async (id: string) =>
  prisma.eventOutbox.update({
    where: {
      id,
    },
    data: {
      publishedAt: new Date(),
      failedAt: null,
      lastError: null,
    },
  });

export const markEventOutboxFailed = async (id: string, error: unknown) =>
  prisma.eventOutbox.update({
    where: {
      id,
    },
    data: {
      failedAt: new Date(),
      lastError: stringifyOutboxError(error),
      retries: {
        increment: 1,
      },
    },
  });

export const hasOutboxConsumerCheckpoint = async ({
  eventOutboxId,
  consumerKey,
}: {
  eventOutboxId: string;
  consumerKey: string;
}) =>
  prisma.eventConsumerCheckpoint
    .findUnique({
      where: {
        eventOutboxId_consumerKey: {
          eventOutboxId,
          consumerKey,
        },
      },
      select: {
        id: true,
      },
    })
    .then((row) => Boolean(row));

export const markOutboxConsumerCheckpoint = async ({
  eventOutboxId,
  consumerKey,
}: {
  eventOutboxId: string;
  consumerKey: string;
}) =>
  prisma.eventConsumerCheckpoint.upsert({
    where: {
      eventOutboxId_consumerKey: {
        eventOutboxId,
        consumerKey,
      },
    },
    update: {
      processedAt: new Date(),
    },
    create: {
      eventOutboxId,
      consumerKey,
    },
  });
