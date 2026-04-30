import axios from "axios";
import crypto from "crypto";
import {
  type CalendarProviderAdapter,
  type CalendarProviderOperationResult,
  classifyProviderError,
} from "./calendarProvider.contract";
import { toRecord } from "./reception.shared";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

const resolveCalendarPath = (connection: any) => {
  const calendarId = String(
    connection.externalCalendarId || toRecord(connection.metadata).externalCalendarId || ""
  ).trim();

  if (!calendarId) {
    return "/me/events";
  }

  return `/me/calendars/${encodeURIComponent(calendarId)}/events`;
};

const createHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

const buildOutlookEventPayload = (event: {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timezone?: string | null;
  attendees?: Array<{ email: string; name?: string | null; optional?: boolean }>;
  location?: string | null;
  meetingJoinUrl?: string | null;
}) => ({
  subject: event.title,
  body: {
    contentType: "HTML",
    content: [
      `<p>${event.description || ""}</p>`,
      event.meetingJoinUrl ? `<p>Join: ${event.meetingJoinUrl}</p>` : "",
    ]
      .filter(Boolean)
      .join(""),
  },
  start: {
    dateTime: event.startAt.toISOString(),
    timeZone: event.timezone || "UTC",
  },
  end: {
    dateTime: event.endAt.toISOString(),
    timeZone: event.timezone || "UTC",
  },
  location: event.location
    ? {
        displayName: event.location,
      }
    : undefined,
  attendees: (event.attendees || []).map((item) => ({
    emailAddress: {
      address: item.email,
      name: item.name || undefined,
    },
    type: item.optional ? "optional" : "required",
  })),
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
  provider: "OUTLOOK",
  externalEventId: input.externalEventId || null,
  externalEventVersion: input.externalEventVersion || null,
  watchChannelId: input.watchChannelId || null,
  watchResourceId: input.watchResourceId || null,
  watchExpiresAt: input.watchExpiresAt || null,
  metadata: input.metadata || null,
});

export const outlookCalendarAdapterService: CalendarProviderAdapter = {
  provider: "OUTLOOK",

  createEvent: async ({ connection, event }) => {
    try {
      const response = await axios.post(
        `${GRAPH_API_BASE}${resolveCalendarPath(connection)}`,
        buildOutlookEventPayload(event),
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        externalEventId: body.id || null,
        externalEventVersion: body.changeKey || body.lastModifiedDateTime || null,
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "OUTLOOK",
        error,
      });
    }
  },

  updateEvent: async ({ connection, event }) => {
    if (!event.externalEventId) {
      return outlookCalendarAdapterService.createEvent({
        connection,
        event,
      });
    }

    try {
      const response = await axios.patch(
        `${GRAPH_API_BASE}/me/events/${encodeURIComponent(event.externalEventId)}`,
        buildOutlookEventPayload(event),
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        externalEventId: body.id || event.externalEventId,
        externalEventVersion: body.changeKey || body.lastModifiedDateTime || null,
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "OUTLOOK",
        error,
      });
    }
  },

  cancelEvent: async ({ connection, event }) => {
    if (!event.externalEventId) {
      return asProviderResult({});
    }

    try {
      await axios.delete(
        `${GRAPH_API_BASE}/me/events/${encodeURIComponent(event.externalEventId)}`,
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
        provider: "OUTLOOK",
        error,
      });
    }
  },

  blockSlot: async ({ connection, slot }) =>
    outlookCalendarAdapterService.createEvent({
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
    outlookCalendarAdapterService.cancelEvent({
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
      const response = await axios.post(
        `${GRAPH_API_BASE}/me/calendar/getSchedule`,
        {
          schedules: [
            String(
              toRecord(connection.metadata).scheduleAddress ||
                connection.externalCalendarId ||
                "me"
            ),
          ],
          startTime: {
            dateTime: request.windowStart.toISOString(),
            timeZone: request.timezone || "UTC",
          },
          endTime: {
            dateTime: request.windowEnd.toISOString(),
            timeZone: request.timezone || "UTC",
          },
          availabilityViewInterval: 15,
        },
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};
      const schedules = Array.isArray(body.value) ? body.value : [];
      const busyRows = schedules.flatMap((entry: any) =>
        Array.isArray(entry.scheduleItems) ? entry.scheduleItems : []
      );

      return busyRows
        .map((row: any) => ({
          startAt: new Date(row.start?.dateTime || row.start?.dateTimeTime || row.start),
          endAt: new Date(row.end?.dateTime || row.end?.dateTimeTime || row.end),
          provider: "OUTLOOK" as const,
          priority: 70,
          externalEventId: row.id || null,
          metadata: {
            status: row.status || null,
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
        provider: "OUTLOOK",
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
      const channelId = String(watch.channelId || crypto.randomUUID()).trim();
      const expiresAt = watch.expiresAt || new Date(Date.now() + 70 * 60 * 1000);
      const response = await axios.post(
        `${GRAPH_API_BASE}/subscriptions`,
        {
          changeType: "created,updated,deleted",
          notificationUrl: watch.callbackUrl,
          resource: "/me/events",
          expirationDateTime: expiresAt.toISOString(),
          clientState: channelId,
        },
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        watchChannelId: body.clientState || channelId,
        watchResourceId: body.id || null,
        watchExpiresAt: body.expirationDateTime
          ? new Date(body.expirationDateTime)
          : expiresAt,
        metadata: {
          resource: body.resource || "/me/events",
        },
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "OUTLOOK",
        error,
      });
    }
  },

  refreshWatchSubscription: async ({ connection, watch }) => {
    const subscriptionId = String(
      connection.watchResourceId || toRecord(connection.metadata).subscriptionId || ""
    ).trim();

    if (!subscriptionId) {
      return outlookCalendarAdapterService.watchSubscription({
        connection,
        watch,
      });
    }

    try {
      const expiresAt = watch.expiresAt || new Date(Date.now() + 70 * 60 * 1000);
      const response = await axios.patch(
        `${GRAPH_API_BASE}/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          expirationDateTime: expiresAt.toISOString(),
        },
        {
          headers: createHeaders(connection.accessToken),
          timeout: 12_000,
        }
      );
      const body = response.data || {};

      return asProviderResult({
        watchChannelId: String(
          watch.channelId || connection.watchChannelId || toRecord(connection.metadata).clientState || ""
        ).trim() || null,
        watchResourceId: body.id || subscriptionId,
        watchExpiresAt: body.expirationDateTime
          ? new Date(body.expirationDateTime)
          : expiresAt,
      });
    } catch (error) {
      throw classifyProviderError({
        provider: "OUTLOOK",
        error,
      });
    }
  },
};
