import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import {
  mergeAppointmentMetadata,
  parseAppointmentMetadata,
} from "./appointment.shared";
import { toRecord } from "./reception.shared";

export const APPOINTMENT_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["PROPOSED", "HOLD", "CONFIRMED", "CANCELLED", "EXPIRED"],
  PROPOSED: ["HOLD", "CONFIRMED", "CANCELLED", "EXPIRED"],
  HOLD: ["CONFIRMED", "CANCELLED", "EXPIRED", "RESCHEDULED"],
  CONFIRMED: [
    "RESCHEDULED",
    "REMINDER_SENT",
    "CHECKED_IN",
    "LATE_JOIN",
    "IN_PROGRESS",
    "NO_SHOW",
    "CANCELLED",
    "EXPIRED",
  ],
  RESCHEDULED: [
    "REMINDER_SENT",
    "CHECKED_IN",
    "LATE_JOIN",
    "IN_PROGRESS",
    "NO_SHOW",
    "CANCELLED",
    "EXPIRED",
  ],
  REMINDER_SENT: [
    "CHECKED_IN",
    "LATE_JOIN",
    "IN_PROGRESS",
    "NO_SHOW",
    "CANCELLED",
    "EXPIRED",
  ],
  CHECKED_IN: ["LATE_JOIN", "IN_PROGRESS", "NO_SHOW", "CANCELLED", "EXPIRED"],
  LATE_JOIN: ["IN_PROGRESS", "COMPLETED", "NO_SHOW", "EXPIRED"],
  IN_PROGRESS: ["COMPLETED", "NO_SHOW", "EXPIRED"],
  COMPLETED: ["FOLLOWUP_BOOKED"],
  FOLLOWUP_BOOKED: [],
  NO_SHOW: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const canTransitionAppointmentStatus = ({
  current,
  next,
}: {
  current: string;
  next: string;
}) => {
  if (current === next) {
    return true;
  }

  return (APPOINTMENT_ALLOWED_TRANSITIONS[current] || []).includes(next);
};

type AppointmentStateRepository = {
  findByKey: (input: {
    businessId: string;
    appointmentKey: string;
  }) => Promise<any | null>;
  updateById: (input: {
    id: string;
    data: Prisma.AppointmentLedgerUpdateInput;
  }) => Promise<any>;
};

const createPrismaAppointmentStateRepository = (): AppointmentStateRepository => ({
  findByKey: ({ businessId, appointmentKey }) =>
    prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        appointmentKey,
      },
    }),
  updateById: ({ id, data }) =>
    prisma.appointmentLedger.update({
      where: {
        id,
      },
      data,
    }),
});

const getTimestampUpdatesForState = ({
  nextState,
  now,
}: {
  nextState: string;
  now: Date;
}) => {
  switch (nextState) {
    case "CHECKED_IN":
      return {
        checkInAt: now,
      };
    case "LATE_JOIN":
      return {
        checkInAt: now,
      };
    case "IN_PROGRESS":
      return {
        startedAt: now,
      };
    case "COMPLETED":
      return {
        endedAt: now,
        completedAt: now,
      };
    default:
      return {};
  }
};

