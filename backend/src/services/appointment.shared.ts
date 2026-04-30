import crypto from "crypto";
import { toRecord, type JsonRecord } from "./reception.shared";

export const APPOINTMENT_INTENTS = [
  "BOOK",
  "CHECK_AVAILABILITY",
  "CONFIRM_SLOT",
  "RESCHEDULE",
  "CANCEL_BOOKING",
  "JOIN_LINK",
  "RUNNING_LATE",
  "CHECK_IN",
  "NO_SHOW_RECOVERY",
  "FOLLOWUP_BOOKING",
  "GROUP_BOOKING",
  "RECURRING_BOOKING",
  "WAITLIST_REQUEST",
] as const;

export type AppointmentIntent = (typeof APPOINTMENT_INTENTS)[number];

export const APPOINTMENT_LIFECYCLE_ORDER: Record<string, number> = {
  REQUESTED: 0,
  PROPOSED: 1,
  HOLD: 2,
  CONFIRMED: 3,
  RESCHEDULED: 4,
  REMINDER_SENT: 5,
  CHECKED_IN: 6,
  LATE_JOIN: 7,
  IN_PROGRESS: 8,
  COMPLETED: 9,
  FOLLOWUP_BOOKED: 10,
  NO_SHOW: 11,
  CANCELLED: 12,
  EXPIRED: 13,
};

export const APPOINTMENT_ACTIVE_STATUSES = new Set([
  "HOLD",
  "CONFIRMED",
  "RESCHEDULED",
  "REMINDER_SENT",
  "CHECKED_IN",
  "LATE_JOIN",
  "IN_PROGRESS",
]);

export const APPOINTMENT_TERMINAL_STATUSES = new Set([
  "FOLLOWUP_BOOKED",
  "NO_SHOW",
  "CANCELLED",
  "EXPIRED",
]);

export const normalizeAppointmentIntent = (
  value: unknown,
  fallback: AppointmentIntent = "BOOK"
): AppointmentIntent => {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase() as AppointmentIntent;

  return APPOINTMENT_INTENTS.includes(normalized) ? normalized : fallback;
};

export const isAppointmentIntentClass = (value: unknown) =>
  APPOINTMENT_INTENTS.includes(
    String(value || "")
      .trim()
      .replace(/[\s-]+/g, "_")
      .toUpperCase() as AppointmentIntent
  );

export const buildAppointmentKey = ({
  businessId,
  leadId,
  meetingType,
  startAt,
  source = "AUTOMEXIA",
}: {
  businessId: string;
  leadId: string;
  meetingType: string;
  startAt?: Date | null;
  source?: string;
}) => {
  const seed = [
    businessId,
    leadId,
    String(meetingType || "GENERAL").trim().toUpperCase(),
    startAt ? startAt.toISOString() : "",
    String(source || "AUTOMEXIA").trim().toUpperCase(),
    crypto.randomUUID(),
  ].join(":");

  return `appt_${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
};

export const mergeAppointmentMetadata = (
  ...inputs: Array<JsonRecord | null | undefined>
) => {
  const merged = inputs.reduce<JsonRecord>((state, current) => {
    if (!current) {
      return state;
    }

    return {
      ...state,
      ...current,
    };
  }, {});

  return Object.keys(merged).length ? merged : null;
};

export const parseAppointmentMetadata = (value: unknown) => toRecord(value);

export const toSafeTimezone = (value: unknown, fallback = "UTC") => {
  const candidate = String(value || "").trim();

  if (!candidate) {
    return fallback;
  }

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: candidate,
    });
    return candidate;
  } catch {
    return fallback;
  }
};
