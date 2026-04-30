import { Prisma } from "@prisma/client";
import { createDurableOutboxEvent } from "./eventOutbox.service";

export const APPOINTMENT_EVENT_CONTRACT_VERSION = 1 as const;

export const APPOINTMENT_EVENT_TYPES = [
  "appointment.requested",
  "appointment.proposed",
  "appointment.hold_created",
  "appointment.confirmed",
  "appointment.rescheduled",
  "appointment.cancelled",
  "appointment.reminder_sent",
  "appointment.check_in",
  "appointment.in_progress",
  "appointment.completed",
  "appointment.no_show",
  "appointment.late_join",
  "appointment.followup_booked",
  "appointment.waitlist_filled",
  "appointment.calendar_sync",
  "appointment.artifact_recorded",
  "appointment.expired",
] as const;

export type AppointmentEventName = (typeof APPOINTMENT_EVENT_TYPES)[number];

type AppointmentEventPayloadBase = {
  businessId: string;
  appointmentId: string;
  appointmentKey: string;
  leadId: string;
  traceId?: string | null;
};

export type AppointmentEventMap = {
  "appointment.requested": AppointmentEventPayloadBase & {
    meetingType: string;
    requestedWindow: unknown;
  };
  "appointment.proposed": AppointmentEventPayloadBase & {
    proposalCount: number;
    slots: Array<{
      slotId: string;
      slotKey: string;
      startAt: string;
      endAt: string;
      score: number;
      reason: string;
    }>;
  };
  "appointment.hold_created": AppointmentEventPayloadBase & {
    slotId: string;
    slotKey: string;
    holdExpiresAt: string | null;
  };
  "appointment.confirmed": AppointmentEventPayloadBase & {
    slotId: string | null;
    startAt: string | null;
    endAt: string | null;
  };
  "appointment.rescheduled": AppointmentEventPayloadBase & {
    fromSlotId: string | null;
    toSlotId: string | null;
    rescheduleCount: number;
  };
  "appointment.cancelled": AppointmentEventPayloadBase & {
    reason: string;
  };
  "appointment.reminder_sent": AppointmentEventPayloadBase & {
    reminderType: string;
    channel: string;
  };
  "appointment.check_in": AppointmentEventPayloadBase & {
    checkInAt: string;
  };
  "appointment.in_progress": AppointmentEventPayloadBase & {
    startedAt: string;
  };
  "appointment.completed": AppointmentEventPayloadBase & {
    completedAt: string;
    outcome: string | null;
  };
  "appointment.no_show": AppointmentEventPayloadBase & {
    detectedAt: string;
    policyAction: string;
  };
  "appointment.late_join": AppointmentEventPayloadBase & {
    lateAt: string;
    graceWindowMinutes: number;
  };
  "appointment.followup_booked": AppointmentEventPayloadBase & {
    followupAppointmentKey: string | null;
  };
  "appointment.waitlist_filled": AppointmentEventPayloadBase & {
    waitlistEntryId: string;
    slotId: string;
  };
  "appointment.calendar_sync": AppointmentEventPayloadBase & {
    provider: string;
    syncStatus: string;
    externalEventId: string | null;
  };
  "appointment.artifact_recorded": AppointmentEventPayloadBase & {
    artifactTypes: string[];
  };
  "appointment.expired": AppointmentEventPayloadBase & {
    expiredAt: string;
    reason: string;
  };
};

export type AppointmentEventEnvelope<
  TEvent extends AppointmentEventName = AppointmentEventName,
> = {
  type: TEvent;
  version: typeof APPOINTMENT_EVENT_CONTRACT_VERSION;
  aggregateType: "appointment_ledger";
  aggregateId: string;
  dedupeKey: string;
  occurredAt: string;
  payload: AppointmentEventMap[TEvent];
};

export const buildAppointmentEventDedupeKey = <
  TEvent extends AppointmentEventName,
>({
  event,
  aggregateId,
  eventKey,
}: {
  event: TEvent;
  aggregateId: string;
  eventKey?: string | null;
}) =>
  [
    "appointment",
    `v${APPOINTMENT_EVENT_CONTRACT_VERSION}`,
    event,
    aggregateId,
    String(eventKey || aggregateId).trim() || aggregateId,
  ].join(":");

export const publishAppointmentEvent = async <
  TEvent extends AppointmentEventName,
>({
  event,
  businessId,
  aggregateId,
  eventKey,
  occurredAt = new Date(),
  payload,
  tx,
}: {
  event: TEvent;
  businessId: string;
  aggregateId: string;
  eventKey?: string | null;
  occurredAt?: Date;
  payload: AppointmentEventMap[TEvent];
  tx?: Prisma.TransactionClient;
}) => {
  const dedupeKey = buildAppointmentEventDedupeKey({
    event,
    aggregateId,
    eventKey,
  });
  const envelope: AppointmentEventEnvelope<TEvent> = {
    type: event,
    version: APPOINTMENT_EVENT_CONTRACT_VERSION,
    aggregateType: "appointment_ledger",
    aggregateId,
    dedupeKey,
    occurredAt: occurredAt.toISOString(),
    payload,
  };

  await createDurableOutboxEvent({
    businessId,
    eventType: event,
    aggregateType: envelope.aggregateType,
    aggregateId,
    payload: envelope as unknown as Record<string, unknown>,
    dedupeKey,
    tx,
  });

  return envelope;
};
