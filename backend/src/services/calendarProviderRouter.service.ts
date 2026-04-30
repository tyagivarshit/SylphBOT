import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { decrypt } from "../utils/encrypt";
import { toRecord } from "./reception.shared";
import {
  type CalendarBusyWindow,
  type CalendarConnectionRecord,
  type CalendarEventMutationInput,
  type CalendarProvider,
  type CalendarProviderAdapter,
  type CalendarProviderOperationResult,
  type CalendarSlotMutationInput,
  type CalendarSyncMetadataInput,
  type CalendarWatchInput,
  normalizeCalendarProvider,
} from "./calendarProvider.contract";
import { googleCalendarAdapterService } from "./googleCalendarAdapter.service";
import { outlookCalendarAdapterService } from "./outlookCalendarAdapter.service";

const PROVIDER_PRIORITY: Record<CalendarProvider, number> = {
  INTERNAL: 100,
  GOOGLE: 80,
  OUTLOOK: 70,
};

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

type CredentialAuthorityRow = {
  id: string;
  businessId: string;
  provider: string;
  accessTokenRef: string;
  refreshTokenRef: string;
  scope: string | null;
  expiryDate: Date | null;
  revokedAt: Date | null;
  status: string;
  providerMetadata: any;
};

const toConnectionRecord = ({
  row,
  credential,
}: {
  row: any;
  credential?: CredentialAuthorityRow | null;
}): CalendarConnectionRecord => ({
  id: row.id,
  businessId: row.businessId,
  credentialId: credential?.id || null,
  provider: normalizeCalendarProvider(row.provider),
  accessToken: normalizeToken(credential?.accessTokenRef || ""),
  refreshToken: normalizeToken(credential?.refreshTokenRef || ""),
  expiryDate: credential?.expiryDate || null,
  externalCalendarId: row.externalCalendarId || null,
  providerAccountId: row.providerAccountId || null,
  status: String(credential?.status || row.status || "ACTIVE").trim().toUpperCase(),
  scopes: credential?.scope || row.scopes || null,
  watchChannelId: row.watchChannelId || null,
  watchResourceId: row.watchResourceId || null,
  watchExpiresAt: row.watchExpiresAt || null,
  lastWatchRenewedAt: row.lastWatchRenewedAt || null,
  authFailedAt:
    String(credential?.status || "").toUpperCase() === "AUTH_FAILED"
      ? credential?.expiryDate || row.authFailedAt || null
      : row.authFailedAt || null,
  permissionRevokedAt: credential?.revokedAt || row.permissionRevokedAt || null,
  lastSyncedAt: row.lastSyncedAt || null,
  metadata: {
    ...(row.metadata ? toRecord(row.metadata) : {}),
    ...(credential?.providerMetadata ? toRecord(credential.providerMetadata) : {}),
  },
});

const normalizeBusyWindow = (window: CalendarBusyWindow) => ({
  ...window,
  startAt: new Date(window.startAt),
  endAt: new Date(window.endAt),
  priority: Number.isFinite(Number(window.priority))
    ? Number(window.priority)
    : PROVIDER_PRIORITY[window.provider] || 50,
});

const mergeBusyWindows = (windows: CalendarBusyWindow[]) => {
  const normalized = windows
    .map(normalizeBusyWindow)
    .filter(
      (window) =>
        !Number.isNaN(window.startAt.getTime()) &&
        !Number.isNaN(window.endAt.getTime()) &&
        window.endAt > window.startAt
    )
    .sort((left, right) => {
      const delta = left.startAt.getTime() - right.startAt.getTime();

      if (delta !== 0) {
        return delta;
      }

      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      return left.provider.localeCompare(right.provider);
    });
  const merged: CalendarBusyWindow[] = [];

  for (const next of normalized) {
    const current = merged[merged.length - 1];

    if (!current) {
      merged.push(next);
      continue;
    }

    if (next.startAt > current.endAt) {
      merged.push(next);
      continue;
    }

    current.endAt = new Date(
      Math.max(current.endAt.getTime(), next.endAt.getTime())
    );

    if (next.priority > current.priority) {
      current.provider = next.provider;
      current.priority = next.priority;
    }

    const sourceProviders = Array.from(
      new Set([
        ...(Array.isArray(current.metadata?.providers)
          ? (current.metadata?.providers as string[])
          : [current.provider]),
        next.provider,
      ])
    );

    current.metadata = {
      ...(current.metadata || {}),
      providers: sourceProviders.sort(),
      merged: true,
    };
  }

  return merged;
};

