import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { acquireDistributedLock } from "./distributedLock.service";
import { createBookingPolicyService, evaluateReschedulePolicy } from "./bookingPolicy.service";
import { publishAppointmentEvent } from "./appointmentEvent.service";
import { createDurableOutboxEvent } from "./eventOutbox.service";
import { publishCRMRefreshEvent } from "./crm/refreshEvents.service";
import { mergeAppointmentMetadata, parseAppointmentMetadata } from "./appointment.shared";
import { toRecord } from "./reception.shared";
import { appointmentReminderService } from "./appointmentReminder.service";

const LOCK_TTL_MS = 10_000;
const LOCK_WAIT_MS = 2_000;

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

const buildAppointmentLockKey = ({
  businessId,
  appointmentKey,
}: {
  businessId: string;
  appointmentKey: string;
}) => `appointment:ledger:${businessId}:${appointmentKey}`;

const buildSlotLockKey = ({
  businessId,
  slotId,
}: {
  businessId: string;
  slotId: string;
}) => `appointment:slot:${businessId}:${slotId}`;

const withRescheduleLocks = async <T>({
  businessId,
  appointmentKey,
  oldSlotId,
  newSlotId,
  run,
}: {
  businessId: string;
  appointmentKey: string;
  oldSlotId?: string | null;
  newSlotId: string;
  run: () => Promise<T>;
}) => {
  const keys = [
    buildAppointmentLockKey({
      businessId,
      appointmentKey,
    }),
    ...(oldSlotId
      ? [
          buildSlotLockKey({
            businessId,
            slotId: oldSlotId,
          }),
        ]
      : []),
    buildSlotLockKey({
      businessId,
      slotId: newSlotId,
    }),
  ];
  const locks = [];

  try {
    for (const key of keys) {
      const lock = await acquireDistributedLock({
        key,
        ttlMs: LOCK_TTL_MS,
        waitMs: LOCK_WAIT_MS,
      });

      if (!lock) {
        throw new Error(`lock_unavailable:${key}`);
      }

      locks.push(lock);
    }

    return await run();
  } finally {
    await Promise.allSettled(locks.map((lock) => lock.release()));
  }
};

