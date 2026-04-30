import prisma from "../config/prisma";
import { publishHumanOpsEvent } from "./humanOpsEvent.service";
import { mergeJsonRecords, toRecord, type JsonRecord } from "./reception.shared";
import { publishReceptionEvent } from "./receptionEvent.service";

const SUPPRESS_YEARS = 100;

const buildSuppressUntil = (changedAt: Date) => {
  const suppressUntil = new Date(changedAt.getTime());
  suppressUntil.setFullYear(suppressUntil.getFullYear() + SUPPRESS_YEARS);
  return suppressUntil;
};

type TakeoverOpenResult = {
  ledgerId: string;
  queueId: string;
  interactionId: string;
  businessId: string;
  leadId: string;
  assignedTo: string;
  cancelTokenVersion: number;
};

type TakeoverReleaseResult = {
  ledgerId: string;
  interactionId: string;
  queueId: string | null;
  businessId: string;
  leadId: string;
  assignedTo: string | null;
  outcome: string | null;
  durationMs: number | null;
};

const resolveBusinessInteraction = async (db: any, interactionId: string) => {
  const interaction = await db.inboundInteraction.findUnique({
    where: { id: interactionId },
    select: {
      id: true,
      businessId: true,
      leadId: true,
      assignedQueueId: true,
      metadata: true,
      lifecycleState: true,
      externalInteractionKey: true,
      traceId: true,
    },
  });

  if (!interaction) {
    throw new Error(`interaction_not_found:${interactionId}`);
  }

  return interaction;
};

