import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import {
  INBOUND_INTERACTION_SELECT,
  toInboundInteractionRecord,
} from "./interactionNormalizer.service";
import {
  canTransitionInteractionState,
  mergeJsonRecords,
  normalizeToken,
  toRecord,
  type InboundInteractionAuthorityRecord,
  type InboundLifecycleState,
  type JsonRecord,
} from "./reception.shared";

type LifecycleTx = Prisma.TransactionClient | typeof prisma;

const normalizeLifecycleState = (value: unknown) =>
  normalizeToken(value, "RECEIVED") as InboundLifecycleState;

const loadCurrentInteractionRow = async (
  tx: LifecycleTx,
  interactionId: string
) =>
  tx.inboundInteraction.findUnique({
    where: {
      id: interactionId,
    },
    select: {
      lifecycleState: true,
      metadata: true,
    },
  });

const loadInteractionOrThrow = async (
  tx: LifecycleTx,
  interactionId: string
): Promise<{
  lifecycleState: InboundLifecycleState;
  metadata: JsonRecord;
}> => {
  const current = await loadCurrentInteractionRow(tx, interactionId);

  if (!current) {
    throw new Error(`interaction_not_found:${interactionId}`);
  }

  return {
    lifecycleState: normalizeLifecycleState(current.lifecycleState),
    metadata: toRecord(current.metadata),
  };
};

export const assertInboundLifecycleTransition = ({
  currentState,
  nextState,
  allowSameState = false,
}: {
  currentState: InboundLifecycleState;
  nextState: InboundLifecycleState;
  allowSameState?: boolean;
}) => {
  if (currentState === nextState && allowSameState) {
    return;
  }

  if (!canTransitionInteractionState(currentState, nextState)) {
    throw new Error(
      `invalid_lifecycle_transition:${currentState}->${nextState}`
    );
  }
};

export const transitionInboundInteraction = async ({
  tx = prisma,
  interactionId,
  expectedCurrentStates,
  nextState,
  updates,
  metadata,
  allowSameState = false,
}: {
  tx?: LifecycleTx;
  interactionId: string;
  expectedCurrentStates?: InboundLifecycleState[];
  nextState: InboundLifecycleState;
  updates?: Record<string, unknown>;
  metadata?: JsonRecord | null;
  allowSameState?: boolean;
}): Promise<InboundInteractionAuthorityRecord> => {
  const current = await loadInteractionOrThrow(tx, interactionId);

  if (
    expectedCurrentStates?.length &&
    !expectedCurrentStates.includes(current.lifecycleState)
  ) {
    throw new Error(
      `unexpected_lifecycle_state:${interactionId}:${current.lifecycleState}`
    );
  }

  assertInboundLifecycleTransition({
    currentState: current.lifecycleState,
    nextState,
    allowSameState,
  });

  const nextMetadata = mergeJsonRecords(current.metadata, metadata);
  const updateResult = await tx.inboundInteraction.updateMany({
    where: {
      id: interactionId,
      lifecycleState: current.lifecycleState as any,
    },
    data: {
      ...(updates || {}),
      lifecycleState: nextState as any,
      ...(metadata !== undefined
        ? {
            metadata: nextMetadata as Prisma.InputJsonValue,
          }
        : {}),
    },
  });

  if (updateResult.count !== 1) {
    const latest = await loadCurrentInteractionRow(tx, interactionId);
    const latestState = normalizeLifecycleState(latest?.lifecycleState);
    throw new Error(
      `interaction_transition_conflict:${interactionId}:${current.lifecycleState}->${latestState}`
    );
  }

  const updated = await tx.inboundInteraction.findUnique({
    where: {
      id: interactionId,
    },
    select: INBOUND_INTERACTION_SELECT,
  });

  if (!updated) {
    throw new Error(`interaction_not_found:${interactionId}`);
  }

  return toInboundInteractionRecord(updated);
};

export const markInboundInteractionFailed = async ({
  tx = prisma,
  interactionId,
  metadata,
  updates,
}: {
  tx?: LifecycleTx;
  interactionId: string;
  metadata?: JsonRecord | null;
  updates?: Record<string, unknown>;
}) =>
  transitionInboundInteraction({
    tx,
    interactionId,
    nextState: "FAILED",
    updates,
    metadata,
  });
