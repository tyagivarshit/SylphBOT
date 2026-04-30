import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import crypto from "crypto";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "./reliability/reliabilityOS.service";

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

const recordOutboxObservability = async (row: {
  id: string;
  businessId?: string | null;
  eventType?: string | null;
  aggregateType?: string | null;
  aggregateId?: string | null;
  payload?: unknown;
}) => {
  const payload =
    row.payload && typeof row.payload === "object"
      ? (row.payload as Record<string, unknown>)
      : {};
  const traceId =
    typeof payload.traceId === "string" && payload.traceId.trim()
      ? payload.traceId.trim()
      : typeof (payload as any)?.payload?.traceId === "string" &&
        String((payload as any).payload.traceId).trim()
      ? String((payload as any).payload.traceId).trim()
      : null;

  await recordTraceLedger({
    traceId,
    correlationId: traceId,
    businessId: row.businessId || null,
    tenantId: row.businessId || null,
    stage: `outbox:${String(row.eventType || "event")}`,
    status: "IN_PROGRESS",
    metadata: {
      outboxId: row.id,
      aggregateType: row.aggregateType || null,
      aggregateId: row.aggregateId || null,
    },
  }).catch(() => undefined);

  await recordObservabilityEvent({
    businessId: row.businessId || null,
    tenantId: row.businessId || null,
    eventType: "outbox.event.created",
    message: `Outbox event ${row.id} queued`,
    severity: "info",
    context: {
      traceId,
      correlationId: traceId,
      tenantId: row.businessId || null,
      component: "outbox",
      phase: "dispatch",
    },
    metadata: {
      outboxId: row.id,
      eventType: row.eventType || null,
      aggregateType: row.aggregateType || null,
      aggregateId: row.aggregateId || null,
    },
  }).catch(() => undefined);
};

export const findOutboxEventByDedupeKey = async (dedupeKey: string) => {
  const normalized = String(dedupeKey || "").trim();

  if (!normalized) {
    return null;
  }

  if (shouldUseInMemoryOutbox) {
    const dedupe = getInMemoryOutboxByDedupe();
    const store = getInMemoryOutboxStore();
    const id = dedupe.get(normalized);
    return id ? store.get(id) || null : null;
  }

  return prisma.eventOutbox.findUnique({
    where: {
      dedupeKey: normalized,
    },
  });
};

export const createDurableOutboxEvent = async ({
  businessId,
  eventType,
  aggregateType,
  aggregateId,
  payload,
  dedupeKey,
  tx,
}: {
  businessId?: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  dedupeKey?: string | null;
  tx?: Prisma.TransactionClient;
}) => {
  const normalizedDedupeKey = String(dedupeKey || "").trim() || null;
  const db = tx || prisma;

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

    void recordOutboxObservability(record).catch(() => undefined);
    return record;
  }

  if (normalizedDedupeKey) {
    const existing = await db.eventOutbox.findUnique({
      where: {
        dedupeKey: normalizedDedupeKey,
      },
    });

    if (existing) {
      return existing;
    }
  }

  try {
    const created = await db.eventOutbox.create({
      data: {
        businessId: businessId || null,
        eventType,
        aggregateType,
        aggregateId,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey: normalizedDedupeKey,
      },
    });
    void recordOutboxObservability(created).catch(() => undefined);
    return created;
  } catch (error) {
    if (!normalizedDedupeKey) {
      throw error;
    }

    const existing = await db.eventOutbox.findUnique({
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
        void recordObservabilityEvent({
          businessId: updated.businessId || null,
          tenantId: updated.businessId || null,
          eventType: "outbox.event.published",
          message: `Outbox event ${id} published`,
          severity: "info",
          context: {
            traceId:
              typeof updated.payload?.traceId === "string"
                ? updated.payload.traceId
                : null,
            correlationId:
              typeof updated.payload?.traceId === "string"
                ? updated.payload.traceId
                : null,
            component: "outbox",
            phase: "publish",
          },
          metadata: {
            outboxId: id,
            eventType: updated.eventType || null,
          },
        }).catch(() => undefined);
        return Promise.resolve(updated);
      })()
    : prisma.eventOutbox
        .update({
          where: {
            id,
          },
          data: {
            publishedAt: new Date(),
            failedAt: null,
            lastError: null,
          },
        })
        .then((updated) => {
          void recordObservabilityEvent({
            businessId: updated.businessId || null,
            tenantId: updated.businessId || null,
            eventType: "outbox.event.published",
            message: `Outbox event ${id} published`,
            severity: "info",
            context: {
              traceId:
                typeof (updated.payload as any)?.traceId === "string"
                  ? String((updated.payload as any).traceId)
                  : null,
              correlationId:
                typeof (updated.payload as any)?.traceId === "string"
                  ? String((updated.payload as any).traceId)
                  : null,
              component: "outbox",
              phase: "publish",
            },
            metadata: {
              outboxId: id,
              eventType: updated.eventType || null,
            },
          }).catch(() => undefined);
          return updated;
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
        void recordObservabilityEvent({
          businessId: updated.businessId || null,
          tenantId: updated.businessId || null,
          eventType: "outbox.event.failed",
          message: `Outbox event ${id} failed`,
          severity: "error",
          context: {
            traceId:
              typeof updated.payload?.traceId === "string"
                ? updated.payload.traceId
                : null,
            correlationId:
              typeof updated.payload?.traceId === "string"
                ? updated.payload.traceId
                : null,
            component: "outbox",
            phase: "publish",
          },
          metadata: {
            outboxId: id,
            eventType: updated.eventType || null,
            error: stringifyOutboxError(error),
          },
        }).catch(() => undefined);
        return Promise.resolve(updated);
      })()
    : prisma.eventOutbox
        .update({
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
        })
        .then((updated) => {
          void recordObservabilityEvent({
            businessId: updated.businessId || null,
            tenantId: updated.businessId || null,
            eventType: "outbox.event.failed",
            message: `Outbox event ${id} failed`,
            severity: "error",
            context: {
              traceId:
                typeof (updated.payload as any)?.traceId === "string"
                  ? String((updated.payload as any).traceId)
                  : null,
              correlationId:
                typeof (updated.payload as any)?.traceId === "string"
                  ? String((updated.payload as any).traceId)
                  : null,
              component: "outbox",
              phase: "publish",
            },
            metadata: {
              outboxId: id,
              eventType: updated.eventType || null,
              error: stringifyOutboxError(error),
            },
          }).catch(() => undefined);
          return updated;
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