export const createTakeoverLedgerService = (db: any = prisma) => ({
  openTakeover: async ({
    interactionId,
    assignedTo,
    reason,
    requestedBy,
    metadata,
    acceptedAt = new Date(),
  }: {
    interactionId: string;
    assignedTo: string;
    reason: string;
    requestedBy?: string | null;
    metadata?: JsonRecord | null;
    acceptedAt?: Date;
  }): Promise<TakeoverOpenResult> => {
    const interaction = await resolveBusinessInteraction(db, interactionId);
    const queue =
      interaction.assignedQueueId &&
      (await db.humanWorkQueue.findUnique({
        where: {
          id: interaction.assignedQueueId,
        },
        select: {
          id: true,
          assignedRole: true,
          metadata: true,
        },
      }));

    if (!queue) {
      throw new Error(`human_queue_not_found_for_interaction:${interactionId}`);
    }

    const result = await db.$transaction(async (tx: any) => {
      const takeoverMetadata = mergeJsonRecords(metadata, {
        action: "OPEN",
        immutable: true,
      });
      const ledger = await tx.humanTakeoverLedger.create({
        data: {
          businessId: interaction.businessId,
          interactionId: interaction.id,
          leadId: interaction.leadId,
          reason,
          requestedBy: requestedBy || null,
          assignedTo,
          acceptedAt,
          metadata: takeoverMetadata as any,
        },
        select: {
          id: true,
        },
      });

      const controlState = await tx.leadControlState.upsert({
        where: {
          leadId: interaction.leadId,
        },
        update: {
          cancelTokenVersion: {
            increment: 1,
          },
          manualSuppressUntil: buildSuppressUntil(acceptedAt),
          lastHumanTakeoverAt: acceptedAt,
          metadata: mergeJsonRecords(
            null,
            {
              takeover: {
                active: true,
                by: assignedTo,
                reason,
                openedAt: acceptedAt.toISOString(),
              },
            }
          ) as any,
        },
        create: {
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          cancelTokenVersion: 1,
          manualSuppressUntil: buildSuppressUntil(acceptedAt),
          lastHumanTakeoverAt: acceptedAt,
          metadata: {
            takeover: {
              active: true,
              by: assignedTo,
              reason,
              openedAt: acceptedAt.toISOString(),
            },
          } as any,
        },
        select: {
          cancelTokenVersion: true,
        },
      });

      const queueCurrent = await tx.humanWorkQueue.findUnique({
        where: { id: queue.id },
        select: { metadata: true },
      });
      const interactionCurrent = await tx.inboundInteraction.findUnique({
        where: { id: interaction.id },
        select: { metadata: true, lifecycleState: true },
      });

      await tx.humanWorkQueue.update({
        where: {
          id: queue.id,
        },
        data: {
          state: "IN_PROGRESS",
          assignedHumanId: assignedTo,
          metadata: mergeJsonRecords(toRecord(queueCurrent?.metadata), {
            takeover: {
              active: true,
              assignedTo,
              reason,
              ledgerId: ledger.id,
              cancelTokenVersion: controlState.cancelTokenVersion,
              openedAt: acceptedAt.toISOString(),
            },
          }) as any,
        },
      });

      await tx.inboundInteraction.update({
        where: {
          id: interaction.id,
        },
        data: {
          assignedHumanId: assignedTo,
          lifecycleState:
            interactionCurrent?.lifecycleState === "ROUTED"
              ? ("IN_PROGRESS" as any)
              : undefined,
          metadata: mergeJsonRecords(toRecord(interactionCurrent?.metadata), {
            takeover: {
              active: true,
              assignedTo,
              reason,
              ledgerId: ledger.id,
              cancelTokenVersion: controlState.cancelTokenVersion,
              openedAt: acceptedAt.toISOString(),
            },
          }) as any,
        },
      });

      await tx.lead.update({
        where: {
          id: interaction.leadId,
        },
        data: {
          isHumanActive: true,
        },
      });

      return {
        ledgerId: ledger.id,
        queueId: queue.id,
        interactionId: interaction.id,
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        assignedTo,
        cancelTokenVersion: Number(controlState.cancelTokenVersion || 0),
      };
    });

    await publishHumanOpsEvent({
      event: "human.takeover.opened",
      businessId: result.businessId,
      aggregateType: "human_takeover_ledger",
      aggregateId: result.ledgerId,
      eventKey: `${result.interactionId}:${result.assignedTo}`,
      payload: {
        ledgerId: result.ledgerId,
        queueId: result.queueId,
        interactionId: result.interactionId,
        businessId: result.businessId,
        leadId: result.leadId,
        assignedTo: result.assignedTo,
        reason,
        cancelTokenVersion: result.cancelTokenVersion,
      },
    });

    return result;
  },
  releaseTakeover: async ({
    interactionId,
    outcome,
    assignedTo,
    releasedAt = new Date(),
    metadata,
  }: {
    interactionId: string;
    outcome?: string | null;
    assignedTo?: string | null;
    releasedAt?: Date;
    metadata?: JsonRecord | null;
  }): Promise<TakeoverReleaseResult> => {
    const interaction = await resolveBusinessInteraction(db, interactionId);
    const lastOpen = await db.humanTakeoverLedger.findFirst({
      where: {
        interactionId: interaction.id,
        acceptedAt: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        acceptedAt: true,
        assignedTo: true,
      },
    });
    const queue =
      interaction.assignedQueueId &&
      (await db.humanWorkQueue.findUnique({
        where: {
          id: interaction.assignedQueueId,
        },
        select: {
          id: true,
          metadata: true,
          state: true,
        },
      }));
    const effectiveAssignee = assignedTo || lastOpen?.assignedTo || null;
    const durationMs =
      lastOpen?.acceptedAt instanceof Date
        ? Math.max(0, releasedAt.getTime() - lastOpen.acceptedAt.getTime())
        : null;

    const result = await db.$transaction(async (tx: any) => {
      const ledger = await tx.humanTakeoverLedger.create({
        data: {
          businessId: interaction.businessId,
          interactionId: interaction.id,
          leadId: interaction.leadId,
          reason: "HANDOFF_RELEASED",
          requestedBy: null,
          assignedTo: effectiveAssignee,
          acceptedAt: lastOpen?.acceptedAt || null,
          releasedAt,
          outcome: outcome || null,
          durationMs,
          metadata: mergeJsonRecords(metadata, {
            action: "RELEASE",
            immutable: true,
          }) as any,
        },
        select: {
          id: true,
        },
      });

      await tx.leadControlState.upsert({
        where: {
          leadId: interaction.leadId,
        },
        update: {
          cancelTokenVersion: {
            increment: 1,
          },
          manualSuppressUntil: null,
          metadata: mergeJsonRecords(null, {
            takeover: {
              active: false,
              closedAt: releasedAt.toISOString(),
              outcome: outcome || null,
            },
          }) as any,
        },
        create: {
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          cancelTokenVersion: 1,
          manualSuppressUntil: null,
          metadata: {
            takeover: {
              active: false,
              closedAt: releasedAt.toISOString(),
              outcome: outcome || null,
            },
          } as any,
        },
      });

      if (queue) {
        const nextState =
          outcome && String(outcome).toUpperCase().includes("RESOLVED")
            ? "RESOLVED"
            : queue.state === "CLOSED"
            ? "CLOSED"
            : "ASSIGNED";
        const queueCurrent = await tx.humanWorkQueue.findUnique({
          where: { id: queue.id },
          select: { metadata: true },
        });

        await tx.humanWorkQueue.update({
          where: {
            id: queue.id,
          },
          data: {
            state: nextState as any,
            metadata: mergeJsonRecords(toRecord(queueCurrent?.metadata), {
              takeover: {
                active: false,
                releasedAt: releasedAt.toISOString(),
                outcome: outcome || null,
                ledgerId: ledger.id,
                durationMs,
              },
            }) as any,
          },
        });
      }

      const interactionCurrent = await tx.inboundInteraction.findUnique({
        where: { id: interaction.id },
        select: { metadata: true },
      });

      await tx.inboundInteraction.update({
        where: {
          id: interaction.id,
        },
        data: {
          metadata: mergeJsonRecords(toRecord(interactionCurrent?.metadata), {
            takeover: {
              active: false,
              releasedAt: releasedAt.toISOString(),
              outcome: outcome || null,
              ledgerId: ledger.id,
              durationMs,
            },
          }) as any,
        },
      });

      await tx.lead.update({
        where: {
          id: interaction.leadId,
        },
        data: {
          isHumanActive: false,
        },
      });

      return {
        ledgerId: ledger.id,
        interactionId: interaction.id,
        queueId: queue?.id || null,
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        assignedTo: effectiveAssignee,
        outcome: outcome || null,
        durationMs,
      };
    });

    await publishHumanOpsEvent({
      event: "human.takeover.released",
      businessId: result.businessId,
      aggregateType: "human_takeover_ledger",
      aggregateId: result.ledgerId,
      eventKey: `${result.interactionId}:${result.ledgerId}`,
      payload: {
        ledgerId: result.ledgerId,
        interactionId: result.interactionId,
        businessId: result.businessId,
        leadId: result.leadId,
        assignedTo: result.assignedTo,
        outcome: result.outcome,
        durationMs: result.durationMs,
      },
    });

    await publishHumanOpsEvent({
      event: "handoff.closed",
      businessId: result.businessId,
      aggregateType: "lead_control_state",
      aggregateId: result.leadId,
      eventKey: `${result.interactionId}:${result.ledgerId}:closed`,
      payload: {
        interactionId: result.interactionId,
        businessId: result.businessId,
        leadId: result.leadId,
        humanId: result.assignedTo,
        outcome: result.outcome,
      },
    });

    return result;
  },
  recordHumanOutbound: async ({
    interactionId,
    humanId,
    outboundKey,
    messageId,
    channel,
    content,
    resolutionCode,
    resolved = false,
    metadata,
    now = new Date(),
  }: {
    interactionId: string;
    humanId: string;
    outboundKey: string;
    messageId?: string | null;
    channel?: string | null;
    content?: string | null;
    resolutionCode?: string | null;
    resolved?: boolean;
    metadata?: JsonRecord | null;
    now?: Date;
  }) => {
    const interaction = await resolveBusinessInteraction(db, interactionId);
    const queue =
      interaction.assignedQueueId &&
      (await db.humanWorkQueue.findUnique({
        where: {
          id: interaction.assignedQueueId,
        },
        select: {
          id: true,
          state: true,
          metadata: true,
        },
      }));
    if (!queue) {
      throw new Error(`human_queue_not_found_for_interaction:${interactionId}`);
    }
    const normalizedChannel = String(channel || "").trim() || "HUMAN_CHANNEL";

    const result = await db.$transaction(async (tx: any) => {
      const existingTouch = await tx.revenueTouchLedger.findUnique({
        where: {
          outboundKey,
        },
        select: {
          id: true,
        },
      });
      const touch = existingTouch
        ? await tx.revenueTouchLedger.update({
            where: {
              outboundKey,
            },
            data: {
              deliveryState: "CONFIRMED",
              confirmedAt: now,
              deliveredAt: now,
              metadata: mergeJsonRecords(metadata, {
                actorType: "HUMAN",
                content: content || null,
              }) as any,
            },
            select: {
              id: true,
            },
          })
        : await tx.revenueTouchLedger.create({
            data: {
              businessId: interaction.businessId,
              leadId: interaction.leadId,
              clientId: null,
              messageId: messageId || null,
              touchType: "OUTBOUND",
              touchReason: "HUMAN_REPLY",
              channel: normalizedChannel,
              actor: "HUMAN",
              source: "HUMAN_OPERATOR",
              outboundKey,
              deliveryState: "CONFIRMED",
              confirmedAt: now,
              deliveredAt: now,
              traceId: null,
              metadata: mergeJsonRecords(metadata, {
                actorType: "HUMAN",
                humanId,
                content: content || null,
              }) as any,
            },
            select: {
              id: true,
            },
          });
      const interactionCurrent = await tx.inboundInteraction.findUnique({
        where: {
          id: interaction.id,
        },
        select: {
          metadata: true,
          lifecycleState: true,
        },
      });
      const wasResolvedBefore = ["RESOLVED", "CLOSED"].includes(
        String(interactionCurrent?.lifecycleState || "").toUpperCase()
      );
      const nextLifecycleState = resolved
        ? "RESOLVED"
        : wasResolvedBefore
        ? "REOPENED"
        : "IN_PROGRESS";

      if (queue) {
        const queueCurrent = await tx.humanWorkQueue.findUnique({
          where: {
            id: queue.id,
          },
          select: {
            metadata: true,
          },
        });

        await tx.humanWorkQueue.update({
          where: {
            id: queue.id,
          },
          data: {
            state: resolved ? "RESOLVED" : "IN_PROGRESS",
            resolutionCode: resolved ? resolutionCode || null : null,
            metadata: mergeJsonRecords(toRecord(queueCurrent?.metadata), {
              humanOutbound: {
                at: now.toISOString(),
                by: humanId,
                touchLedgerId: touch.id,
                resolutionCode: resolutionCode || null,
                resolved,
              },
            }) as any,
          },
        });
      }

      await tx.inboundInteraction.update({
        where: {
          id: interaction.id,
        },
        data: {
          lifecycleState: nextLifecycleState as any,
          metadata: mergeJsonRecords(toRecord(interactionCurrent?.metadata), {
            humanOutbound: {
              at: now.toISOString(),
              by: humanId,
              touchLedgerId: touch.id,
              resolutionCode: resolutionCode || null,
              resolved,
            },
          }) as any,
        },
      });

      const memory = await tx.receptionMemory.findUnique({
        where: {
          leadId: interaction.leadId,
        },
        select: {
          metadata: true,
          unresolvedCount: true,
        },
      });
      await tx.receptionMemory.upsert({
        where: {
          leadId: interaction.leadId,
        },
        update: {
          unresolvedCount: resolved
            ? Math.max(0, Number(memory?.unresolvedCount || 0) - 1)
            : Number(memory?.unresolvedCount || 0),
          lastResolutionScore: resolved ? 1 : undefined,
          metadata: mergeJsonRecords(toRecord(memory?.metadata), {
            humanOutbound: {
              at: now.toISOString(),
              by: humanId,
              touchLedgerId: touch.id,
              resolved,
            },
          }) as any,
        },
        create: {
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          unresolvedCount: resolved ? 0 : 1,
          lastResolutionScore: resolved ? 1 : null,
          metadata: {
            humanOutbound: {
              at: now.toISOString(),
              by: humanId,
              touchLedgerId: touch.id,
              resolved,
            },
          } as any,
        },
      });

      const currentControl = await tx.leadControlState.findUnique({
        where: {
          leadId: interaction.leadId,
        },
        select: {
          metadata: true,
        },
      });

      await tx.leadControlState.upsert({
        where: {
          leadId: interaction.leadId,
        },
        update: {
          cancelTokenVersion: {
            increment: 1,
          },
          lastManualOutboundAt: now,
          manualSuppressUntil: resolved ? null : buildSuppressUntil(now),
          metadata: mergeJsonRecords(toRecord(currentControl?.metadata), {
            takeover: {
              active: !resolved,
              lastHumanReplyAt: now.toISOString(),
              lastHumanReplyBy: humanId,
              resolutionCode: resolutionCode || null,
            },
          }) as any,
        },
        create: {
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          cancelTokenVersion: 1,
          lastManualOutboundAt: now,
          manualSuppressUntil: resolved ? null : buildSuppressUntil(now),
          metadata: {
            takeover: {
              active: !resolved,
              lastHumanReplyAt: now.toISOString(),
              lastHumanReplyBy: humanId,
              resolutionCode: resolutionCode || null,
            },
          } as any,
        },
      });

      await tx.lead.update({
        where: {
          id: interaction.leadId,
        },
        data: {
          isHumanActive: !resolved,
        },
      });

      return {
        queueId: queue.id,
        touchLedgerId: touch.id,
        lifecycleState: nextLifecycleState,
        reopened: !resolved && wasResolvedBefore,
      };
    });

    await publishHumanOpsEvent({
      event: "human.replied",
      businessId: interaction.businessId,
      aggregateType: "human_work_queue",
      aggregateId: result.queueId,
      eventKey: `${interaction.id}:${outboundKey}:reply`,
      payload: {
        queueId: result.queueId,
        interactionId: interaction.id,
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        humanId,
        touchLedgerId: result.touchLedgerId,
      },
    });

    if (resolved) {
      await publishHumanOpsEvent({
        event: "human.resolved",
        businessId: interaction.businessId,
        aggregateType: "human_work_queue",
        aggregateId: result.queueId,
        eventKey: `${interaction.id}:${outboundKey}:resolved`,
        payload: {
          queueId: result.queueId,
          interactionId: interaction.id,
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          humanId,
          touchLedgerId: result.touchLedgerId,
          resolutionCode: resolutionCode || null,
        },
      });

      await publishReceptionEvent({
        event: "interaction.resolved",
        businessId: interaction.businessId,
        aggregateType: "inbound_interaction",
        aggregateId: interaction.id,
        eventKey: `${interaction.externalInteractionKey}:${outboundKey}:resolved`,
        payload: {
          interactionId: interaction.id,
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          queueId: result.queueId,
          resolutionCode: resolutionCode || null,
          lifecycleState: "RESOLVED",
          resolvedAt: now.toISOString(),
          resolutionScore: null,
          traceId: interaction.traceId || null,
        },
      });
    }

    if (result.reopened) {
      await publishReceptionEvent({
        event: "interaction.reopened",
        businessId: interaction.businessId,
        aggregateType: "inbound_interaction",
        aggregateId: interaction.id,
        eventKey: `${interaction.externalInteractionKey}:${outboundKey}:reopened`,
        payload: {
          interactionId: interaction.id,
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          queueId: result.queueId,
          lifecycleState: "REOPENED",
          reopenedAt: now.toISOString(),
          reason: "human_followup_after_resolution",
          traceId: interaction.traceId || null,
        },
      });
    }

    return {
      queueId: result.queueId,
      interactionId: interaction.id,
      businessId: interaction.businessId,
      leadId: interaction.leadId,
      touchLedgerId: result.touchLedgerId,
      resolved,
      lifecycleState: result.lifecycleState,
      reopened: result.reopened,
    };
  },
});
