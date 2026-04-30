import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { publishCRMRefreshEvent } from "./crm/refreshEvents.service";
import { scheduleFollowups } from "../queues/followup.queue";
import { acquireDistributedLock } from "./distributedLock.service";
import { upsertRevenueTouchLedger } from "./revenueTouchLedger.service";
import { recordSalesConversionEvent } from "./salesAgent/optimizer.service";
import {
  APPOINTMENT_ACTIVE_STATUSES,
  APPOINTMENT_TERMINAL_STATUSES,
  buildAppointmentKey,
  mergeAppointmentMetadata,
  parseAppointmentMetadata,
  toSafeTimezone,
} from "./appointment.shared";
import { createAvailabilityPlannerService } from "./availabilityPlanner.service";
import {
  createBookingPolicyService,
  evaluateCancellationPolicy,
  evaluateReschedulePolicy,
} from "./bookingPolicy.service";
import { createMeetingStateService } from "./meetingState.service";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import { createDurableOutboxEvent } from "./eventOutbox.service";
import {
  acquireAppointmentSlotHold,
  readAppointmentSlotHold,
  releaseAppointmentSlotHold,
} from "./slotLock.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { toRecord } from "./reception.shared";

const LOCK_TTL_MS = 10_000;
const LOCK_WAIT_MS = 2_000;

const buildAppointmentLockKey = ({
  businessId,
  appointmentKey,
}: {
  businessId: string;
  appointmentKey: string;
}) => `appointment:ledger:${businessId}:${appointmentKey}`;

const buildSlotMutationLockKey = ({
  businessId,
  slotId,
}: {
  businessId: string;
  slotId: string;
}) => `appointment:slot:${businessId}:${slotId}`;

const createLockScope = async ({
  key,
  waitMs = LOCK_WAIT_MS,
}: {
  key: string;
  waitMs?: number;
}) => {
  const lock = await acquireDistributedLock({
    key,
    ttlMs: LOCK_TTL_MS,
    waitMs,
  });

  if (!lock) {
    throw new Error(`lock_unavailable:${key}`);
  }

  return lock;
};

const queueCalendarSyncRequestedInTx = async ({
  tx,
  businessId,
  appointmentId,
  appointmentKey,
  operation,
  fingerprint,
  payload,
}: {
  tx: Prisma.TransactionClient;
  businessId: string;
  appointmentId: string;
  appointmentKey: string;
  operation: string;
  fingerprint: string;
  payload: Record<string, unknown>;
}) =>
  createDurableOutboxEvent({
    tx,
    businessId,
    eventType: "calendar.sync.requested",
    aggregateType: "appointment_ledger",
    aggregateId: appointmentId,
    dedupeKey: [
      "calendar_sync",
      operation,
      businessId,
      appointmentId,
      appointmentKey,
      fingerprint,
    ].join(":"),
    payload: {
      type: "calendar.sync.requested",
      version: 1,
      businessId,
      appointmentId,
      appointmentKey,
      operation,
      ...payload,
    },
  });

type AppointmentEngineDependencies = {
  planner?: ReturnType<typeof createAvailabilityPlannerService>;
  policyService?: ReturnType<typeof createBookingPolicyService>;
  stateService?: ReturnType<typeof createMeetingStateService>;
};

const resolveLegacyName = (lead: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) => String(lead.name || lead.email || lead.phone || "Customer").trim() || "Customer";

const isTerminalStatus = (status: string) =>
  APPOINTMENT_TERMINAL_STATUSES.has(String(status || "").trim().toUpperCase());

const isActiveStatus = (status: string) =>
  APPOINTMENT_ACTIVE_STATUSES.has(String(status || "").trim().toUpperCase());

const ensureSlotExistsForDirectBooking = async ({
  businessId,
  startAt,
  endAt,
  timezone,
  humanId = null,
  teamId = null,
}: {
  businessId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  humanId?: string | null;
  teamId?: string | null;
}) => {
  const existing = await prisma.availabilitySlot.findFirst({
    where: {
      businessId,
      startAt,
      endAt,
      ...(humanId ? { humanId } : {}),
      ...(teamId ? { teamId } : {}),
    },
  });

  if (existing) {
    return existing;
  }

  const slotKey = [
    "slot",
    businessId,
    startAt.toISOString(),
    endAt.toISOString(),
    humanId || "none",
    teamId || "none",
  ]
    .join(":")
    .replace(/[^A-Za-z0-9:_-]/g, "_");

  return prisma.availabilitySlot.upsert({
    where: {
      slotKey,
    },
    update: {
      startAt,
      endAt,
      timezone,
      blocked: false,
      capacity: 1,
    },
    create: {
      businessId,
      slotKey,
      humanId,
      teamId,
      timezone,
      startAt,
      endAt,
      capacity: 1,
      reservedCount: 0,
      blocked: false,
    },
  });
};

