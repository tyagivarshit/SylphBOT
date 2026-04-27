import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import crypto from "crypto";

const stringifyOutboxError = (error: unknown) =>
  String((error as { message?: unknown })?.message || error || "outbox_failed").slice(
    0,
    2000
  );

const shouldUseInMemoryOutbox =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const globalForEventOutbox = globalThis as typeof globalThis & {
  __sylphEventOutboxStore?: Map<string, any>;
  __sylphEventOutboxByDedupe?: Map<string, string>;
  __sylphEventOutboxCheckpoints?: Map<string, { id: string; processedAt: Date }>;
};

const getInMemoryOutboxStore = () => {
  if (!globalForEventOutbox.__sylphEventOutboxStore) {
    globalForEventOutbox.__sylphEventOutboxStore = new Map();
  }

  return globalForEventOutbox.__sylphEventOutboxStore;
};

const getInMemoryOutboxByDedupe = () => {
  if (!globalForEventOutbox.__sylphEventOutboxByDedupe) {
    globalForEventOutbox.__sylphEventOutboxByDedupe = new Map();
  }

  return globalForEventOutbox.__sylphEventOutboxByDedupe;
};

const getInMemoryCheckpointStore = () => {
  if (!globalForEventOutbox.__sylphEventOutboxCheckpoints) {
    globalForEventOutbox.__sylphEventOutboxCheckpoints = new Map();
  }

  return globalForEventOutbox.__sylphEventOutboxCheckpoints;
};

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

  if (shouldUseInMemoryOutbox) {
    const store = getInMemoryOutboxStore();
    const dedupe = getInMemoryOutboxByDedupe();

    if (normalizedDedupeKey) {
      const existingId = dedupe.get(normalizedDedupeKey);

      if (existingId) {
        return store.get(existingId);
      }
    }

    const record = {
      id: `evt_outbox_${crypto.randomUUID()}`,
      businessId: businessId || null,
      eventType,
      aggregateType,
      aggregateId,
      payload,
      dedupeKey: normalizedDedupeKey,
      createdAt: new Date(),
      publishedAt: null,
      failedAt: null,
      retries: 0,
      lastError: null,
    };

    store.set(record.id, record);

    if (normalizedDedupeKey) {
      dedupe.set(normalizedDedupeKey, record.id);
    }

    return record;
  }

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
  shouldUseInMemoryOutbox
    ? (() => {
        const store = getInMemoryOutboxStore();
        const current = store.get(id);
        const updated = {
          ...current,
          publishedAt: new Date(),
          failedAt: null,
          lastError: null,
        };
        store.set(id, updated);
        return Promise.resolve(updated);
      })()
    : prisma.eventOutbox.update({
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
  shouldUseInMemoryOutbox
    ? (() => {
        const store = getInMemoryOutboxStore();
        const current = store.get(id);
        const updated = {
          ...current,
          failedAt: new Date(),
          lastError: stringifyOutboxError(error),
          retries: Number(current?.retries || 0) + 1,
        };
        store.set(id, updated);
        return Promise.resolve(updated);
      })()
    : prisma.eventOutbox.update({
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
  shouldUseInMemoryOutbox
    ? Promise.resolve(
        getInMemoryCheckpointStore().has(`${eventOutboxId}:${consumerKey}`)
      )
    : prisma.eventConsumerCheckpoint
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
  shouldUseInMemoryOutbox
    ? Promise.resolve(
        getInMemoryCheckpointStore().set(`${eventOutboxId}:${consumerKey}`, {
          id: `${eventOutboxId}:${consumerKey}`,
          processedAt: new Date(),
        })
      )
    : prisma.eventConsumerCheckpoint.upsert({
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
