import axios from "axios";
import crypto from "crypto";
import {
  type CalendarProviderAdapter,
  type CalendarProviderOperationResult,
  classifyProviderError,
} from "./calendarProvider.contract";
import { toRecord } from "./reception.shared";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const resolveCalendarId = (connection: any) =>
  String(
    connection.externalCalendarId ||
      toRecord(connection.metadata).externalCalendarId ||
      "primary"
  ).trim() || "primary";

const buildGoogleEventPayload = (event: {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  attendees?: Array<{ email: string; name?: string | null; optional?: boolean }>;
  location?: string | null;
  meetingJoinUrl?: string | null;
}) => ({
  summary: event.title,
  description: [
    event.description || "",
    event.meetingJoinUrl ? `Join: ${event.meetingJoinUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n"),
  location: event.location || undefined,
  start: {
    dateTime: event.startAt.toISOString(),
    timeZone: event.timezone || "UTC",
  },
  end: {
    dateTime: event.endAt.toISOString(),
    timeZone: event.timezone || "UTC",
  },
  attendees: (event.attendees || []).map((item) => ({
    email: item.email,
    displayName: item.name || undefined,
    optional: Boolean(item.optional),
  })),
  reminders: {
    useDefault: true,
  },
});

const asProviderResult = (input: {
  externalEventId?: string | null;
  externalEventVersion?: string | null;
  watchChannelId?: string | null;
  watchResourceId?: string | null;
  watchExpiresAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}): CalendarProviderOperationResult => ({
  ok: true,
  provider: "GOOGLE",
  externalEventId: input.externalEventId || null,
  externalEventVersion: input.externalEventVersion || null,
  watchChannelId: input.watchChannelId || null,
  watchResourceId: input.watchResourceId || null,
  watchExpiresAt: input.watchExpiresAt || null,
  metadata: input.metadata || null,
});

const createHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export const googleCalendarAdapterService: CalendarProviderAdapter = {
  provider: "GOOGLE",

  createEvent: async ({ connection, event }) => {
    try {
      const calendarId = encodeURIComponent(resolveCalendarId(connection));
      const response = await axios.post(
        `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`,
        buildGoogleEventPayload(event),
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        externalEventId: body.id || null,
        externalEventVersion: body.etag || body.updated || null,
        metadata: {
          providerStatus: body.status || null,
        },
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "GOOGLE",
        error,
      });
    }
  },

  updateEvent: async ({ connection, event }) => {
    if (!event.externalEventId) {
      return googleCalendarAdapterService.createEvent({
        connection,
        event,
      });
    }

    try {
      const calendarId = encodeURIComponent(resolveCalendarId(connection));
      const response = await axios.patch(
        `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(
          event.externalEventId
        )}`,
        buildGoogleEventPayload(event),
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        externalEventId: body.id || event.externalEventId,
        externalEventVersion: body.etag || body.updated || null,
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "GOOGLE",
        error,
      });
    }
  },

  cancelEvent: async ({ connection, event }) => {
    if (!event.externalEventId) {
      return asProviderResult({});
    }

    try {
      const calendarId = encodeURIComponent(resolveCalendarId(connection));
      await axios.delete(
        `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(
          event.externalEventId
        )}`,
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );

      return asProviderResult({
        externalEventId: event.externalEventId,
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "GOOGLE",
        error,
      });
    }
  },

  blockSlot: async ({ connection, slot }) =>
    googleCalendarAdapterService.createEvent({
      connection,
      event: {
        businessId: slot.businessId,
        appointmentId: slot.appointmentId || `slot_${slot.slotId || "unknown"}`,
        appointmentKey: slot.slotKey || slot.slotId || "slot_block",
        title: "Busy - Blocked",
        description: slot.reason || "Calendar blocked by Automexia",
        startAt: slot.startAt,
        endAt: slot.endAt,
        timezone: "UTC",
        metadata: slot.metadata || null,
      },
    }),

  freeSlot: async ({ connection, slot }) =>
    googleCalendarAdapterService.cancelEvent({
      connection,
      event: {
        businessId: slot.businessId,
        appointmentId: slot.appointmentId || `slot_${slot.slotId || "unknown"}`,
        appointmentKey: slot.slotKey || slot.slotId || "slot_free",
        title: "Busy - Blocked",
        startAt: slot.startAt,
        endAt: slot.endAt,
        timezone: "UTC",
        externalEventId:
          String(
            toRecord(slot.metadata).externalEventId ||
              toRecord(connection.metadata).lastBlockedEventId ||
              ""
          ).trim() || null,
      },
    }),

  fetchAvailability: async ({ connection, request }) => {
    try {
      const calendarId = resolveCalendarId(connection);
      const response = await axios.post(
        `${GOOGLE_CALENDAR_API}/freeBusy`,
        {
          timeMin: request.windowStart.toISOString(),
          timeMax: request.windowEnd.toISOString(),
          timeZone: request.timezone || "UTC",
          items: [{ id: calendarId }],
        },
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};
      const busyRows = body?.calendars?.[calendarId]?.busy || [];

      return busyRows
        .map((row: any) => ({
          startAt: new Date(row.start),
          endAt: new Date(row.end),
          provider: "GOOGLE" as const,
          priority: 80,
          metadata: {
            calendarId,
          },
        }))
        .filter(
          (row: any) =>
            row.startAt instanceof Date &&
            !Number.isNaN(row.startAt.getTime()) &&
            row.endAt instanceof Date &&
            !Number.isNaN(row.endAt.getTime()) &&
            row.endAt > row.startAt
        );
    } catch (error) {
      throw classifyProviderError({
        provider: "GOOGLE",
        error,
      });
    }
  },

  syncMetadata: async ({ metadata }) =>
    asProviderResult({
      metadata: {
        syncedAt: new Date().toISOString(),
        ...metadata.metadata,
      },
    }),

  watchSubscription: async ({ connection, watch }) => {
    try {
      const calendarId = encodeURIComponent(resolveCalendarId(connection));
      const channelId = String(watch.channelId || crypto.randomUUID()).trim();
      const response = await axios.post(
        `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/watch`,
        {
          id: channelId,
          type: "web_hook",
          address: watch.callbackUrl,
          params: {
            ttl: Math.max(
              300,
              Math.floor(
                ((watch.expiresAt?.getTime() || Date.now() + 86_400_000) - Date.now()) / 1000
              )
            ).toString(),
          },
        },
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        watchChannelId: body.id || channelId,
        watchResourceId: body.resourceId || null,
        watchExpiresAt: body.expiration ? new Date(Number(body.expiration)) : null,
        metadata: {
          resourceUri: body.resourceUri || null,
        },
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "GOOGLE",
        error,
      });
    }
  },

  refreshWatchSubscription: async ({ connection, watch }) =>
    googleCalendarAdapterService.watchSubscription({
      connection,
      watch: {
        ...watch,
        channelId:
          String(watch.channelId || connection.watchChannelId || crypto.randomUUID()).trim() ||
          crypto.randomUUID(),
      },
    }),
};