const syncLegacyAppointmentMirror = async ({
  appointment,
  lead,
}: {
  appointment: any;
  lead: any;
}) => {
  if (!appointment.startAt || !appointment.endAt) {
    return null;
  }

  const metadata = parseAppointmentMetadata(appointment.metadata);
  const legacyAppointmentId = String(metadata.legacyAppointmentId || "").trim() || null;
  const mirrorPayload = {
    businessId: appointment.businessId,
    leadId: appointment.leadId,
    name: resolveLegacyName(lead),
    email: lead?.email || null,
    phone: lead?.phone || null,
    startTime: appointment.startAt,
    endTime: appointment.endAt,
    status:
      appointment.status === "CANCELLED"
        ? "CANCELLED"
        : appointment.status === "COMPLETED"
        ? "COMPLETED"
        : "CONFIRMED",
    meetingLink: appointment.meetingJoinUrl || null,
  };

  if (legacyAppointmentId) {
    await prisma.appointment.updateMany({
      where: {
        id: legacyAppointmentId,
        businessId: appointment.businessId,
      },
      data: mirrorPayload,
    });

    const updated = await prisma.appointment.findFirst({
      where: {
        id: legacyAppointmentId,
        businessId: appointment.businessId,
      },
    });

    if (updated) {
      return updated;
    }
  }

  const created = await prisma.appointment.create({
    data: mirrorPayload,
  });

  const nextMetadata = mergeAppointmentMetadata(metadata, {
    legacyAppointmentId: created.id,
  });

  await prisma.appointmentLedger.update({
    where: {
      id: appointment.id,
    },
    data: {
      metadata: nextMetadata as Prisma.InputJsonValue,
    },
  });

  return created;
};