const internalCalendarAdapterService: CalendarProviderAdapter = {
  provider: "INTERNAL",

  createEvent: async ({ event }) => ({
    ok: true,
    provider: "INTERNAL",
    externalEventId: `internal:${event.appointmentId}`,
    externalEventVersion: new Date().toISOString(),
  }),

  updateEvent: async ({ event }) => ({
    ok: true,
    provider: "INTERNAL",
    externalEventId: event.externalEventId || `internal:${event.appointmentId}`,
    externalEventVersion: new Date().toISOString(),
  }),

  cancelEvent: async ({ event }) => ({
    ok: true,
    provider: "INTERNAL",
    externalEventId: event.externalEventId || `internal:${event.appointmentId}`,
    externalEventVersion: new Date().toISOString(),
  }),

  blockSlot: async ({ slot }) => {
    const slotKey =
      String(slot.slotKey || "").trim() ||
      [
        "busy",
        slot.businessId,
        slot.startAt.toISOString(),
        slot.endAt.toISOString(),
      ]
        .join(":")
        .replace(/[^A-Za-z0-9:_-]/g, "_");

    await prisma.availabilitySlot.upsert({
      where: {
        slotKey,
      },
      update: {
        blocked: true,
        blackoutReason: slot.reason || "EXTERNAL_BUSY",
        metadata: {
          ...(slot.metadata || {}),
          externalBusyBlock: true,
          provider: "INTERNAL",
        } as Prisma.InputJsonValue,
      },
      create: {
        businessId: slot.businessId,
        slotKey,
        timezone: "UTC",
        startAt: slot.startAt,
        endAt: slot.endAt,
        capacity: 1,
        reservedCount: 0,
        blocked: true,
        blackoutReason: slot.reason || "EXTERNAL_BUSY",
        metadata: {
          ...(slot.metadata || {}),
          externalBusyBlock: true,
          provider: "INTERNAL",
        } as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      provider: "INTERNAL",
      externalEventVersion: new Date().toISOString(),
    };
  },

  freeSlot: async ({ slot }) => {
    if (slot.slotKey) {
      await prisma.availabilitySlot
        .updateMany({
          where: {
            businessId: slot.businessId,
            slotKey: slot.slotKey,
          },
          data: {
            blocked: false,
            blackoutReason: null,
          },
        })
        .catch(() => undefined);
    }

    return {
      ok: true,
      provider: "INTERNAL",
      externalEventVersion: new Date().toISOString(),
    };
  },

  fetchAvailability: async ({ request }) => {
    const [appointments, blockedSlots] = await Promise.all([
      prisma.appointmentLedger.findMany({
        where: {
          businessId: request.businessId,
          status: {
            in: [
              "HOLD",
              "CONFIRMED",
              "RESCHEDULED",
              "REMINDER_SENT",
              "CHECKED_IN",
              "LATE_JOIN",
              "IN_PROGRESS",
            ],
          },
          startAt: {
            lt: request.windowEnd,
          },
          endAt: {
            gt: request.windowStart,
          },
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
        },
      }),
      prisma.availabilitySlot.findMany({
        where: {
          businessId: request.businessId,
          blocked: true,
          startAt: {
            lt: request.windowEnd,
          },
          endAt: {
            gt: request.windowStart,
          },
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          blackoutReason: true,
        },
      }),
    ]);

    const appointmentWindows = appointments
      .filter((row) => row.startAt && row.endAt)
      .map((row) => ({
        startAt: row.startAt!,
        endAt: row.endAt!,
        provider: "INTERNAL" as const,
        priority: PROVIDER_PRIORITY.INTERNAL,
        externalEventId: `internal:${row.id}`,
        metadata: {
          source: "appointment_ledger",
        },
      }));
    const blockedWindows = blockedSlots.map((row) => ({
      startAt: row.startAt,
      endAt: row.endAt,
      provider: "INTERNAL" as const,
      priority: PROVIDER_PRIORITY.INTERNAL,
      externalEventId: `block:${row.id}`,
      metadata: {
        source: "availability_slot",
        blackoutReason: row.blackoutReason || null,
      },
    }));

    return [...appointmentWindows, ...blockedWindows];
  },

  syncMetadata: async ({ metadata }) => ({
    ok: true,
    provider: "INTERNAL",
    metadata: {
      syncedAt: new Date().toISOString(),
      ...metadata.metadata,
    },
  }),

  watchSubscription: async () => ({
    ok: true,
    provider: "INTERNAL",
    watchChannelId: null,
    watchResourceId: null,
    watchExpiresAt: null,
    metadata: {
      noop: true,
    },
  }),

  refreshWatchSubscription: async () => ({
    ok: true,
    provider: "INTERNAL",
    watchChannelId: null,
    watchResourceId: null,
    watchExpiresAt: null,
    metadata: {
      noop: true,
    },
  }),
};

const adapterMap: Record<CalendarProvider, CalendarProviderAdapter> = {
  GOOGLE: googleCalendarAdapterService,
  OUTLOOK: outlookCalendarAdapterService,
  INTERNAL: internalCalendarAdapterService,
};

const resolveAdapter = (provider: CalendarProvider) =>
  adapterMap[provider] || internalCalendarAdapterService;

const ensureCredentialForConnection = async (connection: any) => {
  const normalizedProvider = normalizeCalendarProvider(connection.provider);

  if (normalizedProvider === "INTERNAL") {
    return null;
  }

  const existing = await prisma.calendarProviderCredential.findUnique({
    where: {
      businessId_provider: {
        businessId: connection.businessId,
        provider: normalizedProvider,
      },
    },
  });

  if (existing) {
    return existing;
  }

  const accessTokenRef = String(connection.accessToken || "").trim();
  const refreshTokenRef = String(connection.refreshToken || "").trim();

  if (!accessTokenRef || !refreshTokenRef) {
    return null;
  }

  return prisma.calendarProviderCredential.create({
    data: {
      businessId: connection.businessId,
      provider: normalizedProvider,
      accessTokenRef,
      refreshTokenRef,
      scope: connection.scopes || null,
      expiryDate: connection.expiryDate || null,
      revokedAt: connection.permissionRevokedAt || null,
      status: String(connection.status || "ACTIVE").trim().toUpperCase(),
      providerMetadata: (connection.metadata || null) as Prisma.InputJsonValue,
    },
  });
};

const getConnectedProviders = async ({
  businessId,
  provider,
  includeInternal = true,
}: {
  businessId: string;
  provider?: CalendarProvider | null;
  includeInternal?: boolean;
}) => {
  const normalizedProvider = provider ? normalizeCalendarProvider(provider) : null;
  const rows = await prisma.calendarConnection.findMany({
    where: {
      businessId,
      status: {
        not: "DISCONNECTED",
      },
      ...(normalizedProvider && normalizedProvider !== "INTERNAL"
        ? {
            provider: normalizedProvider,
          }
        : {}),
    },
    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });
  const providers = Array.from(
    new Set(
      rows
        .map((row) => normalizeCalendarProvider(row.provider))
        .filter((value) => value !== "INTERNAL")
    )
  );
  const existingCredentials = await prisma.calendarProviderCredential.findMany({
    where: {
      businessId,
      provider: {
        in: providers,
      },
    },
  });
  const credentialMap = new Map<string, CredentialAuthorityRow>(
    existingCredentials.map((row) => [String(row.provider).trim().toUpperCase(), row])
  );

  for (const row of rows) {
    const providerKey = String(normalizeCalendarProvider(row.provider)).trim().toUpperCase();

    if (providerKey === "INTERNAL" || credentialMap.has(providerKey)) {
      continue;
    }

    const seeded = await ensureCredentialForConnection(row).catch(() => null);

    if (seeded) {
      credentialMap.set(providerKey, seeded as unknown as CredentialAuthorityRow);
    }
  }

  const connections = rows
    .map((row) =>
      toConnectionRecord({
        row,
        credential:
          credentialMap.get(String(normalizeCalendarProvider(row.provider)).trim().toUpperCase()) ||
          null,
      })
    )
    .filter((row) => row.status !== "DISCONNECTED" && row.accessToken && row.refreshToken);

  if (includeInternal && (!normalizedProvider || normalizedProvider === "INTERNAL")) {
    connections.push({
      id: `internal:${businessId}`,
      businessId,
      credentialId: null,
      provider: "INTERNAL",
      accessToken: "",
      refreshToken: "",
      expiryDate: null,
      externalCalendarId: null,
      providerAccountId: null,
      status: "ACTIVE",
      scopes: null,
      watchChannelId: null,
      watchResourceId: null,
      watchExpiresAt: null,
      lastWatchRenewedAt: null,
      authFailedAt: null,
      permissionRevokedAt: null,
      lastSyncedAt: null,
      metadata: {
        internal: true,
      },
    });
  }

  return connections;
};

const updateConnectionWatchState = async ({
  connection,
  result,
  action,
}: {
  connection: CalendarConnectionRecord;
  result: CalendarProviderOperationResult;
  action: "watch" | "refresh";
}) => {
  const connectionId = String(connection.id || "").trim();

  if (connectionId.startsWith("internal:")) {
    return;
  }

  await prisma.calendarConnection
    .update({
      where: {
        id: connectionId,
      },
      data: {
        watchChannelId: result.watchChannelId || undefined,
        watchResourceId: result.watchResourceId || undefined,
        watchExpiresAt: result.watchExpiresAt || undefined,
        lastWatchRenewedAt: new Date(),
        status: "ACTIVE",
        authFailedAt: null,
        metadata: {
          ...(result.metadata || {}),
          watchAction: action,
          watchUpdatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => undefined);

  await prisma.calendarProviderCredential
    .updateMany({
      where: {
        ...(connection.credentialId
          ? {
              id: connection.credentialId,
            }
          : {
              businessId: connection.businessId,
              provider: connection.provider,
            }),
      },
      data: {
        status: "ACTIVE",
        revokedAt: null,
      },
    })
    .catch(() => undefined);
};

const executeAcrossConnections = async <T>(input: {
  businessId: string;
  provider?: CalendarProvider | null;
  includeInternal?: boolean;
  run: (args: {
    adapter: CalendarProviderAdapter;
    connection: CalendarConnectionRecord;
  }) => Promise<T>;
}) => {
  const connections = await getConnectedProviders({
    businessId: input.businessId,
    provider: input.provider || null,
    includeInternal: input.includeInternal ?? true,
  });
  const results: Array<{
    provider: CalendarProvider;
    connectionId: string;
    connection: CalendarConnectionRecord;
    value?: T;
    error?: unknown;
  }> = [];

  for (const connection of connections) {
    const adapter = resolveAdapter(connection.provider);

    try {
      const value = await input.run({
        adapter,
        connection,
      });
      results.push({
        provider: connection.provider,
        connectionId: connection.id,
        connection,
        value,
      });
    } catch (error) {
      results.push({
        provider: connection.provider,
        connectionId: connection.id,
        connection,
        error,
      });
    }
  }

  return results;
};

export const calendarProviderRouterService = {
  getProviderPriority: (provider: CalendarProvider) =>
    PROVIDER_PRIORITY[provider] || 50,

  listConnections: getConnectedProviders,

  createEvent: async ({
    provider,
    businessId,
    event,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    event: CalendarEventMutationInput;
  }) =>
    executeAcrossConnections({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.createEvent({
          connection,
          event,
        }),
    }),

  updateEvent: async ({
    provider,
    businessId,
    event,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    event: CalendarEventMutationInput;
  }) =>
    executeAcrossConnections({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.updateEvent({
          connection,
          event,
        }),
    }),

  cancelEvent: async ({
    provider,
    businessId,
    event,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    event: CalendarEventMutationInput;
  }) =>
    executeAcrossConnections({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.cancelEvent({
          connection,
          event,
        }),
    }),

  blockSlot: async ({
    provider,
    businessId,
    slot,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    slot: CalendarSlotMutationInput;
  }) =>
    executeAcrossConnections({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.blockSlot({
          connection,
          slot,
        }),
    }),

  freeSlot: async ({
    provider,
    businessId,
    slot,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    slot: CalendarSlotMutationInput;
  }) =>
    executeAcrossConnections({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.freeSlot({
          connection,
          slot,
        }),
    }),

  fetchAvailability: async ({
    provider,
    businessId,
    request,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    request: {
      businessId: string;
      windowStart: Date;
      windowEnd: Date;
      timezone?: string | null;
      humanId?: string | null;
    };
  }) => {
    const results = await executeAcrossConnections<CalendarBusyWindow[]>({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.fetchAvailability({
          connection,
          request,
        }),
    });

    const windows = results
      .filter((row) => Array.isArray(row.value))
      .flatMap((row) => row.value || [])
      .map((window) => ({
        ...window,
        priority:
          Number(window.priority || 0) ||
          PROVIDER_PRIORITY[window.provider] ||
          PROVIDER_PRIORITY.INTERNAL,
      }));

    return mergeBusyWindows(windows);
  },

  syncMetadata: async ({
    provider,
    businessId,
    metadata,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    metadata: CalendarSyncMetadataInput;
  }) =>
    executeAcrossConnections({
      businessId,
      provider: provider || null,
      run: ({ adapter, connection }) =>
        adapter.syncMetadata({
          connection,
          metadata,
        }),
    }),

  watchSubscription: async ({
    provider,
    businessId,
    watch,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    watch: CalendarWatchInput;
  }) => {
    const results = await executeAcrossConnections({
      businessId,
      provider: provider || null,
      includeInternal: false,
      run: ({ adapter, connection }) =>
        adapter.watchSubscription({
          connection,
          watch,
        }),
    });

    for (const row of results) {
      if (row.value) {
        await updateConnectionWatchState({
          connection: row.connection,
          result: row.value as CalendarProviderOperationResult,
          action: "watch",
        });
      }
    }

    return results;
  },

  refreshWatchSubscription: async ({
    provider,
    businessId,
    watch,
  }: {
    provider?: CalendarProvider | null;
    businessId: string;
    watch: CalendarWatchInput;
  }) => {
    const results = await executeAcrossConnections({
      businessId,
      provider: provider || null,
      includeInternal: false,
      run: ({ adapter, connection }) =>
        adapter.refreshWatchSubscription({
          connection,
          watch,
        }),
    });

    for (const row of results) {
      if (row.value) {
        await updateConnectionWatchState({
          connection: row.connection,
          result: row.value as CalendarProviderOperationResult,
          action: "refresh",
        });
      }
    }

    return results;
  },
};

export type CalendarProviderRouterService = typeof calendarProviderRouterService;
