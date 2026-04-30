import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { decrypt, encrypt } from "../utils/encrypt";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import {
  normalizeCalendarProvider,
  type CalendarProvider,
  type CalendarProviderOperationResult,
  type CalendarProviderError,
} from "./calendarProvider.contract";
import { calendarProviderRouterService } from "./calendarProviderRouter.service";
import {
  resolveCalendarConflict,
  resolveConflictInputFromMetadata,
} from "./calendarConflictArbitration.service";
import { mergeAppointmentMetadata, parseAppointmentMetadata } from "./appointment.shared";
import { toRecord } from "./reception.shared";
import { publishCalendarProviderEvent } from "./calendarProviderEvent.service";

const SYNC_STATE_ORDER: Record<string, number> = {
  PENDING: 1,
  SYNCING: 2,
  RETRYING: 3,
  SYNCED: 4,
  CONFLICT: 5,
  FAILED: 6,
  CANCELLED: 7,
  CANCELLED_EXTERNAL: 7,
};

const isTerminalSyncState = (state: string) =>
  ["SYNCED", "FAILED", "CONFLICT", "CANCELLED", "CANCELLED_EXTERNAL"].includes(state);

const compareSyncState = (from: string, to: string) =>
  (SYNC_STATE_ORDER[to] || 0) - (SYNC_STATE_ORDER[from] || 0);

const buildSyncLedgerDedupeKey = ({
  provider,
  appointmentId,
  dedupeFingerprint,
}: {
  provider: string;
  appointmentId: string;
  dedupeFingerprint?: string | null;
}) =>
  [
    "calendar_sync",
    String(provider || "INTERNAL").trim().toUpperCase(),
    appointmentId,
    String(dedupeFingerprint || "").trim() || "default",
  ].join(":");

const buildWebhookReplayFingerprint = ({
  provider,
  externalEventId,
  externalEventVersion,
  dedupeFingerprint,
}: {
  provider: string;
  externalEventId: string;
  externalEventVersion?: string | null;
  dedupeFingerprint?: string | null;
}) =>
  [
    "calendar_webhook",
    String(provider || "INTERNAL").trim().toUpperCase(),
    String(externalEventId || "").trim(),
    String(externalEventVersion || "").trim() || "no_version",
    String(dedupeFingerprint || "").trim() || "no_fingerprint",
  ].join(":");

const IDEMPOTENCY_INFLIGHT_TIMEOUT_MS = 5 * 60 * 1000;

const buildExternalSyncKey = ({
  businessId,
  provider,
  appointmentId,
  eventType,
  outboxId,
}: {
  businessId: string;
  provider: string;
  appointmentId: string;
  eventType: string;
  outboxId: string;
}) =>
  [
    "sync",
    businessId,
    String(provider || "INTERNAL").trim().toUpperCase(),
    appointmentId,
    eventType,
    outboxId,
  ].join(":");

const buildExternalWebhookKey = ({
  provider,
  replayKey,
}: {
  provider: string;
  replayKey: string;
}) => `webhook:${String(provider || "INTERNAL").trim().toUpperCase()}:${replayKey}`;

const normalizeToken = (value: unknown) => {
  const token = String(value || "").trim();

  if (!token) {
    return "";
  }

  try {
    return decrypt(token);
  } catch {
    return token;
  }
};

const isUniqueError = (error: unknown) =>
  String((error as any)?.code || "").trim().toUpperCase() === "P2002";

const findActiveManualOverride = async ({
  businessId,
  provider,
  windowStart,
  windowEnd,
  now = new Date(),
}: {
  businessId: string;
  provider: string;
  windowStart: Date;
  windowEnd: Date;
  now?: Date;
}) =>
  prisma.manualCalendarOverride.findFirst({
    where: {
      businessId,
      isActive: true,
      expiresAt: {
        gt: now,
      },
      windowStart: {
        lt: windowEnd,
      },
      windowEnd: {
        gt: windowStart,
      },
      provider: {
        in: ["ALL", normalizeCalendarProvider(provider)],
      },
    },
    orderBy: [
      {
        priority: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
  });

const readExternalSyncIdempotency = async ({
  externalSyncKey,
  externalWebhookKey,
}: {
  externalSyncKey: string;
  externalWebhookKey: string;
}) => {
  const [bySyncKey, byWebhookKey] = await Promise.all([
    prisma.externalSyncIdempotency.findUnique({
      where: {
        externalSyncKey,
      },
    }),
    prisma.externalSyncIdempotency.findUnique({
      where: {
        externalWebhookKey,
      },
    }),
  ]);

  return bySyncKey || byWebhookKey || null;
};

const claimExternalSyncIdempotency = async ({
  businessId,
  provider,
  externalSyncKey,
  externalWebhookKey,
  providerEventVersion,
  metadata = null,
}: {
  businessId: string;
  provider: string;
  externalSyncKey: string;
  externalWebhookKey: string;
  providerEventVersion: string;
  metadata?: Record<string, unknown> | null;
}) => {
  const now = new Date();
  const normalizedProvider = normalizeCalendarProvider(provider);
  const existing = await readExternalSyncIdempotency({
    externalSyncKey,
    externalWebhookKey,
  });

  if (existing) {
    if (existing.processedAt) {
      return {
        state: "REPLAYED" as const,
        row: existing,
      };
    }

    const isStale =
      now.getTime() - new Date(existing.updatedAt).getTime() > IDEMPOTENCY_INFLIGHT_TIMEOUT_MS;

    if (!isStale) {
      return {
        state: "INFLIGHT" as const,
        row: existing,
      };
    }

    const reclaimed = await prisma.externalSyncIdempotency.update({
      where: {
        id: existing.id,
      },
      data: {
        providerEventVersion,
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(existing.metadata), metadata, {
          reclaimedAt: now.toISOString(),
        }) as Prisma.InputJsonValue,
      },
    });

    return {
      state: "CLAIMED" as const,
      row: reclaimed,
    };
  }

  try {
    const created = await prisma.externalSyncIdempotency.create({
      data: {
        businessId,
        provider: normalizedProvider,
        externalSyncKey,
        externalWebhookKey,
        providerEventVersion,
        processedAt: null,
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(metadata), {
          claimedAt: now.toISOString(),
        }) as Prisma.InputJsonValue,
      },
    });

    return {
      state: "CLAIMED" as const,
      row: created,
    };
  } catch (error) {
    if (!isUniqueError(error)) {
      throw error;
    }

    const collision = await readExternalSyncIdempotency({
      externalSyncKey,
      externalWebhookKey,
    });

    if (!collision) {
      throw error;
    }

    return {
      state: collision.processedAt ? ("REPLAYED" as const) : ("INFLIGHT" as const),
      row: collision,
    };
  }
};

