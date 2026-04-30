import { createDurableOutboxEvent } from "./eventOutbox.service";

export const HUMAN_OPS_EVENT_CONTRACT_VERSION = 1 as const;

export const HUMAN_OPS_EVENT_TYPES = [
  "human.assigned.deterministic",
  "human.takeover.opened",
  "human.takeover.released",
  "human.escalated",
  "human.reminder.nudged",
  "human.replied",
  "human.resolved",
  "handoff.closed",
  "owner.copilot.updated",
] as const;

export type HumanOpsEventName = (typeof HUMAN_OPS_EVENT_TYPES)[number];

export type HumanOpsAggregateType =
  | "human_work_queue"
  | "lead_control_state"
  | "human_takeover_ledger"
  | "owner_copilot_feed";

export type HumanOpsEventMap = {
  "human.assigned.deterministic": {
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    assignedHumanId: string;
    assignedRole: string;
    score: number;
    reasons: string[];
    createdAt: string;
  };
  "human.takeover.opened": {
    ledgerId: string;
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    assignedTo: string;
    reason: string;
    cancelTokenVersion: number;
  };
  "human.takeover.released": {
    ledgerId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    assignedTo: string | null;
    outcome: string | null;
    durationMs: number | null;
  };
  "human.escalated": {
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    previousRole: string;
    nextRole: string;
    severity: string;
    stepIndex: number;
    reasons: string[];
  };
  "human.reminder.nudged": {
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    reminderType: string;
    targetHumanId: string | null;
  };
  "human.replied": {
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    humanId: string;
    touchLedgerId: string;
  };
  "human.resolved": {
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    humanId: string;
    touchLedgerId: string;
    resolutionCode: string | null;
  };
  "handoff.closed": {
    interactionId: string;
    businessId: string;
    leadId: string;
    humanId: string | null;
    outcome: string | null;
  };
  "owner.copilot.updated": {
    businessId: string;
    overloadedReps: number;
    unresolvedCriticals: number;
    queueImbalanceScore: number;
    assignmentLatencyMsP95: number;
  };
};

export type PublishHumanOpsEventInput<TEvent extends HumanOpsEventName> = {
  event: TEvent;
  businessId: string;
  aggregateType: HumanOpsAggregateType;
  aggregateId: string;
  eventKey?: string | null;
  dedupeKey?: string | null;
  occurredAt?: Date;
  payload: HumanOpsEventMap[TEvent];
};

export type HumanOpsEventEnvelope<TEvent extends HumanOpsEventName> = {
  type: TEvent;
  version: typeof HUMAN_OPS_EVENT_CONTRACT_VERSION;
  aggregateType: HumanOpsAggregateType;
  aggregateId: string;
  dedupeKey: string;
  occurredAt: string;
  payload: HumanOpsEventMap[TEvent];
};

export const buildHumanOpsEventDedupeKey = <
  TEvent extends HumanOpsEventName,
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
    "humanops",
    `v${HUMAN_OPS_EVENT_CONTRACT_VERSION}`,
    event,
    aggregateId,
    String(eventKey || aggregateId).trim() || aggregateId,
  ].join(":");

export const publishHumanOpsEvent = async <TEvent extends HumanOpsEventName>(
  input: PublishHumanOpsEventInput<TEvent>
): Promise<HumanOpsEventEnvelope<TEvent>> => {
  const dedupeKey =
    String(input.dedupeKey || "").trim() ||
    buildHumanOpsEventDedupeKey({
      event: input.event,
      aggregateId: input.aggregateId,
      eventKey: input.eventKey,
    });
  const occurredAt = input.occurredAt || new Date();

  const envelope: HumanOpsEventEnvelope<TEvent> = {
    type: input.event,
    version: HUMAN_OPS_EVENT_CONTRACT_VERSION,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    dedupeKey,
    occurredAt: occurredAt.toISOString(),
    payload: input.payload,
  };

  await createDurableOutboxEvent({
    businessId: input.businessId,
    eventType: input.event,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    dedupeKey,
    payload: envelope as unknown as Record<string, unknown>,
  });

  return envelope;
};