export const createAppointmentEngineService = ({
  planner = createAvailabilityPlannerService(),
  policyService = createBookingPolicyService(),
  stateService = createMeetingStateService(),
}: AppointmentEngineDependencies = {}) => {
  const requestAppointment = async ({
    businessId,
    leadId,
    appointmentKey,
    source = "AUTOMEXIA",
    bookedBy = "SELF",
    meetingType = "GENERAL",
    purpose = null,
    priority = "MEDIUM",
    timezone = "UTC",
    requestedWindow = null,
    durationMinutes,
    assignedHumanId = null,
    assignedTeam = null,
    locationType = "VIRTUAL",
    locationDetails = null,
    notes = null,
    interactionId = null,
    traceId = null,
    metadata = null,
  }: {
    businessId: string;
    leadId: string;
    appointmentKey?: string | null;
    source?: string;
    bookedBy?: "AI" | "HUMAN" | "SELF";
    meetingType?: string;
    purpose?: string | null;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    timezone?: string;
    requestedWindow?: Record<string, unknown> | null;
    durationMinutes?: number | null;
    assignedHumanId?: string | null;
    assignedTeam?: string | null;
    locationType?: string;
    locationDetails?: Record<string, unknown> | null;
    notes?: string | null;
    interactionId?: string | null;
    traceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const normalizedMeetingType = String(meetingType || "GENERAL")
      .trim()
      .toUpperCase();
    const policy = await policyService.resolvePolicy({
      businessId,
      meetingType: normalizedMeetingType,
    });
    const canonicalKey =
      String(appointmentKey || "").trim() ||
      buildAppointmentKey({
        businessId,
        leadId,
        meetingType: normalizedMeetingType,
        source,
      });
    return prisma.$transaction(async (tx) => {
      const existing = await tx.appointmentLedger.findFirst({
        where: {
          businessId,
          appointmentKey: canonicalKey,
        },
      });

      if (existing) {
        return existing;
      }

      const requested = await tx.appointmentLedger.create({
        data: {
          businessId,
          appointmentKey: canonicalKey,
          leadId,
          interactionId,
          source: String(source || "AUTOMEXIA").trim().toUpperCase(),
          bookedBy: bookedBy as any,
          meetingType: normalizedMeetingType,
          purpose: purpose || null,
          status: "REQUESTED",
          priority: priority as any,
          timezone: toSafeTimezone(timezone, "UTC"),
          requestedWindow: requestedWindow as Prisma.InputJsonValue,
          durationMinutes: Math.max(5, Number(durationMinutes || policy.duration || 30)),
          assignedHumanId,
          assignedTeam,
          locationType: String(locationType || "VIRTUAL").trim().toUpperCase(),
          locationDetails: (locationDetails || null) as Prisma.InputJsonValue,
          notes: notes || null,
          metadata: mergeAppointmentMetadata(metadata || undefined, {
            policyId: policy.id,
            traceId,
          }) as Prisma.InputJsonValue,
        },
      });

      await publishAppointmentEvent({
        tx,
        event: "appointment.requested",
        businessId,
        aggregateId: requested.id,
        payload: {
          businessId,
          appointmentId: requested.id,
          appointmentKey: requested.appointmentKey,
          leadId: requested.leadId,
          traceId,
          meetingType: requested.meetingType,
          requestedWindow: requested.requestedWindow,
        },
        eventKey: requested.appointmentKey,
      });

      await queueCalendarSyncRequestedInTx({
        tx,
        businessId,
        appointmentId: requested.id,
        appointmentKey: requested.appointmentKey,
        operation: "CREATE",
        fingerprint: "requested",
        payload: {
          reason: "appointment_requested",
        },
      });

      return requested;
    });
  };

  const checkAvailability = async ({
    businessId,
    appointmentKey,
    windowStart,
    windowEnd,
    language = null,
    requiredSkills = [],
    preferredHumanId = null,
    preferredTeamId = null,
    urgency = "MEDIUM",
    noShowRisk = 0,
    isVip = false,
    maxResults = 8,
  }: {
    businessId: string;
    appointmentKey: string;
    windowStart: Date;
    windowEnd: Date;
    language?: string | null;
    requiredSkills?: string[];
    preferredHumanId?: string | null;
    preferredTeamId?: string | null;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    noShowRisk?: number;
    isVip?: boolean;
    maxResults?: number;
  }) => {
    const appointment = await prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        appointmentKey,
      },
    });

    if (!appointment) {
      throw new Error("appointment_not_found");
    }

    if (isTerminalStatus(appointment.status)) {
      throw new Error(`appointment_terminal:${appointment.status}`);
    }

    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId: appointment.leadId,
    }).catch(() => null);
    const predictedNoShowRisk =
      Number(runtime?.predictions.no_show_probability || 0) * 100;
    const effectiveNoShowRisk = Math.max(
      0,
      Math.min(
        100,
        Math.max(noShowRisk, predictedNoShowRisk) +
          Number(runtime?.controls.booking.noShowMitigationLevel || 0) * 8
      )
    );
    const effectiveUrgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
      runtime && runtime.controls.crm.priorityDelta >= 22
        ? "CRITICAL"
        : runtime && runtime.controls.crm.priorityDelta >= 12
        ? "HIGH"
        : urgency;
    const effectiveMaxResults = Math.max(
      1,
      Math.min(
        20,
        Math.round(
          maxResults +
            (runtime?.controls.booking.slotStrategy === "capacity_balanced"
              ? 4
              : 0)
        )
      )
    );

    const rankedSlots = await planner.getRankedSlots({
      businessId,
      windowStart,
      windowEnd,
      timezone: appointment.timezone,
      language,
      requiredSkills,
      preferredHumanId,
      preferredTeamId,
      noShowRisk: effectiveNoShowRisk,
      urgency: effectiveUrgency,
      isVip,
      maxResults: effectiveMaxResults,
      concurrencyCap: null,
    });

    const nextMetadata = mergeAppointmentMetadata(
      parseAppointmentMetadata(appointment.metadata),
      {
        slotPlanning: {
          evaluatedAt: new Date().toISOString(),
          count: rankedSlots.length,
          intelligence: runtime
            ? {
                policyVersion: runtime.policyVersion,
                noShowRisk: effectiveNoShowRisk,
                urgency: effectiveUrgency,
                slotStrategy: runtime.controls.booking.slotStrategy,
              }
            : null,
          reasons: rankedSlots.map((slot) => ({
            slotId: slot.slotId,
            slotKey: slot.slotKey,
            score: slot.score,
            reason: slot.reason,
            detail: slot.detail,
          })),
        },
      }
    );

    const updated = await prisma.appointmentLedger.update({
      where: {
        id: appointment.id,
      },
      data: {
        status: appointment.status === "REQUESTED" ? "PROPOSED" : appointment.status,
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });

    await publishAppointmentEvent({
      event: "appointment.proposed",
      businessId,
      aggregateId: appointment.id,
      payload: {
        businessId,
        appointmentId: appointment.id,
        appointmentKey: appointment.appointmentKey,
        leadId: appointment.leadId,
        traceId: String(toRecord(nextMetadata).traceId || "").trim() || null,
        proposalCount: rankedSlots.length,
        slots: rankedSlots.map((slot) => ({
          slotId: slot.slotId,
          slotKey: slot.slotKey,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          score: slot.score,
          reason: slot.reason,
        })),
      },
      eventKey: `${appointment.appointmentKey}:proposed:${rankedSlots[0]?.slotKey || "none"}`,
    });

    return {
      appointment: updated,
      rankedSlots,
    };
  };

  const holdSlot = async ({
    businessId,
    appointmentKey,
    slotKey,
    holdTtlMinutes = 10,
    heldBy = "SELF",
  }: {
    businessId: string;
    appointmentKey: string;
    slotKey: string;
    holdTtlMinutes?: number;
    heldBy?: "AI" | "HUMAN" | "SELF" | "SYSTEM";
  }) => {
    const appointment = await prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        appointmentKey,
      },
    });

    if (!appointment) {
      throw new Error("appointment_not_found");
    }

    if (isTerminalStatus(appointment.status)) {
      throw new Error(`appointment_terminal:${appointment.status}`);
    }

    const slot = await prisma.availabilitySlot.findFirst({
      where: {
        businessId,
        slotKey,
      },
    });

    if (!slot) {
      throw new Error("slot_not_found");
    }

    const slotLock = await createLockScope({
      key: buildSlotMutationLockKey({
        businessId,
        slotId: slot.id,
      }),
    });
    const appointmentLock = await createLockScope({
      key: buildAppointmentLockKey({
        businessId,
        appointmentKey,
      }),
    });
    const holdTtlMs = Math.max(30_000, holdTtlMinutes * 60_000);

    try {
      const held = await acquireAppointmentSlotHold({
        businessId,
        slotKey,
        appointmentKey,
        heldBy,
        ttlMs: holdTtlMs,
      });

      if (!held) {
        throw new Error("slot_hold_unavailable");
      }

      const holdExpiresAt = held.expiresAt;
      const updated = await prisma.$transaction(async (tx) => {
        const lockedSlot = await tx.availabilitySlot.findFirst({
          where: {
            id: slot.id,
            businessId,
          },
        });

        if (!lockedSlot) {
          throw new Error("slot_not_found");
        }

        if (lockedSlot.blocked) {
          throw new Error("slot_blocked");
        }

        if (lockedSlot.reservedCount >= lockedSlot.capacity) {
          throw new Error("slot_capacity_exhausted");
        }

        const overlappingBlock = await tx.availabilitySlot.findFirst({
          where: {
            businessId,
            blocked: true,
            id: {
              not: lockedSlot.id,
            },
            startAt: {
              lt: lockedSlot.endAt,
            },
            endAt: {
              gt: lockedSlot.startAt,
            },
          },
          select: {
            id: true,
          },
        });

        if (overlappingBlock) {
          throw new Error("slot_blocked_overlap");
        }

        const refreshed = await tx.appointmentLedger.findFirst({
          where: {
            id: appointment.id,
            businessId,
          },
        });

        if (!refreshed) {
          throw new Error("appointment_not_found");
        }

        if (isTerminalStatus(refreshed.status)) {
          throw new Error(`appointment_terminal:${refreshed.status}`);
        }

        await tx.availabilitySlot.update({
          where: {
            id: lockedSlot.id,
          },
          data: {
            reservedCount: {
              increment: 1,
            },
          },
        });

        await tx.slotReservationLedger.create({
          data: {
            businessId,
            appointmentId: refreshed.id,
            slotId: lockedSlot.id,
            reason: "HOLD",
            reservedBy: heldBy,
            metadata: {
              holdToken: held.token,
              holdExpiresAt: holdExpiresAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        const nextMetadata = mergeAppointmentMetadata(
          parseAppointmentMetadata(refreshed.metadata),
          {
            slotKey: lockedSlot.slotKey,
            slotHoldToken: held.token,
            holdExpiresAt: holdExpiresAt.toISOString(),
          }
        );

        const row = await tx.appointmentLedger.update({
          where: {
            id: refreshed.id,
          },
          data: {
            status: "HOLD",
            slotId: lockedSlot.id,
            startAt: lockedSlot.startAt,
            endAt: lockedSlot.endAt,
            holdExpiresAt,
            metadata: nextMetadata as Prisma.InputJsonValue,
          },
        });

        await publishAppointmentEvent({
          tx,
          event: "appointment.hold_created",
          businessId,
          aggregateId: row.id,
          payload: {
            businessId: row.businessId,
            appointmentId: row.id,
            appointmentKey: row.appointmentKey,
            leadId: row.leadId,
            traceId:
              String(toRecord(parseAppointmentMetadata(row.metadata)).traceId || "").trim() ||
              null,
            slotId: slot.id,
            slotKey: slot.slotKey,
            holdExpiresAt: holdExpiresAt.toISOString(),
          },
          eventKey: `${row.appointmentKey}:${slot.slotKey}:hold`,
        });

        await queueCalendarSyncRequestedInTx({
          tx,
          businessId,
          appointmentId: row.id,
          appointmentKey: row.appointmentKey,
          operation: "BLOCK_SLOT",
          fingerprint: `${slot.slotKey}:${holdExpiresAt.toISOString()}`,
          payload: {
            slotId: slot.id,
            slotKey: slot.slotKey,
            holdExpiresAt: holdExpiresAt.toISOString(),
          },
        });

        return row;
      });

      return {
        appointment: updated,
        holdToken: held.token,
        holdExpiresAt,
      };
    } finally {
      await Promise.allSettled([
        slotLock.release(),
        appointmentLock.release(),
      ]);
    }
  };

  const confirmSlot = async ({
    businessId,
    appointmentKey,
    holdToken = null,
    confirmedBy = "SELF",
  }: {
    businessId: string;
    appointmentKey: string;
    holdToken?: string | null;
    confirmedBy?: "AI" | "HUMAN" | "SELF";
  }) => {
    const appointmentLock = await createLockScope({
      key: buildAppointmentLockKey({
        businessId,
        appointmentKey,
      }),
    });

    try {
      const appointment = await prisma.appointmentLedger.findFirst({
        where: {
          businessId,
          appointmentKey,
        },
      });

      if (!appointment) {
        throw new Error("appointment_not_found");
      }

      if (["CONFIRMED", "RESCHEDULED", "REMINDER_SENT"].includes(appointment.status)) {
        return appointment;
      }

      if (appointment.status !== "HOLD") {
        throw new Error(`appointment_not_holding:${appointment.status}`);
      }

      if (!appointment.slotId) {
        throw new Error("appointment_slot_missing");
      }

      const slot = await prisma.availabilitySlot.findUnique({
        where: {
          id: appointment.slotId,
        },
      });

      if (!slot) {
        throw new Error("slot_not_found");
      }

      const hold = await readAppointmentSlotHold({
        businessId,
        slotKey: slot.slotKey,
      });

      if (holdToken && hold && hold.token !== holdToken) {
        throw new Error("hold_token_mismatch");
      }

      const confirmed = await prisma.$transaction(async (tx) => {
        const latest = await tx.appointmentLedger.findFirst({
          where: {
            id: appointment.id,
            businessId,
          },
        });

        if (!latest) {
          throw new Error("appointment_not_found");
        }

        const currentMetadata = parseAppointmentMetadata(latest.metadata);
        const nextMetadata = mergeAppointmentMetadata(currentMetadata, {
          confirmedBy,
          confirmedAt: new Date().toISOString(),
        });

        const row = await tx.appointmentLedger.update({
          where: {
            id: latest.id,
          },
          data: {
            status: "CONFIRMED",
            holdExpiresAt: null,
            metadata: nextMetadata as Prisma.InputJsonValue,
          },
        });

        await publishAppointmentEvent({
          tx,
          event: "appointment.confirmed",
          businessId,
          aggregateId: row.id,
          payload: {
            businessId: row.businessId,
            appointmentId: row.id,
            appointmentKey: row.appointmentKey,
            leadId: row.leadId,
            traceId: String(toRecord(nextMetadata).traceId || "").trim() || null,
            slotId: row.slotId || null,
            startAt: row.startAt ? row.startAt.toISOString() : null,
            endAt: row.endAt ? row.endAt.toISOString() : null,
          },
          eventKey: `${row.appointmentKey}:confirmed`,
        });

        await queueCalendarSyncRequestedInTx({
          tx,
          businessId,
          appointmentId: row.id,
          appointmentKey: row.appointmentKey,
          operation: "CREATE",
          fingerprint: `confirmed:${row.updatedAt.toISOString()}`,
          payload: {
            slotId: row.slotId || null,
            startAt: row.startAt ? row.startAt.toISOString() : null,
            endAt: row.endAt ? row.endAt.toISOString() : null,
          },
        });

        return row;
      });

      if (hold) {
        await releaseAppointmentSlotHold({
          businessId,
          slotKey: slot.slotKey,
          token: hold.token,
        }).catch(() => undefined);
      }

      const lead = await prisma.lead.findFirst({
        where: {
          id: confirmed.leadId,
          businessId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      });

      if (lead) {
        await syncLegacyAppointmentMirror({
          appointment: confirmed,
          lead,
        }).catch(() => undefined);
      }

      await Promise.allSettled([
        publishCRMRefreshEvent({
          businessId,
          leadId: confirmed.leadId,
          event: "booking_confirmed",
          waitForSync: false,
        }),
        recordSalesConversionEvent({
          businessId,
          leadId: confirmed.leadId,
          outcome: "BOOKED_CALL",
          idempotencyKey: `appointment_confirmed:${confirmed.appointmentKey}`,
        }),
        upsertRevenueTouchLedger({
          businessId,
          leadId: confirmed.leadId,
          touchType: "BOOKING",
          touchReason: "APPOINTMENT_CONFIRMED",
          channel: "SYSTEM",
          actor: confirmedBy,
          source: "APPOINTMENT_ENGINE",
          outboundKey: `booking:${confirmed.appointmentKey}:confirmed`,
          deliveryState: "CONFIRMED",
          confirmedAt: new Date(),
          metadata: {
            appointmentKey: confirmed.appointmentKey,
            appointmentId: confirmed.id,
          },
        }),
      ]);

      if (confirmed.startAt) {
        const confirmedMetadata = parseAppointmentMetadata(confirmed.metadata);
        const { appointmentReminderService } = await import(
          "./appointmentReminder.service"
        );
        await appointmentReminderService
          .scheduleCoreCadence({
            businessId,
            appointmentId: confirmed.id,
            appointmentKey: confirmed.appointmentKey,
            leadId: confirmed.leadId,
            startAt: confirmed.startAt,
            noShowRisk: Number(toRecord(confirmedMetadata).noShowRisk || 0),
            isVip: Number(toRecord(confirmedMetadata).vipScore || 0) >= 70,
          })
          .catch(() => undefined);
      }

      return confirmed;
    } finally {
      await appointmentLock.release().catch(() => undefined);
    }
  };

  const cancelAppointment = async ({
    businessId,
    appointmentKey,
    reason,
    actor = "SELF",
    isVip = false,
    isOwnerEscalation = false,
  }: {
    businessId: string;
    appointmentKey: string;
    reason: string;
    actor?: "AI" | "HUMAN" | "SELF" | "SYSTEM";
    isVip?: boolean;
    isOwnerEscalation?: boolean;
  }) => {
    const appointmentLock = await createLockScope({
      key: buildAppointmentLockKey({
        businessId,
        appointmentKey,
      }),
    });

    try {
      const appointment = await prisma.appointmentLedger.findFirst({
        where: {
          businessId,
          appointmentKey,
        },
      });

      if (!appointment) {
        throw new Error("appointment_not_found");
      }

      if (appointment.status === "CANCELLED") {
        return appointment;
      }

      if (isTerminalStatus(appointment.status)) {
        throw new Error(`appointment_terminal:${appointment.status}`);
      }

      const policy = await policyService.resolvePolicy({
        businessId,
        meetingType: appointment.meetingType,
      });
      const cancelPolicy = evaluateCancellationPolicy({
        policy,
        startAt: appointment.startAt,
        isVip,
        isOwnerEscalation,
      });

      const cancelled = await prisma.$transaction(async (tx) => {
        let slotKey: string | null = null;
        let slotId: string | null = null;

        if (appointment.slotId && isActiveStatus(appointment.status)) {
          const slot = await tx.availabilitySlot.findUnique({
            where: {
              id: appointment.slotId,
            },
          });

          if (slot) {
            slotKey = slot.slotKey;
            slotId = slot.id;

            await tx.availabilitySlot.update({
              where: {
                id: slot.id,
              },
              data: {
                reservedCount: {
                  decrement: slot.reservedCount > 0 ? 1 : 0,
                },
              },
            });

            await tx.slotReservationLedger.updateMany({
              where: {
                businessId,
                appointmentId: appointment.id,
                slotId: slot.id,
                releasedAt: null,
              },
              data: {
                releasedAt: new Date(),
              },
            });
          }
        }

        const nextMetadata = mergeAppointmentMetadata(
          parseAppointmentMetadata(appointment.metadata),
          {
            cancelledBy: actor,
            cancelledAt: new Date().toISOString(),
            cancellationPolicy: cancelPolicy,
          }
        );

        const updated = await tx.appointmentLedger.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: "CANCELLED",
            cancelReason: reason,
            holdExpiresAt: null,
            metadata: nextMetadata as Prisma.InputJsonValue,
          },
        });

        await publishAppointmentEvent({
          tx,
          event: "appointment.cancelled",
          businessId,
          aggregateId: updated.id,
          payload: {
            businessId: updated.businessId,
            appointmentId: updated.id,
            appointmentKey: updated.appointmentKey,
            leadId: updated.leadId,
            traceId:
              String(
                toRecord(parseAppointmentMetadata(updated.metadata)).traceId || ""
              ).trim() || null,
            reason,
          },
          eventKey: `${updated.appointmentKey}:cancelled:${reason}`,
        });

        await queueCalendarSyncRequestedInTx({
          tx,
          businessId,
          appointmentId: updated.id,
          appointmentKey: updated.appointmentKey,
          operation: "CANCEL",
          fingerprint: `${reason}:${updated.updatedAt.toISOString()}`,
          payload: {
            reason,
          },
        });

        if (slotKey) {
          await queueCalendarSyncRequestedInTx({
            tx,
            businessId,
            appointmentId: updated.id,
            appointmentKey: updated.appointmentKey,
            operation: "FREE_SLOT",
            fingerprint: `${slotKey}:${updated.updatedAt.toISOString()}`,
            payload: {
              slotKey,
              slotId,
            },
          });
        }

        return {
          updated,
          slotKey,
        };
      });

      if (cancelled.slotKey) {
        const hold = await readAppointmentSlotHold({
          businessId,
          slotKey: cancelled.slotKey,
        });

        if (hold?.token) {
          await releaseAppointmentSlotHold({
            businessId,
            slotKey: cancelled.slotKey,
            token: hold.token,
          }).catch(() => undefined);
        }
      }

      await Promise.allSettled([
        publishCRMRefreshEvent({
          businessId,
          leadId: cancelled.updated.leadId,
          event: "booking_cancelled",
          waitForSync: false,
        }),
        upsertRevenueTouchLedger({
          businessId,
          leadId: cancelled.updated.leadId,
          touchType: "BOOKING",
          touchReason: "APPOINTMENT_CANCELLED",
          channel: "SYSTEM",
          actor,
          source: "APPOINTMENT_ENGINE",
          outboundKey: `booking:${cancelled.updated.appointmentKey}:cancelled`,
          deliveryState: "CONFIRMED",
          confirmedAt: new Date(),
          metadata: {
            appointmentKey: cancelled.updated.appointmentKey,
            appointmentId: cancelled.updated.id,
            reason,
            cancellationPolicy: cancelPolicy,
          },
        }),
      ]);

      return cancelled.updated;
    } finally {
      await appointmentLock.release().catch(() => undefined);
    }
  };

  const bookDirect = async ({
    businessId,
    leadId,
    startAt,
    endAt,
    bookedBy = "SELF",
    source = "DIRECT_API",
    meetingType = "GENERAL",
    purpose = null,
    timezone = "UTC",
    locationType = "VIRTUAL",
    locationDetails = null,
    assignedHumanId = null,
    assignedTeam = null,
    priority = "MEDIUM",
    metadata = null,
    traceId = null,
  }: {
    businessId: string;
    leadId: string;
    startAt: Date;
    endAt: Date;
    bookedBy?: "AI" | "HUMAN" | "SELF";
    source?: string;
    meetingType?: string;
    purpose?: string | null;
    timezone?: string;
    locationType?: string;
    locationDetails?: Record<string, unknown> | null;
    assignedHumanId?: string | null;
    assignedTeam?: string | null;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    metadata?: Record<string, unknown> | null;
    traceId?: string | null;
  }) => {
    if (!(startAt instanceof Date) || !(endAt instanceof Date) || startAt >= endAt) {
      throw new Error("invalid_booking_window");
    }

    const slot = await ensureSlotExistsForDirectBooking({
      businessId,
      startAt,
      endAt,
      timezone: toSafeTimezone(timezone, "UTC"),
      humanId: assignedHumanId,
      teamId: assignedTeam,
    });
    const appointment = await requestAppointment({
      businessId,
      leadId,
      source,
      bookedBy,
      meetingType,
      purpose,
      priority,
      timezone,
      requestedWindow: {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
      durationMinutes: Math.max(5, Math.floor((endAt.getTime() - startAt.getTime()) / 60_000)),
      assignedHumanId,
      assignedTeam,
      locationType,
      locationDetails,
      interactionId: null,
      traceId,
      metadata,
    });

    const held = await holdSlot({
      businessId,
      appointmentKey: appointment.appointmentKey,
      slotKey: slot.slotKey,
      heldBy: bookedBy,
      holdTtlMinutes: 15,
    });

    const confirmed = await confirmSlot({
      businessId,
      appointmentKey: appointment.appointmentKey,
      holdToken: held.holdToken,
      confirmedBy: bookedBy,
    });

    return confirmed;
  };

  const markReminderSent = async ({
    businessId,
    appointmentKey,
    reminderType,
    channel,
  }: {
    businessId: string;
    appointmentKey: string;
    reminderType: string;
    channel: string;
  }) => {
    const updated = await stateService.transition({
      businessId,
      appointmentKey,
      nextState: "REMINDER_SENT",
      reason: `reminder_sent:${reminderType}:${channel}`,
    });

    await publishAppointmentEvent({
      event: "appointment.reminder_sent",
      businessId,
      aggregateId: updated.id,
      payload: {
        businessId: updated.businessId,
        appointmentId: updated.id,
        appointmentKey: updated.appointmentKey,
        leadId: updated.leadId,
        traceId:
          String(toRecord(parseAppointmentMetadata(updated.metadata)).traceId || "").trim() ||
          null,
        reminderType,
        channel,
      },
      eventKey: `${updated.appointmentKey}:${reminderType}:sent`,
    });

    return updated;
  };

  const reconcileExpiredHolds = async ({ now = new Date() }: { now?: Date } = {}) => {
    const expired = await prisma.appointmentLedger.findMany({
      where: {
        status: "HOLD",
        holdExpiresAt: {
          lte: now,
        },
      },
      take: 100,
      orderBy: {
        holdExpiresAt: "asc",
      },
    });

    for (const appointment of expired) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const current = await tx.appointmentLedger.findUnique({
            where: {
              id: appointment.id,
            },
          });

          if (!current || current.status !== "HOLD") {
            return {
              slotKey: null as string | null,
            };
          }

          let slotKey: string | null = null;
          let slotId: string | null = null;

          if (current.slotId) {
            const slot = await tx.availabilitySlot.findUnique({
              where: {
                id: current.slotId,
              },
            });

            if (slot) {
              slotKey = slot.slotKey;
              slotId = slot.id;

              await tx.availabilitySlot.update({
                where: {
                  id: slot.id,
                },
                data: {
                  reservedCount: {
                    decrement: slot.reservedCount > 0 ? 1 : 0,
                  },
                },
              });

              await tx.slotReservationLedger.updateMany({
                where: {
                  businessId: current.businessId,
                  appointmentId: current.id,
                  slotId: slot.id,
                  releasedAt: null,
                },
                data: {
                  releasedAt: now,
                },
              });
            }
          }

          const nextMetadata = mergeAppointmentMetadata(
            parseAppointmentMetadata(current.metadata),
            {
              holdExpiredAt: now.toISOString(),
              holdExpiredReason: "hold_ttl_expired",
            }
          );

          const updated = await tx.appointmentLedger.update({
            where: {
              id: current.id,
            },
            data: {
              status: "EXPIRED",
              holdExpiresAt: null,
              metadata: nextMetadata as Prisma.InputJsonValue,
            },
          });

          await publishAppointmentEvent({
            tx,
            event: "appointment.expired",
            businessId: updated.businessId,
            aggregateId: updated.id,
            payload: {
              businessId: updated.businessId,
              appointmentId: updated.id,
              appointmentKey: updated.appointmentKey,
              leadId: updated.leadId,
              traceId:
                String(toRecord(parseAppointmentMetadata(updated.metadata)).traceId || "").trim() ||
                null,
              expiredAt: now.toISOString(),
              reason: "hold_ttl_expired",
            },
            eventKey: `${updated.appointmentKey}:expired:${now.toISOString()}`,
          });

          if (slotKey) {
            await queueCalendarSyncRequestedInTx({
              tx,
              businessId: updated.businessId,
              appointmentId: updated.id,
              appointmentKey: updated.appointmentKey,
              operation: "FREE_SLOT",
              fingerprint: `${slotKey}:${now.toISOString()}`,
              payload: {
                slotKey,
                slotId,
                reason: "hold_ttl_expired",
              },
            });
          }

          return {
            slotKey,
          };
        });

        if (result.slotKey) {
          const hold = await readAppointmentSlotHold({
            businessId: appointment.businessId,
            slotKey: result.slotKey,
          });

          if (hold?.token) {
            await releaseAppointmentSlotHold({
              businessId: appointment.businessId,
              slotKey: result.slotKey,
              token: hold.token,
            }).catch(() => undefined);
          }
        }
      } catch {
        // intentionally best-effort; cron + queue retries will reattempt
      }
    }

    return {
      count: expired.length,
    };
  };

  const getActiveAppointmentByLead = async ({
    businessId,
    leadId,
  }: {
    businessId: string;
    leadId: string;
  }) =>
    prisma.appointmentLedger.findFirst({
      where: {
        businessId,
        leadId,
        status: {
          in: [
            "REQUESTED",
            "PROPOSED",
            "HOLD",
            "CONFIRMED",
            "RESCHEDULED",
            "REMINDER_SENT",
            "CHECKED_IN",
            "LATE_JOIN",
            "IN_PROGRESS",
          ],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  return {
    requestAppointment,
    checkAvailability,
    holdSlot,
    confirmSlot,
    cancelAppointment,
    bookDirect,
    markReminderSent,
    reconcileExpiredHolds,
    getActiveAppointmentByLead,
    transitionState: stateService.transition,
    enqueueAutonomousFollowup: async ({
      leadId,
    }: {
      leadId: string;
    }) => {
      await scheduleFollowups(leadId, {
        trigger: "no_reply",
      }).catch(() => undefined);
    },
  };
};

export const appointmentEngineService = createAppointmentEngineService();
