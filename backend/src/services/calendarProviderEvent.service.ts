import { createDurableOutboxEvent } from "./eventOutbox.service";

export const CALENDAR_PROVIDER_EVENT_TYPES = [
  "calendar.provider.auth_failed",
  "calendar.provider.subscription_expiring",
  "calendar.provider.subscription_renewed",
] as const;

export type CalendarProviderEventName = (typeof CALENDAR_PROVIDER_EVENT_TYPES)[number];

export const publishCalendarProviderEvent = async ({
  businessId,
  provider,
  connectionId,
  eventType,
  payload,
  dedupeSuffix,
}: {
  businessId: string;
  provider: string;
  connectionId: string;
  eventType: CalendarProviderEventName;
  payload: Record<string, unknown>;
  dedupeSuffix?: string | null;
}) =>
  createDurableOutboxEvent({
    businessId,
    eventType,
    aggregateType: "calendar_connection",
    aggregateId: connectionId,
    dedupeKey: [
      "calendar_provider",
      eventType,
      businessId,
      provider,
      connectionId,
      String(dedupeSuffix || "").trim() || new Date().toISOString().slice(0, 16),
    ].join(":"),
    payload: {
      version: 1,
      type: eventType,
      businessId,
      provider,
      connectionId,
      occurredAt: new Date().toISOString(),
      ...payload,
    },
  });