const writeStateEvent = async ({
  appointment,
  nextState,
  now,
  traceId,
}: {
  appointment: any;
  nextState: string;
  now: Date;
  traceId?: string | null;
}) => {
  const payloadBase = {
    businessId: appointment.businessId,
    appointmentId: appointment.id,
    appointmentKey: appointment.appointmentKey,
    leadId: appointment.leadId,
    traceId: traceId || null,
  };

  if (nextState === "CHECKED_IN") {
    await publishAppointmentEvent({
      event: "appointment.check_in",
      businessId: appointment.businessId,
      aggregateId: appointment.id,
      payload: {
        ...payloadBase,
        checkInAt: now.toISOString(),
      },
      eventKey: `${appointment.appointmentKey}:${nextState}:${now.toISOString()}`,
    });
    return;
  }

  if (nextState === "IN_PROGRESS") {
    await publishAppointmentEvent({
      event: "appointment.in_progress",
      businessId: appointment.businessId,
      aggregateId: appointment.id,
      payload: {
        ...payloadBase,
        startedAt: now.toISOString(),
      },
      eventKey: `${appointment.appointmentKey}:${nextState}:${now.toISOString()}`,
    });
    return;
  }

  if (nextState === "LATE_JOIN") {
    await publishAppointmentEvent({
      event: "appointment.late_join",
      businessId: appointment.businessId,
      aggregateId: appointment.id,
      payload: {
        ...payloadBase,
        lateAt: now.toISOString(),
        graceWindowMinutes: Number(toRecord(appointment.metadata).graceWindowMinutes || 0),
      },
      eventKey: `${appointment.appointmentKey}:${nextState}:${now.toISOString()}`,
    });
    return;
  }

  if (nextState === "COMPLETED") {
    await publishAppointmentEvent({
      event: "appointment.completed",
      businessId: appointment.businessId,
      aggregateId: appointment.id,
      payload: {
        ...payloadBase,
        completedAt: now.toISOString(),
        outcome: appointment.outcome || null,
      },
      eventKey: `${appointment.appointmentKey}:${nextState}:${now.toISOString()}`,
    });
    return;
  }

  if (nextState === "NO_SHOW") {
    await publishAppointmentEvent({
      event: "appointment.no_show",
      businessId: appointment.businessId,
      aggregateId: appointment.id,
      payload: {
        ...payloadBase,
        detectedAt: now.toISOString(),
        policyAction: "AUTO_RECOVERY",
      },
      eventKey: `${appointment.appointmentKey}:${nextState}:${now.toISOString()}`,
    });
    return;
  }

  if (nextState === "EXPIRED") {
    await publishAppointmentEvent({
      event: "appointment.expired",
      businessId: appointment.businessId,
      aggregateId: appointment.id,
      payload: {
        ...payloadBase,
        expiredAt: now.toISOString(),
        reason: "hold_or_confirmation_timeout",
      },
      eventKey: `${appointment.appointmentKey}:${nextState}:${now.toISOString()}`,
    });
  }
};

export const createMeetingStateService = ({
  repository = createPrismaAppointmentStateRepository(),
}: {
  repository?: AppointmentStateRepository;
} = {}) => ({
  transition: async ({
    businessId,
    appointmentKey,
    nextState,
    reason,
    traceId,
    metadata,
    now = new Date(),
  }: {
    businessId: string;
    appointmentKey: string;
    nextState: string;
    reason: string;
    traceId?: string | null;
    metadata?: Record<string, unknown> | null;
    now?: Date;
  }) => {
    const appointment = await repository.findByKey({
      businessId,
      appointmentKey,
    });

    if (!appointment) {
      throw new Error("appointment_not_found");
    }

    if (
      !canTransitionAppointmentStatus({
        current: appointment.status,
        next: nextState,
      })
    ) {
      throw new Error(
        `invalid_appointment_transition:${appointment.status}->${nextState}`
      );
    }

    const currentMetadata = parseAppointmentMetadata(appointment.metadata);
    const transitionHistory = Array.isArray(currentMetadata.transitionHistory)
      ? currentMetadata.transitionHistory
      : [];
    const nextMetadata = mergeAppointmentMetadata(currentMetadata, metadata || undefined, {
      transitionHistory: [
        ...transitionHistory,
        {
          from: appointment.status,
          to: nextState,
          reason,
          at: now.toISOString(),
        },
      ].slice(-100),
      lastTransitionAt: now.toISOString(),
      lastTransitionReason: reason,
      traceId: traceId || null,
    });

    const updated = await repository.updateById({
      id: appointment.id,
      data: {
        status: nextState as any,
        metadata: nextMetadata as Prisma.InputJsonValue,
        ...getTimestampUpdatesForState({
          nextState,
          now,
        }),
      },
    });

    await writeStateEvent({
      appointment: updated,
      nextState,
      now,
      traceId,
    });

    return updated;
  },
});