const syncLegacyReschedule = async ({
  businessId,
  leadId,
  startAt,
  endAt,
  meetingJoinUrl,
}: {
  businessId: string;
  leadId: string;
  startAt: Date;
  endAt: Date;
  meetingJoinUrl?: string | null;
}) => {
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      businessId,
    },
    select: {
      name: true,
      email: true,
      phone: true,
    },
  });
  const existing = await prisma.appointment.findFirst({
    where: {
      businessId,
      leadId,
      status: {
        in: ["CONFIRMED", "RESCHEDULED"],
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (existing) {
    return prisma.appointment.updateMany({
      where: {
        id: existing.id,
        businessId,
      },
      data: {
        startTime: startAt,
        endTime: endAt,
        status: "CONFIRMED",
        meetingLink: meetingJoinUrl || existing.meetingLink || null,
      },
    });
  }

  return prisma.appointment.create({
    data: {
      businessId,
      leadId,
      name: String(lead?.name || lead?.email || lead?.phone || "Customer"),
      email: lead?.email || null,
      phone: lead?.phone || null,
      startTime: startAt,
      endTime: endAt,
      status: "CONFIRMED",
      meetingLink: meetingJoinUrl || null,
    },
  });
};

export const createRescheduleEngineService = ({
  policyService = createBookingPolicyService(),
}: {
  policyService?: ReturnType<typeof createBookingPolicyService>;
} = {}) => ({
  reschedule: async ({
    businessId,
    appointmentKey,
    newSlotKey,
    actor = "SELF",
    reason = "user_requested",
    isVip = false,
    isOwnerEscalation = false,
  }: {
    businessId: string;
    appointmentKey: string;
    newSlotKey: string;
    actor?: "AI" | "HUMAN" | "SELF" | "SYSTEM";
    reason?: string;
    isVip?: boolean;
    isOwnerEscalation?: boolean;
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

    if (["CANCELLED", "COMPLETED", "NO_SHOW", "EXPIRED"].includes(appointment.status)) {
      throw new Error(`appointment_terminal:${appointment.status}`);
    }

    const oldSlotId = appointment.slotId || null;
    const newSlot = await prisma.availabilitySlot.findFirst({
      where: {
        businessId,
        slotKey: newSlotKey,
      },
    });

    if (!newSlot) {
      throw new Error("slot_not_found");
    }

    const policy = await policyService.resolvePolicy({
      businessId,
      meetingType: appointment.meetingType,
    });
    const reschedulePolicy = evaluateReschedulePolicy({
      policy,
      rescheduleCount: appointment.rescheduleCount,
      isVip,
      isOwnerEscalation,
    });

    if (!reschedulePolicy.allowed) {
      throw new Error(reschedulePolicy.reason);
    }

    return withRescheduleLocks({
      businessId,
      appointmentKey,
      oldSlotId,
      newSlotId: newSlot.id,
      run: async () => {
        const updated = await prisma.$transaction(async (tx) => {
          const current = await tx.appointmentLedger.findFirst({
            where: {
              id: appointment.id,
            },
          });

          if (!current) {
            throw new Error("appointment_not_found");
          }

          if (current.slotId) {
            const oldSlot = await tx.availabilitySlot.findUnique({
              where: {
                id: current.slotId,
              },
            });

            if (oldSlot) {
              await tx.availabilitySlot.update({
                where: {
                  id: oldSlot.id,
                },
                data: {
                  reservedCount: {
                    decrement: oldSlot.reservedCount > 0 ? 1 : 0,
                  },
                },
              });

              await tx.slotReservationLedger.updateMany({
                where: {
                  businessId,
                  appointmentId: current.id,
                  slotId: oldSlot.id,
                  releasedAt: null,
                },
                data: {
                  releasedAt: new Date(),
                },
              });
            }
          }

          const latestNewSlot = await tx.availabilitySlot.findUnique({
            where: {
              id: newSlot.id,
            },
          });

          if (!latestNewSlot) {
            throw new Error("slot_not_found");
          }

          if (latestNewSlot.blocked) {
            throw new Error("slot_blocked");
          }

          if (latestNewSlot.reservedCount >= latestNewSlot.capacity) {
            throw new Error("slot_capacity_exhausted");
          }

          await tx.availabilitySlot.update({
            where: {
              id: latestNewSlot.id,
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
              appointmentId: current.id,
              slotId: latestNewSlot.id,
              reason: "RESCHEDULE",
              reservedBy: actor,
              metadata: {
                reason,
              } as Prisma.InputJsonValue,
            },
          });

          const nextMetadata = mergeAppointmentMetadata(
            parseAppointmentMetadata(current.metadata),
            {
              lastRescheduledAt: new Date().toISOString(),
              rescheduledBy: actor,
              rescheduleReason: reason,
              previousSlotId: current.slotId,
              currentSlotId: latestNewSlot.id,
            }
          );

          const row = await tx.appointmentLedger.update({
            where: {
              id: current.id,
            },
            data: {
              status: "RESCHEDULED",
              slotId: latestNewSlot.id,
              startAt: latestNewSlot.startAt,
              endAt: latestNewSlot.endAt,
              holdExpiresAt: null,
              rescheduleCount: {
                increment: 1,
              },
              metadata: nextMetadata as Prisma.InputJsonValue,
            },
          });

          await publishAppointmentEvent({
            tx,
            event: "appointment.rescheduled",
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
              fromSlotId: oldSlotId,
              toSlotId: row.slotId || null,
              rescheduleCount: row.rescheduleCount,
            },
            eventKey: `${row.appointmentKey}:rescheduled:${row.rescheduleCount}`,
          });

          await queueCalendarSyncRequestedInTx({
            tx,
            businessId,
            appointmentId: row.id,
            appointmentKey: row.appointmentKey,
            operation: "RESCHEDULE",
            fingerprint: `${row.rescheduleCount}:${row.updatedAt.toISOString()}`,
            payload: {
              fromSlotId: oldSlotId,
              toSlotId: row.slotId || null,
              startAt: row.startAt ? row.startAt.toISOString() : null,
              endAt: row.endAt ? row.endAt.toISOString() : null,
            },
          });

          if (oldSlotId) {
            await queueCalendarSyncRequestedInTx({
              tx,
              businessId,
              appointmentId: row.id,
              appointmentKey: row.appointmentKey,
              operation: "FREE_SLOT",
              fingerprint: `${oldSlotId}:${row.rescheduleCount}`,
              payload: {
                slotId: oldSlotId,
              },
            });
          }

          await queueCalendarSyncRequestedInTx({
            tx,
            businessId,
            appointmentId: row.id,
            appointmentKey: row.appointmentKey,
            operation: "BLOCK_SLOT",
            fingerprint: `${latestNewSlot.id}:${row.rescheduleCount}`,
            payload: {
              slotId: latestNewSlot.id,
              slotKey: latestNewSlot.slotKey,
            },
          });

          await tx.calendarSyncLedger.upsert({
            where: {
              dedupeKey: `calendar_resync:${businessId}:${row.id}:${row.rescheduleCount}`,
            },
            update: {
              syncStatus: "PENDING",
              conflictDetected: false,
            },
            create: {
              businessId,
              appointmentId: row.id,
              provider: "INTERNAL",
              syncStatus: "PENDING",
              conflictDetected: false,
              dedupeKey: `calendar_resync:${businessId}:${row.id}:${row.rescheduleCount}`,
              metadata: {
                source: "reschedule_engine",
              } as Prisma.InputJsonValue,
            },
          });

          return row;
        });

        await Promise.allSettled([
          syncLegacyReschedule({
            businessId,
            leadId: updated.leadId,
            startAt: updated.startAt!,
            endAt: updated.endAt!,
            meetingJoinUrl: updated.meetingJoinUrl,
          }),
          publishCRMRefreshEvent({
            businessId,
            leadId: updated.leadId,
            event: "booking_rescheduled",
            waitForSync: false,
          }),
          updated.startAt
            ? appointmentReminderService.scheduleCoreCadence({
                businessId,
                appointmentId: updated.id,
                appointmentKey: updated.appointmentKey,
                leadId: updated.leadId,
                startAt: updated.startAt,
              })
            : Promise.resolve(),
        ]);

        return updated;
      },
    });
  },
});

export const rescheduleEngineService = createRescheduleEngineService();
