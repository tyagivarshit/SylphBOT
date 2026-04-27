import prisma from "../config/prisma";
import { createReceptionMemoryService } from "./receptionMemory.service";
import {
  observeReceptionDuration,
  incrementReceptionMetric,
} from "./receptionMetrics.service";
import { transitionInboundInteraction } from "./inboundLifecycle.service";

const receptionMemory = createReceptionMemoryService();

export const createInteractionResolutionService = () => ({
  startProgress: async ({
    interactionId,
    actorId,
    now = new Date(),
  }: {
    interactionId: string;
    actorId?: string | null;
    now?: Date;
  }) => {
    const interaction = await prisma.$transaction(async (tx) => {
      const updated = await transitionInboundInteraction({
        tx,
        interactionId,
        expectedCurrentStates: ["ROUTED", "REOPENED", "IN_PROGRESS"],
        nextState: "IN_PROGRESS",
        allowSameState: true,
        metadata: {
          firstResponseAt: now.toISOString(),
          lastResolutionActorId: actorId || null,
        },
      });

      await tx.humanWorkQueue.updateMany({
        where: {
          interactionId,
        },
        data: {
          state: "IN_PROGRESS",
        },
      });

      return updated;
    });

    observeReceptionDuration(
      "avg_first_response_time",
      now.getTime() - interaction.createdAt.getTime()
    );

    return interaction;
  },
  resolve: async ({
    interactionId,
    resolutionCode,
    resolutionScore,
    actorId,
    now = new Date(),
  }: {
    interactionId: string;
    resolutionCode?: string | null;
    resolutionScore?: number | null;
    actorId?: string | null;
    now?: Date;
  }) => {
    const interaction = await prisma.$transaction(async (tx) => {
      const updated = await transitionInboundInteraction({
        tx,
        interactionId,
        expectedCurrentStates: ["IN_PROGRESS", "RESOLVED"],
        nextState: "RESOLVED",
        allowSameState: true,
        metadata: {
          resolvedAt: now.toISOString(),
          resolutionCode: resolutionCode || null,
          lastResolutionActorId: actorId || null,
        },
      });

      await tx.humanWorkQueue.updateMany({
        where: {
          interactionId,
        },
        data: {
          state: "RESOLVED",
          resolutionCode: resolutionCode || null,
        },
      });

      return updated;
    });

    await receptionMemory.recordResolution({
      interaction,
      resolutionCode: resolutionCode || null,
      resolutionScore,
      now,
    });

    observeReceptionDuration(
      "avg_resolution_time",
      now.getTime() - interaction.createdAt.getTime()
    );
    incrementReceptionMetric("resolved_total");

    return interaction;
  },
  close: async ({
    interactionId,
    actorId,
    now = new Date(),
  }: {
    interactionId: string;
    actorId?: string | null;
    now?: Date;
  }) => {
    return prisma.$transaction(async (tx) => {
      const interaction = await transitionInboundInteraction({
        tx,
        interactionId,
        expectedCurrentStates: ["RESOLVED", "CLOSED"],
        nextState: "CLOSED",
        allowSameState: true,
        metadata: {
          closedAt: now.toISOString(),
          lastResolutionActorId: actorId || null,
        },
      });

      await tx.humanWorkQueue.updateMany({
        where: {
          interactionId,
        },
        data: {
          state: "CLOSED",
        },
      });

      return interaction;
    });
  },
  reopen: async ({
    interactionId,
    reason,
    actorId,
    now = new Date(),
  }: {
    interactionId: string;
    reason?: string | null;
    actorId?: string | null;
    now?: Date;
  }) => {
    const interaction = await prisma.$transaction(async (tx) => {
      const updated = await transitionInboundInteraction({
        tx,
        interactionId,
        expectedCurrentStates: ["RESOLVED", "REOPENED"],
        nextState: "REOPENED",
        allowSameState: true,
        metadata: {
          reopenedAt: now.toISOString(),
          reopenReason: reason || "reopened",
          lastResolutionActorId: actorId || null,
        },
      });

      await tx.humanWorkQueue.updateMany({
        where: {
          interactionId,
        },
        data: {
          state: "PENDING",
        },
      });

      return updated;
    });

    await receptionMemory.recordReopen({
      interaction,
      reopenReason: reason || "reopened",
      now,
    });
    incrementReceptionMetric("reopened_total");

    return interaction;
  },
});
