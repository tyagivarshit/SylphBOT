import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { withDistributedLock } from "../distributedLock.service";

export type CapReservationDecision = {
  granted: boolean;
  reason: string;
  reservation: {
    id: string;
    reservationKey: string;
    status: string;
  } | null;
  activeReservations: number;
  maxReservations: number;
};

const ACTIVE_RESERVATION_STATUSES = ["RESERVED", "CONSUMED"];

const buildWindowKey = ({
  ruleKey,
  windowDays,
  now,
}: {
  ruleKey: string;
  windowDays: number;
  now: Date;
}) => {
  const windowStart = new Date(
    now.getTime() - windowDays * 24 * 60 * 60 * 1000
  );
  return `${ruleKey}:${windowDays}d:${windowStart.toISOString().slice(0, 10)}`;
};

export const reserveAutonomousCap = async ({
  businessId,
  leadId,
  channel,
  ruleKey,
  maxReservations,
  windowDays,
  reservationKey,
  reason,
  opportunityId,
  campaignId,
  metadata,
  now = new Date(),
}: {
  businessId: string;
  leadId: string;
  channel: string;
  ruleKey: string;
  maxReservations: number;
  windowDays: number;
  reservationKey: string;
  reason: string;
  opportunityId?: string | null;
  campaignId?: string | null;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}): Promise<CapReservationDecision> => {
  const existing = await prisma.autonomousCapReservation.findUnique({
    where: {
      reservationKey,
    },
    select: {
      id: true,
      reservationKey: true,
      status: true,
    },
  });

  if (existing) {
    return {
      granted: existing.status !== "RELEASED",
      reason: "duplicate_reservation",
      reservation: existing,
      activeReservations: 0,
      maxReservations,
    };
  }

  const since = new Date(
    now.getTime() - windowDays * 24 * 60 * 60 * 1000
  );
  const lockKey = `autonomous_cap:${businessId}:${leadId}:${channel}:${ruleKey}`;

  return withDistributedLock({
    key: lockKey,
    ttlMs: 10_000,
    waitMs: 1_500,
    pollMs: 50,
    refreshIntervalMs: 3_000,
    run: async () => {
      const activeReservations = await prisma.autonomousCapReservation.count({
        where: {
          businessId,
          leadId,
          channel,
          ruleKey,
          status: {
            in: ACTIVE_RESERVATION_STATUSES,
          },
          reservedAt: {
            gte: since,
          },
        },
      });

      if (activeReservations >= maxReservations) {
        return {
          granted: false,
          reason: "cap_reached",
          reservation: null,
          activeReservations,
          maxReservations,
        };
      }

      const reservation = await prisma.autonomousCapReservation.create({
        data: {
          businessId,
          leadId,
          opportunityId: opportunityId || null,
          campaignId: campaignId || null,
          reservationKey,
          channel,
          windowKey: buildWindowKey({
            ruleKey,
            windowDays,
            now,
          }),
          ruleKey,
          status: "RESERVED",
          reason,
          reservedAt: now,
          metadata: metadata
            ? (metadata as Prisma.InputJsonValue)
            : undefined,
        },
        select: {
          id: true,
          reservationKey: true,
          status: true,
        },
      });

      return {
        granted: true,
        reason: "reserved",
        reservation,
        activeReservations: activeReservations + 1,
        maxReservations,
      };
    },
  });
};

export const consumeAutonomousCapReservation = async ({
  reservationKey,
}: {
  reservationKey: string;
}) =>
  prisma.autonomousCapReservation.updateMany({
    where: {
      reservationKey,
      status: "RESERVED",
    },
    data: {
      status: "CONSUMED",
      consumedAt: new Date(),
    },
  });

export const releaseAutonomousCapReservation = async ({
  reservationKey,
}: {
  reservationKey: string;
}) =>
  prisma.autonomousCapReservation.updateMany({
    where: {
      reservationKey,
      status: {
        in: ["RESERVED", "CONSUMED"],
      },
    },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
    },
  });
