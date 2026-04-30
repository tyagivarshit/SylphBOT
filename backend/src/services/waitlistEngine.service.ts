import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { acquireDistributedLock } from "./distributedLock.service";
import { appointmentEngineService } from "./appointmentEngine.service";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { mergeAppointmentMetadata, parseAppointmentMetadata } from "./appointment.shared";
import { toRecord } from "./reception.shared";

const WAITLIST_LOCK_TTL_MS = 8_000;
const WAITLIST_LOCK_WAIT_MS = 1_500;

const buildWaitlistSlotLockKey = ({
  businessId,
  slotId,
}: {
  businessId: string;
  slotId: string;
}) => `waitlist:slot:${businessId}:${slotId}`;

const deterministicWaitlistSort = (left: any, right: any) => {
  if (right.priorityScore !== left.priorityScore) {
    return right.priorityScore - left.priorityScore;
  }

  const requestedDelta = left.requestedAt.getTime() - right.requestedAt.getTime();

  if (requestedDelta !== 0) {
    return requestedDelta;
  }

  return left.id.localeCompare(right.id);
};

export const createWaitlistEngineService = () => ({
  addRequest: async ({
    businessId,
    leadId,
    meetingType,
    slotId = null,
    appointmentId = null,
    priorityScore = 0,
    reason = null,
    metadata = null,
  }: {
    businessId: string;
    leadId: string;
    meetingType: string;
    slotId?: string | null;
    appointmentId?: string | null;
    priorityScore?: number;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId,
    }).catch(() => null);
    const intelligencePriorityBoost =
      Number(runtime?.controls.booking.waitlistPriorityBoost || 0) +
      Number(runtime?.controls.crm.priorityDelta || 0);
    const adjustedPriorityScore = Math.max(
      0,
      Math.floor(Number(priorityScore || 0) + intelligencePriorityBoost)
    );
    const row = await prisma.waitlistLedger.create({
      data: {
        businessId,
        leadId,
        meetingType: String(meetingType || "GENERAL").trim().toUpperCase(),
        slotId,
        appointmentId,
        priorityScore: adjustedPriorityScore,
        reason,
        metadata: mergeAppointmentMetadata(parseAppointmentMetadata(metadata), {
          intelligencePriorityBoost,
          intelligencePolicyVersion: runtime?.policyVersion || null,
        }) as Prisma.InputJsonValue,
      },
    });

    return row;
  },

  cancelRequest: async ({
    businessId,
    waitlistId,
    reason = "cancelled_by_user",
  }: {
    businessId: string;
    waitlistId: string;
    reason?: string;
  }) =>
    prisma.waitlistLedger.updateMany({
      where: {
        id: waitlistId,
        businessId,
        status: "WAITING",
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        reason,
      },
    }),

  fillFreedSlot: async ({
    businessId,
    slotId,
  }: {
    businessId: string;
    slotId: string;
  }) => {
    const lock = await acquireDistributedLock({
      key: buildWaitlistSlotLockKey({
        businessId,
        slotId,
      }),
      ttlMs: WAITLIST_LOCK_TTL_MS,
      waitMs: WAITLIST_LOCK_WAIT_MS,
    });

    if (!lock) {
      return {
        filled: false,
        reason: "waitlist_lock_unavailable",
      };
    }

    try {
      const slot = await prisma.availabilitySlot.findFirst({
        where: {
          id: slotId,
          businessId,
        },
      });

      if (!slot) {
        return {
          filled: false,
          reason: "slot_not_found",
        };
      }

      const candidates = await prisma.waitlistLedger.findMany({
        where: {
          businessId,
          status: "WAITING",
          OR: [
            {
              slotId,
            },
            {
              slotId: null,
              meetingType: String(toRecord(slot.metadata).meetingType || "GENERAL")
                .trim()
                .toUpperCase(),
            },
          ],
        },
      });

      if (!candidates.length) {
        return {
          filled: false,
          reason: "no_waitlist_candidates",
        };
      }

      const chosen = [...candidates].sort(deterministicWaitlistSort)[0];
      const claimed = await prisma.waitlistLedger.updateMany({
        where: {
          id: chosen.id,
          status: "WAITING",
        },
        data: {
          status: "FILLED",
          filledAt: new Date(),
        },
      });

      if (claimed.count !== 1) {
        return {
          filled: false,
          reason: "candidate_claim_race_lost",
        };
      }

      const appointment = await appointmentEngineService.bookDirect({
        businessId,
        leadId: chosen.leadId,
        startAt: slot.startAt,
        endAt: slot.endAt,
        bookedBy: "AI",
        source: "WAITLIST_AUTOFILL",
        meetingType: chosen.meetingType,
        timezone: slot.timezone,
        metadata: {
          waitlistEntryId: chosen.id,
        },
      });

      await prisma.waitlistLedger.update({
        where: {
          id: chosen.id,
        },
        data: {
          appointmentId: appointment.id,
          metadata: mergeAppointmentMetadata(parseAppointmentMetadata(chosen.metadata), {
            autoFilledAppointmentKey: appointment.appointmentKey,
          }) as Prisma.InputJsonValue,
        },
      });

      await publishAppointmentEvent({
        event: "appointment.waitlist_filled",
        businessId,
        aggregateId: appointment.id,
        payload: {
          businessId,
          appointmentId: appointment.id,
          appointmentKey: appointment.appointmentKey,
          leadId: appointment.leadId,
          traceId: null,
          waitlistEntryId: chosen.id,
          slotId: slot.id,
        },
        eventKey: `${appointment.appointmentKey}:waitlist:${chosen.id}`,
      });

      return {
        filled: true,
        waitlistId: chosen.id,
        appointmentKey: appointment.appointmentKey,
      };
    } catch (error) {
      await prisma.waitlistLedger.updateMany({
        where: {
          businessId,
          slotId,
          status: "FILLED",
          appointmentId: null,
        },
        data: {
          status: "WAITING",
          filledAt: null,
        },
      });

      throw error;
    } finally {
      await lock.release().catch(() => undefined);
    }
  },
});

export const waitlistEngineService = createWaitlistEngineService();