const markExternalSyncIdempotencyProcessed = async ({
  id,
  providerEventVersion,
  metadata = null,
}: {
  id: string;
  providerEventVersion: string;
  metadata?: Record<string, unknown> | null;
}) => {
  const current = await prisma.externalSyncIdempotency
    .findUnique({
      where: {
        id,
      },
      select: {
        metadata: true,
      },
    })
    .catch(() => null);

  return prisma.externalSyncIdempotency.update({
    where: {
      id,
    },
    data: {
      providerEventVersion,
      processedAt: new Date(),
      metadata: mergeAppointmentMetadata(
        parseAppointmentMetadata(current?.metadata),
        parseAppointmentMetadata(metadata),
        {
          processedAt: new Date().toISOString(),
        }
      ) as Prisma.InputJsonValue,
    },
  });
};

const isRetryableProviderError = (error: unknown) =>
  Boolean((error as CalendarProviderError)?.retryable) ||
  /timeout|rate|network|econnreset|etimedout|429/i.test(
    String((error as any)?.message || error || "")
  );

const mapErrorToSyncStatus = (error: unknown) => {
  const code = String((error as CalendarProviderError)?.code || "").toUpperCase();

  if (code === "CONFLICT") {
    return "CONFLICT";
  }

  if (code === "AUTH_FAILED") {
    return "FAILED";
  }

  return isRetryableProviderError(error) ? "RETRYING" : "FAILED";
};

const resolveEventVersionScore = (value: unknown) => {
  const asNumber = Number(value);

  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  const asDate = new Date(String(value || ""));

  if (!Number.isNaN(asDate.getTime())) {
    return asDate.getTime();
  }

  return 0;
};

const toCalendarEventInputFromAppointment = ({
  appointment,
  externalEventId,
}: {
  appointment: any;
  externalEventId?: string | null;
}) => ({
  businessId: appointment.businessId,
  appointmentId: appointment.id,
  appointmentKey: appointment.appointmentKey,
  title: String(appointment.meetingType || "Appointment"),
  description: String(appointment.notes || "").trim() || null,
  startAt: appointment.startAt || appointment.createdAt,
  endAt:
    appointment.endAt ||
    new Date((appointment.startAt || appointment.createdAt).getTime() + 30 * 60 * 1000),
  timezone: appointment.timezone || "UTC",
  location:
    String(
      toRecord(appointment.locationDetails).location ||
        toRecord(appointment.locationDetails).address ||
        ""
    ).trim() || null,
  meetingJoinUrl: appointment.meetingJoinUrl || null,
  metadata: parseAppointmentMetadata(appointment.metadata),
  externalEventId: externalEventId || null,
});

const normalizeProviderResult = (result: CalendarProviderOperationResult | undefined) => ({
  externalEventId: result?.externalEventId || null,
  externalEventVersion: result?.externalEventVersion || null,
  metadata: result?.metadata || null,
});

const refreshGoogleAccessToken = async ({
  refreshToken,
}: {
  refreshToken: string;
}) => {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("google_refresh_configuration_missing");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`google_refresh_failed:${response.status}:${body}`);
  }

  return response.json() as Promise<{
    access_token: string;
    expires_in: number;
  }>;
};

const refreshOutlookAccessToken = async ({
  refreshToken,
}: {
  refreshToken: string;
}) => {
  const clientId = String(process.env.OUTLOOK_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.OUTLOOK_OAUTH_CLIENT_SECRET || "").trim();
  const tenant = String(process.env.OUTLOOK_OAUTH_TENANT_ID || "common").trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("outlook_refresh_configuration_missing");
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`outlook_refresh_failed:${response.status}:${body}`);
  }

  return response.json() as Promise<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  }>;
};

export const createCalendarSyncService = () => ({
  queueSync: async ({
    businessId,
    appointmentId,
    provider,
    externalCalendarId = null,
    externalEventId = null,
    metadata = null,
    dedupeFingerprint = null,
  }: {
    businessId: string;
    appointmentId: string;
    provider: string;
    externalCalendarId?: string | null;
    externalEventId?: string | null;
    metadata?: Record<string, unknown> | null;
    dedupeFingerprint?: string | null;
  }) => {
    const normalizedProvider = normalizeCalendarProvider(provider);
    const dedupeKey = buildSyncLedgerDedupeKey({
      provider: normalizedProvider,
      appointmentId,
      dedupeFingerprint,
    });

    return prisma.calendarSyncLedger.upsert({
      where: {
        dedupeKey,
      },
      update: {
        externalCalendarId: externalCalendarId || undefined,
        externalEventId: externalEventId || undefined,
        syncStatus: "PENDING",
        conflictDetected: false,
        metadata: mergeAppointmentMetadata(
          parseAppointmentMetadata(metadata),
          {
            provider: normalizedProvider,
          }
        ) as Prisma.InputJsonValue,
      },
      create: {
        businessId,
        appointmentId,
        provider: normalizedProvider,
        externalCalendarId: externalCalendarId || null,
        externalEventId: externalEventId || null,
        syncStatus: "PENDING",
        conflictDetected: false,
        dedupeKey,
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(metadata), {
          provider: normalizedProvider,
        }) as Prisma.InputJsonValue,
      },
    });
  },

  transitionSyncState: async ({
    syncId,
    nextState,
    metadata = null,
    externalEventId = null,
    externalEventVersion = null,
    errorMessage = null,
  }: {
    syncId: string;
    nextState: string;
    metadata?: Record<string, unknown> | null;
    externalEventId?: string | null;
    externalEventVersion?: string | null;
    errorMessage?: string | null;
  }) => {
    const current = await prisma.calendarSyncLedger.findUnique({
      where: {
        id: syncId,
      },
    });

    if (!current) {
      throw new Error("calendar_sync_row_missing");
    }

    if (isTerminalSyncState(current.syncStatus)) {
      return current;
    }

    if (compareSyncState(current.syncStatus, nextState) < 0) {
      return current;
    }

    return prisma.calendarSyncLedger.update({
      where: {
        id: syncId,
      },
      data: {
        syncStatus: nextState as any,
        externalEventId: externalEventId || undefined,
        lastSyncedAt: ["SYNCED", "CANCELLED", "CANCELLED_EXTERNAL"].includes(nextState)
          ? new Date()
          : current.lastSyncedAt || undefined,
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(current.metadata), metadata, {
          externalEventVersion: externalEventVersion || undefined,
          lastError: errorMessage || undefined,
          lastTransitionAt: new Date().toISOString(),
          lastTransitionTo: nextState,
        }) as Prisma.InputJsonValue,
      },
    });
  },

  markSynced: async ({
    syncId,
    externalEventId = null,
    externalEventVersion = null,
    metadata = null,
  }: {
    syncId: string;
    externalEventId?: string | null;
    externalEventVersion?: string | null;
    metadata?: Record<string, unknown> | null;
  }) =>
    prisma.calendarSyncLedger.update({
      where: {
        id: syncId,
      },
      data: {
        syncStatus: "SYNCED",
        conflictDetected: false,
        externalEventId: externalEventId || undefined,
        lastSyncedAt: new Date(),
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(metadata), {
          externalEventVersion: externalEventVersion || undefined,
        }) as Prisma.InputJsonValue,
      },
    }),

  applyExternalSlotBlock: async ({
    businessId,
    provider,
    externalEventId,
    startAt,
    endAt,
    blocked,
    metadata = null,
  }: {
    businessId: string;
    provider: string;
    externalEventId: string;
    startAt: Date;
    endAt: Date;
    blocked: boolean;
    metadata?: Record<string, unknown> | null;
  }) => {
    const slotKey = [
      "external_busy",
      businessId,
      startAt.toISOString(),
      endAt.toISOString(),
    ]
      .join(":")
      .replace(/[^A-Za-z0-9:_-]/g, "_");
    const normalizedProvider = normalizeCalendarProvider(provider);

    if (blocked) {
      await prisma.availabilitySlot.upsert({
        where: {
          slotKey,
        },
        update: {
          blocked: true,
          blackoutReason: `EXTERNAL_BUSY:${normalizedProvider}`,
          metadata: {
            ...(metadata || {}),
            externalBusyBlock: true,
            provider: normalizedProvider,
            externalEventId,
          } as Prisma.InputJsonValue,
        },
        create: {
          businessId,
          slotKey,
          timezone: "UTC",
          startAt,
          endAt,
          capacity: 1,
          reservedCount: 0,
          blocked: true,
          blackoutReason: `EXTERNAL_BUSY:${normalizedProvider}`,
          metadata: {
            ...(metadata || {}),
            externalBusyBlock: true,
            provider: normalizedProvider,
            externalEventId,
          } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    await prisma.availabilitySlot.updateMany({
      where: {
        businessId,
        slotKey,
      },
      data: {
        blocked: false,
        blackoutReason: null,
      },
    });
  },

  reconcileExternalWebhook: async ({
    businessId,
    provider,
    externalEventId,
    externalUpdatedAt,
    externalEventVersion = null,
    cancelled = false,
    startAt = null,
    endAt = null,
    metadata = null,
    dedupeFingerprint,
  }: {
    businessId: string;
    provider: string;
    externalEventId: string;
    externalUpdatedAt: Date;
    externalEventVersion?: string | null;
    cancelled?: boolean;
    startAt?: Date | null;
    endAt?: Date | null;
    metadata?: Record<string, unknown> | null;
    dedupeFingerprint: string;
  }) => {
    const normalizedProvider = normalizeCalendarProvider(provider);
    const incomingVersion =
      String(externalEventVersion || "").trim() || externalUpdatedAt.toISOString();
    const replayKey = buildWebhookReplayFingerprint({
      provider: normalizedProvider,
      externalEventId,
      externalEventVersion: incomingVersion,
      dedupeFingerprint,
    });
    const webhookExternalSyncKey = `sync_from_webhook:${replayKey}`;
    const webhookExternalKey = buildExternalWebhookKey({
      provider: normalizedProvider,
      replayKey,
    });
    const webhookClaim = await claimExternalSyncIdempotency({
      businessId,
      provider: normalizedProvider,
      externalSyncKey: webhookExternalSyncKey,
      externalWebhookKey: webhookExternalKey,
      providerEventVersion: incomingVersion,
      metadata: {
        kind: "WEBHOOK",
        dedupeFingerprint,
        externalEventId,
      },
    });

    if (webhookClaim.state === "REPLAYED") {
      return {
        replayed: true,
        reason: "external_idempotency_replay",
      };
    }

    if (webhookClaim.state === "INFLIGHT") {
      return {
        replayed: true,
        reason: "external_idempotency_inflight",
      };
    }

    const syncRow = await prisma.calendarSyncLedger.findFirst({
      where: {
        businessId,
        provider: normalizedProvider,
        externalEventId,
      },
      include: {
        appointment: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!syncRow || !syncRow.appointment) {
      await markExternalSyncIdempotencyProcessed({
        id: webhookClaim.row.id,
        providerEventVersion: incomingVersion,
        metadata: {
          result: "sync_row_missing",
        },
      }).catch(() => undefined);

      return {
        replayed: false,
        sync: null,
        reason: "sync_row_missing",
      };
    }

    const syncMetadata = parseAppointmentMetadata(syncRow.metadata);
    const lastVersionScore = resolveEventVersionScore(syncMetadata.externalEventVersion);
    const incomingVersionScore = resolveEventVersionScore(incomingVersion);

    if (incomingVersionScore > 0 && incomingVersionScore <= lastVersionScore) {
      await markExternalSyncIdempotencyProcessed({
        id: webhookClaim.row.id,
        providerEventVersion: incomingVersion,
        metadata: {
          result: "webhook_out_of_order",
        },
      }).catch(() => undefined);

      return {
        replayed: true,
        reason: "webhook_out_of_order",
      };
    }

    const appointment = syncRow.appointment;
    const effectiveStartAt = startAt || appointment.startAt || externalUpdatedAt;
    const effectiveEndAt =
      endAt ||
      appointment.endAt ||
      new Date(effectiveStartAt.getTime() + 30 * 60 * 1000);
    const activeManualOverride = await findActiveManualOverride({
      businessId,
      provider: normalizedProvider,
      windowStart: effectiveStartAt,
      windowEnd: effectiveEndAt,
    });
    const conflictInputs = resolveConflictInputFromMetadata(appointment.metadata);
    const conflictResolution = resolveCalendarConflict({
      internalVersion: appointment.updatedAt,
      externalVersion: incomingVersion,
      ownership: conflictInputs.ownership,
      manualOverride: activeManualOverride ? "INTERNAL" : conflictInputs.manualOverride,
      policyPriority: conflictInputs.policyPriority,
    });
    const applyExternal = conflictResolution.winner === "EXTERNAL";
    const hasTimeMutation =
      Boolean(startAt && endAt) &&
      Boolean(appointment.startAt && appointment.endAt) &&
      (appointment.startAt!.getTime() !== startAt!.getTime() ||
        appointment.endAt!.getTime() !== endAt!.getTime());
    const isCancellation = Boolean(cancelled);
    const conflictDetected =
      (hasTimeMutation || isCancellation) && !applyExternal;
    const syncStatus = isCancellation && applyExternal
      ? "CANCELLED"
      : conflictDetected
      ? "CONFLICT"
      : "SYNCED";

    const updated = await prisma.$transaction(async (tx) => {
      let appointmentRow = appointment;

      if (applyExternal) {
        if (isCancellation && !["CANCELLED", "COMPLETED", "NO_SHOW", "EXPIRED"].includes(appointment.status)) {
          appointmentRow = await tx.appointmentLedger.update({
            where: {
              id: appointment.id,
            },
            data: {
              status: "CANCELLED",
              cancelReason: `external_calendar_cancelled:${normalizedProvider}`,
              metadata: mergeAppointmentMetadata(parseAppointmentMetadata(appointment.metadata), {
                externalCalendarUpdate: {
                  provider: normalizedProvider,
                  externalEventId,
                  externalEventVersion: incomingVersion,
                  appliedAt: new Date().toISOString(),
                },
              }) as Prisma.InputJsonValue,
            },
          });
        } else if (hasTimeMutation && startAt && endAt) {
          appointmentRow = await tx.appointmentLedger.update({
            where: {
              id: appointment.id,
            },
            data: {
              status: "RESCHEDULED",
              startAt,
              endAt,
              rescheduleCount: {
                increment: 1,
              },
              metadata: mergeAppointmentMetadata(parseAppointmentMetadata(appointment.metadata), {
                externalCalendarUpdate: {
                  provider: normalizedProvider,
                  externalEventId,
                  externalEventVersion: incomingVersion,
                  appliedAt: new Date().toISOString(),
                },
              }) as Prisma.InputJsonValue,
            },
          });
        }
      }

      const sync = await tx.calendarSyncLedger.update({
        where: {
          id: syncRow.id,
        },
        data: {
          syncStatus: syncStatus as any,
          conflictDetected,
          externalUpdatedAt,
          lastWebhookAt: new Date(),
          cancelledExternallyAt: isCancellation ? externalUpdatedAt : null,
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(syncRow.metadata), {
            provider: normalizedProvider,
            externalEventId,
            externalEventVersion: incomingVersion,
            externalUpdatedAt: externalUpdatedAt.toISOString(),
            dedupeFingerprint,
            conflict: conflictDetected
              ? {
                  winner: conflictResolution.winner,
                  reason: conflictResolution.reason,
                  source: conflictResolution.source,
                }
              : null,
            manualCalendarOverride: activeManualOverride
              ? {
                  id: activeManualOverride.id,
                  reason: activeManualOverride.reason,
                  priority: activeManualOverride.priority,
                  expiresAt: activeManualOverride.expiresAt.toISOString(),
                }
              : null,
            ...metadata,
          }) as Prisma.InputJsonValue,
        },
      });

      await publishAppointmentEvent({
        tx,
        event: "appointment.calendar_sync",
        businessId,
        aggregateId: appointmentRow.id,
        payload: {
          businessId,
          appointmentId: appointmentRow.id,
          appointmentKey: appointmentRow.appointmentKey,
          leadId: appointmentRow.leadId,
          traceId: null,
          provider: normalizedProvider,
          syncStatus,
          externalEventId,
        },
        eventKey: `${appointmentRow.appointmentKey}:calendar:${externalEventId}:${incomingVersion}`,
      });

      return sync;
    });

    await markExternalSyncIdempotencyProcessed({
      id: webhookClaim.row.id,
      providerEventVersion: incomingVersion,
      metadata: {
        result: "webhook_reconciled",
        syncId: updated.id,
        syncStatus,
        conflictDetected,
        resolutionWinner: conflictResolution.winner,
        resolutionReason: conflictResolution.reason,
      },
    }).catch(() => undefined);

    if (startAt && endAt) {
      await (calendarSyncService as any)
        .applyExternalSlotBlock({
          businessId,
          provider: normalizedProvider,
          externalEventId,
          startAt,
          endAt,
          blocked: !cancelled,
          metadata: {
            changeType: cancelled ? "FREE" : "BLOCK",
            externalEventVersion: incomingVersion,
          },
        })
        .catch(() => undefined);
    }

    return {
      replayed: false,
      sync: updated,
      conflictDetected,
      resolution: conflictResolution,
    };
  },

  processProviderSyncFromOutbox: async ({
    outboxId,
    eventType,
    payload,
  }: {
    outboxId: string;
    eventType: string;
    payload: Record<string, any>;
  }) => {
    const normalizedEventType = String(eventType || "").trim();
    const appointmentId =
      String(payload?.payload?.appointmentId || payload?.appointmentId || "").trim() || null;

    if (!appointmentId) {
      return {
        skipped: true,
        reason: "appointment_id_missing",
      };
    }

    const appointment = await prisma.appointmentLedger.findUnique({
      where: {
        id: appointmentId,
      },
    });

    if (!appointment || !appointment.startAt || !appointment.endAt) {
      return {
        skipped: true,
        reason: "appointment_not_syncable",
      };
    }

    const targetProviders = await calendarProviderRouterService.listConnections({
      businessId: appointment.businessId,
      includeInternal: true,
    });
    const providerResults: Array<{
      provider: CalendarProvider;
      syncId: string;
      status: string;
      error?: string;
    }> = [];
    const retryableErrors: unknown[] = [];

    for (const connection of targetProviders) {
      const syncRow = await (calendarSyncService as any).queueSync({
        businessId: appointment.businessId,
        appointmentId: appointment.id,
        provider: connection.provider,
        externalCalendarId: connection.externalCalendarId,
        dedupeFingerprint: outboxId,
        metadata: {
          lastOutboxId: outboxId,
        },
      });
      const syncMetadata = parseAppointmentMetadata(syncRow.metadata);
      const externalSyncKey = buildExternalSyncKey({
        businessId: appointment.businessId,
        provider: connection.provider,
        appointmentId: appointment.id,
        eventType: normalizedEventType,
        outboxId,
      });
      const externalWebhookKey = `sync_job:${externalSyncKey}`;
      const idempotency = await claimExternalSyncIdempotency({
        businessId: appointment.businessId,
        provider: connection.provider,
        externalSyncKey,
        externalWebhookKey,
        providerEventVersion: outboxId,
        metadata: {
          kind: "OUTBOX_SYNC",
          outboxId,
          eventType: normalizedEventType,
          syncId: syncRow.id,
        },
      });

      if (
        syncRow.syncStatus === "SYNCED" &&
        String(syncMetadata.lastOutboxId || "").trim() === outboxId
      ) {
        if (idempotency.state === "CLAIMED") {
          await markExternalSyncIdempotencyProcessed({
            id: idempotency.row.id,
            providerEventVersion:
              String(syncMetadata.externalEventVersion || outboxId).trim() || outboxId,
            metadata: {
              result: "already_synced",
              syncId: syncRow.id,
            },
          }).catch(() => undefined);
        }

        providerResults.push({
          provider: connection.provider,
          syncId: syncRow.id,
          status: "SYNCED",
        });
        continue;
      }

      if (idempotency.state === "REPLAYED") {
        const replayMetadata = parseAppointmentMetadata(idempotency.row.metadata);
        await (calendarSyncService as any).markSynced({
          syncId: syncRow.id,
          externalEventId:
            String(replayMetadata.externalEventId || syncRow.externalEventId || "").trim() ||
            null,
          externalEventVersion:
            String(
              replayMetadata.externalEventVersion || idempotency.row.providerEventVersion || ""
            ).trim() || null,
          metadata: mergeAppointmentMetadata(syncMetadata, {
            replayed: true,
            idempotencyKey: externalSyncKey,
            lastOutboxId: outboxId,
            syncedByEvent: normalizedEventType,
          }) as any,
        });
        providerResults.push({
          provider: connection.provider,
          syncId: syncRow.id,
          status: "SYNCED",
        });
        continue;
      }

      if (idempotency.state === "INFLIGHT") {
        await (calendarSyncService as any).transitionSyncState({
          syncId: syncRow.id,
          nextState: "RETRYING",
          metadata: {
            lastOutboxId: outboxId,
            idempotencyKey: externalSyncKey,
            reason: "idempotency_inflight",
          },
        });
        providerResults.push({
          provider: connection.provider,
          syncId: syncRow.id,
          status: "RETRYING",
          error: "idempotency_inflight",
        });
        retryableErrors.push(new Error("idempotency_inflight"));
        continue;
      }

      const activeManualOverride = await findActiveManualOverride({
        businessId: appointment.businessId,
        provider: connection.provider,
        windowStart: appointment.startAt,
        windowEnd: appointment.endAt,
      });

      if (activeManualOverride) {
        await (calendarSyncService as any).transitionSyncState({
          syncId: syncRow.id,
          nextState: "CANCELLED",
          metadata: {
            lastOutboxId: outboxId,
            eventType: normalizedEventType,
            reason: "manual_override_lock",
            manualCalendarOverride: {
              id: activeManualOverride.id,
              reason: activeManualOverride.reason,
              priority: activeManualOverride.priority,
              expiresAt: activeManualOverride.expiresAt.toISOString(),
            },
          },
        });

        await markExternalSyncIdempotencyProcessed({
          id: idempotency.row.id,
          providerEventVersion: outboxId,
          metadata: {
            result: "manual_override_cancelled",
            syncId: syncRow.id,
          },
        }).catch(() => undefined);

        providerResults.push({
          provider: connection.provider,
          syncId: syncRow.id,
          status: "CANCELLED",
        });
        continue;
      }

      await (calendarSyncService as any).transitionSyncState({
        syncId: syncRow.id,
        nextState: syncRow.syncStatus === "PENDING" ? "SYNCING" : "RETRYING",
        metadata: {
          lastOutboxId: outboxId,
          eventType: normalizedEventType,
          idempotencyKey: externalSyncKey,
        },
      });

      try {
        const eventInput = toCalendarEventInputFromAppointment({
          appointment,
          externalEventId: syncRow.externalEventId || null,
        });
        let result: CalendarProviderOperationResult | null = null;

        if (
          normalizedEventType === "appointment.confirmed" ||
          normalizedEventType === "appointment.requested"
        ) {
          const op = syncRow.externalEventId
            ? calendarProviderRouterService.updateEvent
            : calendarProviderRouterService.createEvent;
          const execute = await op({
            provider: connection.provider,
            businessId: appointment.businessId,
            event: {
              ...eventInput,
              externalEventId: syncRow.externalEventId || null,
            },
          });
          result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
            execute[0]?.value ||
            null) as CalendarProviderOperationResult | null;
        } else if (normalizedEventType === "appointment.rescheduled") {
          const execute = await calendarProviderRouterService.updateEvent({
            provider: connection.provider,
            businessId: appointment.businessId,
            event: {
              ...eventInput,
              externalEventId: syncRow.externalEventId || null,
            },
          });
          result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
            execute[0]?.value ||
            null) as CalendarProviderOperationResult | null;
        } else if (normalizedEventType === "appointment.cancelled") {
          const execute = await calendarProviderRouterService.cancelEvent({
            provider: connection.provider,
            businessId: appointment.businessId,
            event: {
              ...eventInput,
              externalEventId: syncRow.externalEventId || null,
            },
          });
          result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
            execute[0]?.value ||
            null) as CalendarProviderOperationResult | null;
        } else if (normalizedEventType === "appointment.hold_created") {
          const execute = await calendarProviderRouterService.blockSlot({
            provider: connection.provider,
            businessId: appointment.businessId,
            slot: {
              businessId: appointment.businessId,
              slotId: appointment.slotId || null,
              slotKey:
                String(parseAppointmentMetadata(appointment.metadata).slotKey || "").trim() ||
                null,
              startAt: appointment.startAt,
              endAt: appointment.endAt,
              reason: "appointment_hold",
              appointmentId: appointment.id,
            },
          });
          result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
            execute[0]?.value ||
            null) as CalendarProviderOperationResult | null;
        } else if (normalizedEventType === "appointment.expired") {
          const execute = await calendarProviderRouterService.freeSlot({
            provider: connection.provider,
            businessId: appointment.businessId,
            slot: {
              businessId: appointment.businessId,
              slotId: appointment.slotId || null,
              slotKey:
                String(parseAppointmentMetadata(appointment.metadata).slotKey || "").trim() ||
                null,
              startAt: appointment.startAt,
              endAt: appointment.endAt,
              reason: "appointment_expired",
              appointmentId: appointment.id,
              metadata: {
                externalEventId: syncRow.externalEventId || null,
              },
            },
          });
          result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
            execute[0]?.value ||
            null) as CalendarProviderOperationResult | null;
        } else if (normalizedEventType === "calendar.sync.requested") {
          const operation = String(payload.operation || "").trim().toUpperCase();
          if (operation === "CANCEL") {
            const execute = await calendarProviderRouterService.cancelEvent({
              provider: connection.provider,
              businessId: appointment.businessId,
              event: {
                ...eventInput,
                externalEventId: syncRow.externalEventId || null,
              },
            });
            result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
              execute[0]?.value ||
              null) as CalendarProviderOperationResult | null;
          } else if (operation === "BLOCK_SLOT") {
            const execute = await calendarProviderRouterService.blockSlot({
              provider: connection.provider,
              businessId: appointment.businessId,
              slot: {
                businessId: appointment.businessId,
                slotId: String(payload.slotId || appointment.slotId || "").trim() || null,
                slotKey: String(payload.slotKey || "").trim() || null,
                startAt: appointment.startAt,
                endAt: appointment.endAt,
                reason: String(payload.reason || "calendar_sync_block").trim(),
                appointmentId: appointment.id,
              },
            });
            result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
              execute[0]?.value ||
              null) as CalendarProviderOperationResult | null;
          } else if (operation === "FREE_SLOT") {
            const execute = await calendarProviderRouterService.freeSlot({
              provider: connection.provider,
              businessId: appointment.businessId,
              slot: {
                businessId: appointment.businessId,
                slotId: String(payload.slotId || appointment.slotId || "").trim() || null,
                slotKey: String(payload.slotKey || "").trim() || null,
                startAt: appointment.startAt,
                endAt: appointment.endAt,
                reason: String(payload.reason || "calendar_sync_free").trim(),
                appointmentId: appointment.id,
                metadata: {
                  externalEventId: syncRow.externalEventId || null,
                },
              },
            });
            result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
              execute[0]?.value ||
              null) as CalendarProviderOperationResult | null;
          } else {
            const execute = await calendarProviderRouterService.updateEvent({
              provider: connection.provider,
              businessId: appointment.businessId,
              event: {
                ...eventInput,
                externalEventId: syncRow.externalEventId || null,
              },
            });
            result = (execute.find((row: any) => row.connectionId === connection.id)?.value ||
              execute[0]?.value ||
              null) as CalendarProviderOperationResult | null;
          }
        } else {
          providerResults.push({
            provider: connection.provider,
            syncId: syncRow.id,
            status: "SKIPPED",
          });
          continue;
        }

        const normalized = normalizeProviderResult(result || undefined);
        const resolvedExternalEventId = normalized.externalEventId || syncRow.externalEventId;
        const resolvedExternalEventVersion = normalized.externalEventVersion || null;
        await (calendarSyncService as any).markSynced({
          syncId: syncRow.id,
          externalEventId: resolvedExternalEventId,
          externalEventVersion: resolvedExternalEventVersion,
          metadata: mergeAppointmentMetadata(syncMetadata, {
            ...normalized.metadata,
            lastOutboxId: outboxId,
            syncedByEvent: normalizedEventType,
            idempotencyKey: externalSyncKey,
          }) as any,
        });

        await markExternalSyncIdempotencyProcessed({
          id: idempotency.row.id,
          providerEventVersion: String(resolvedExternalEventVersion || outboxId).trim() || outboxId,
          metadata: {
            result: "synced",
            syncId: syncRow.id,
            externalEventId: resolvedExternalEventId || null,
            externalEventVersion: resolvedExternalEventVersion,
          },
        }).catch(() => undefined);

        providerResults.push({
          provider: connection.provider,
          syncId: syncRow.id,
          status: "SYNCED",
        });
      } catch (error) {
        const failureState = mapErrorToSyncStatus(error);
        await (calendarSyncService as any).transitionSyncState({
          syncId: syncRow.id,
          nextState: failureState,
          errorMessage: String((error as any)?.message || error || "calendar_sync_failed"),
          metadata: {
            lastOutboxId: outboxId,
            failedEventType: normalizedEventType,
            idempotencyKey: externalSyncKey,
          },
        });

        providerResults.push({
          provider: connection.provider,
          syncId: syncRow.id,
          status: failureState,
          error: String((error as any)?.message || error || "calendar_sync_failed"),
        });

        if (isRetryableProviderError(error)) {
          retryableErrors.push(error);
        }
      }
    }

    if (retryableErrors.length) {
      throw retryableErrors[0];
    }

    return {
      skipped: false,
      providerResults,
    };
  },

  refreshProviderHealth: async ({
    now = new Date(),
    watchCallbackUrl,
  }: {
    now?: Date;
    watchCallbackUrl: string;
  }) => {
    const expiringSubscriptions = await prisma.calendarConnection.findMany({
      where: {
        status: {
          not: "DISCONNECTED",
        },
        provider: {
          in: ["GOOGLE", "OUTLOOK"],
        },
        watchExpiresAt: {
          lte: new Date(now.getTime() + 6 * 60 * 60 * 1000),
        },
      },
      take: 200,
    });
    const tokenRefreshCutoff = new Date(now.getTime() + 5 * 60 * 1000);
    const tokenConnections = await prisma.calendarConnection.findMany({
      where: {
        status: {
          not: "DISCONNECTED",
        },
        provider: {
          in: ["GOOGLE", "OUTLOOK"],
        },
      },
      take: 400,
      orderBy: {
        updatedAt: "desc",
      },
    });
    const businessIds = Array.from(
      new Set(tokenConnections.map((row) => String(row.businessId || "").trim()).filter(Boolean))
    );
    const knownCredentials = businessIds.length
      ? await prisma.calendarProviderCredential.findMany({
          where: {
            businessId: {
              in: businessIds,
            },
            provider: {
              in: ["GOOGLE", "OUTLOOK"],
            },
          },
          take: 400,
        })
      : [];
    const credentialMap = new Map<string, any>(
      knownCredentials.map((row) => [`${row.businessId}:${row.provider}`, row])
    );

    const refreshedSubscriptions: string[] = [];
    const refreshedTokens: string[] = [];

    for (const connection of expiringSubscriptions) {
      try {
        await publishCalendarProviderEvent({
          businessId: connection.businessId,
          provider: connection.provider,
          connectionId: connection.id,
          eventType: "calendar.provider.subscription_expiring",
          payload: {
            watchExpiresAt: connection.watchExpiresAt?.toISOString() || null,
          },
          dedupeSuffix: `${connection.watchExpiresAt?.toISOString() || "none"}`,
        });

        const watchResults = await calendarProviderRouterService.refreshWatchSubscription({
          provider: normalizeCalendarProvider(connection.provider),
          businessId: connection.businessId,
          watch: {
            businessId: connection.businessId,
            callbackUrl: watchCallbackUrl,
            channelId: connection.watchChannelId,
            expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000),
          },
        });
        const renewed = watchResults.find((row: any) => row.connectionId === connection.id);

        if (renewed?.value) {
          refreshedSubscriptions.push(connection.id);
          await publishCalendarProviderEvent({
            businessId: connection.businessId,
            provider: connection.provider,
            connectionId: connection.id,
            eventType: "calendar.provider.subscription_renewed",
            payload: {
              watchExpiresAt: renewed.value.watchExpiresAt
                ? new Date(renewed.value.watchExpiresAt).toISOString()
                : null,
            },
            dedupeSuffix: String(renewed.value.watchExpiresAt || "").trim() || "renewed",
          });
        }
      } catch (error) {
        await prisma.calendarConnection
          .update({
            where: {
              id: connection.id,
            },
            data: {
              status: "DEGRADED",
              metadata: mergeAppointmentMetadata(parseAppointmentMetadata(connection.metadata), {
                watchRefreshError: String((error as any)?.message || error || "watch_refresh_failed"),
                watchRefreshFailedAt: new Date().toISOString(),
              }) as Prisma.InputJsonValue,
            },
          })
          .catch(() => undefined);
      }
    }

    for (const connection of tokenConnections) {
      const providerKey = normalizeCalendarProvider(connection.provider);
      const key = `${connection.businessId}:${providerKey}`;

      if (credentialMap.has(key)) {
        continue;
      }

      const accessTokenRef = String(connection.accessToken || "").trim();
      const refreshTokenRef = String(connection.refreshToken || "").trim();

      if (!accessTokenRef || !refreshTokenRef) {
        continue;
      }

      try {
        const seededCredential = await prisma.calendarProviderCredential.create({
          data: {
            businessId: connection.businessId,
            provider: providerKey,
            accessTokenRef,
            refreshTokenRef,
            scope: connection.scopes || null,
            expiryDate: connection.expiryDate || null,
            revokedAt: connection.permissionRevokedAt || null,
            status: String(connection.status || "ACTIVE").trim().toUpperCase(),
            providerMetadata: (connection.metadata || null) as Prisma.InputJsonValue,
          },
        });
        credentialMap.set(key, seededCredential);
      } catch (error) {
        if (!isUniqueError(error)) {
          continue;
        }

        const existing = await prisma.calendarProviderCredential
          .findUnique({
            where: {
              businessId_provider: {
                businessId: connection.businessId,
                provider: providerKey,
              },
            },
          })
          .catch(() => null);

        if (existing) {
          credentialMap.set(key, existing);
        }
      }
    }

    const expiringCredentials = Array.from(credentialMap.values()).filter((credential) => {
      const status = String(credential.status || "ACTIVE").trim().toUpperCase();
      const shouldRefreshByTime =
        credential.expiryDate instanceof Date && credential.expiryDate <= tokenRefreshCutoff;
      const shouldRefreshByStatus = status === "AUTH_FAILED";

      return !credential.revokedAt && status !== "DISCONNECTED" && (shouldRefreshByTime || shouldRefreshByStatus);
    });

    const connectionByProviderKey = new Map<string, any>();
    for (const connection of tokenConnections) {
      connectionByProviderKey.set(
        `${connection.businessId}:${normalizeCalendarProvider(connection.provider)}`,
        connection
      );
    }

    for (const credential of expiringCredentials) {
      const normalizedProvider = normalizeCalendarProvider(credential.provider);
      const connection =
        connectionByProviderKey.get(`${credential.businessId}:${normalizedProvider}`) || null;
      const connectionId = connection?.id || `credential:${credential.id}`;

      try {
        const refreshToken = normalizeToken(credential.refreshTokenRef);
        if (!refreshToken) {
          throw new Error("refresh_token_missing");
        }

        const refreshed =
          normalizedProvider === "GOOGLE"
            ? await refreshGoogleAccessToken({
                refreshToken,
              })
            : await refreshOutlookAccessToken({
                refreshToken,
              });
        const encryptedAccessToken = encrypt(String((refreshed as any).access_token || ""));
        const nextRefreshToken =
          normalizedProvider === "OUTLOOK" && String((refreshed as any).refresh_token || "").trim()
            ? encrypt(String((refreshed as any).refresh_token || ""))
            : credential.refreshTokenRef;
        const nextExpiry = new Date(
          now.getTime() + Math.max(300, Number((refreshed as any).expires_in || 3600)) * 1000
        );

        await prisma.calendarProviderCredential.update({
          where: {
            id: credential.id,
          },
          data: {
            accessTokenRef: encryptedAccessToken,
            refreshTokenRef: nextRefreshToken,
            expiryDate: nextExpiry,
            revokedAt: null,
            status: "ACTIVE",
            providerMetadata: mergeAppointmentMetadata(
              parseAppointmentMetadata(credential.providerMetadata),
              {
                tokenRefreshedAt: now.toISOString(),
              }
            ) as Prisma.InputJsonValue,
          },
        });

        if (connection) {
          await prisma.calendarConnection
            .update({
              where: {
                id: connection.id,
              },
              data: {
                accessToken: encryptedAccessToken,
                refreshToken: nextRefreshToken,
                expiryDate: nextExpiry,
                authFailedAt: null,
                permissionRevokedAt: null,
                status: "ACTIVE",
              },
            })
            .catch(() => undefined);
        }

        refreshedTokens.push(connectionId);
      } catch (error) {
        const errorMessage = String((error as any)?.message || error || "token_refresh_failed");
        const revoked =
          /invalid_grant|invalid_client|revoked|permission|consent/i.test(errorMessage);
        await prisma.calendarProviderCredential
          .update({
            where: {
              id: credential.id,
            },
            data: {
              status: "AUTH_FAILED",
              revokedAt: revoked ? new Date() : credential.revokedAt,
              providerMetadata: mergeAppointmentMetadata(
                parseAppointmentMetadata(credential.providerMetadata),
                {
                  authError: errorMessage,
                  authFailedAt: new Date().toISOString(),
                  reauthorizationNeeded: revoked,
                }
              ) as Prisma.InputJsonValue,
            },
          })
          .catch(() => undefined);

        if (connection) {
          await prisma.calendarConnection
            .update({
              where: {
                id: connection.id,
              },
              data: {
                status: "AUTH_FAILED",
                authFailedAt: new Date(),
                permissionRevokedAt: revoked ? new Date() : connection.permissionRevokedAt,
                metadata: mergeAppointmentMetadata(parseAppointmentMetadata(connection.metadata), {
                  authError: errorMessage,
                  authFailedAt: new Date().toISOString(),
                  reauthorizationNeeded: revoked,
                }) as Prisma.InputJsonValue,
              },
            })
            .catch(() => undefined);
        }

        await publishCalendarProviderEvent({
          businessId: credential.businessId,
          provider: normalizedProvider,
          connectionId,
          eventType: "calendar.provider.auth_failed",
          payload: {
            reason: errorMessage,
            reauthorizationNeeded: revoked,
          },
          dedupeSuffix: new Date().toISOString().slice(0, 16),
        }).catch(() => undefined);
      }
    }

    return {
      refreshedSubscriptions,
      refreshedTokens,
    };
  },
});

export const calendarSyncService = createCalendarSyncService();
