import { createDurableOutboxEvent } from "./eventOutbox.service";
import type {
  InboxRouteTarget,
  InboundLifecycleState,
  PriorityLevel,
} from "./reception.shared";

export const RECEPTION_EVENT_CONTRACT_VERSION = 1 as const;

export const RECEPTION_EVENT_TYPES = [
  "inbound.received",
  "inbound.normalized",
  "inbound.classified",
  "inbound.routed",
  "human.assigned",
  "sla.warning",
  "sla.breached",
  "interaction.resolved",
  "interaction.reopened",
] as const;

export type ReceptionEventName = (typeof RECEPTION_EVENT_TYPES)[number];

export type ReceptionEventAggregateType =
  | "inbound_interaction"
  | "human_work_queue"
  | "reception_memory";

export type ReceptionEventMap = {
  "inbound.received": {
    interactionId: string;
    businessId: string;
    leadId: string;
    clientId: string | null;
    channel: string;
    interactionType: string;
    externalInteractionKey: string;
    providerMessageId: string | null;
    correlationId: string | null;
    traceId: string | null;
    fingerprint: string;
    receivedAt: string;
  };
  "inbound.normalized": {
    interactionId: string;
    businessId: string;
    leadId: string;
    channel: string;
    interactionType: string;
    normalizedPayload: unknown;
    traceId: string | null;
    receivedAt: string;
  };
  "inbound.classified": {
    interactionId: string;
    businessId: string;
    leadId: string;
    intentClass: string;
    urgencyClass: string;
    sentimentClass: string;
    spamScore: number;
    reasons: string[];
    traceId: string | null;
  };
  "inbound.routed": {
    interactionId: string;
    businessId: string;
    leadId: string;
    routeDecision: InboxRouteTarget;
    priorityScore: number;
    priorityLevel: PriorityLevel;
    slaDeadline: string | null;
    lifecycleState: InboundLifecycleState;
    requiresHumanQueue: boolean;
    reasons: string[];
    traceId: string | null;
  };
  "human.assigned": {
    queueId: string;
    interactionId: string;
    businessId: string;
    leadId: string;
    routeDecision: InboxRouteTarget;
    queueType: string;
    assignedRole: string;
    assignedHumanId: string | null;
    state: string;
    priority: PriorityLevel;
    slaDeadline: string | null;
    escalationAt: string | null;
    traceId: string | null;
  };
  "sla.warning": {
    interactionId: string;
    businessId: string;
    leadId: string;
    queueId: string | null;
    slaKind: string;
    deadline: string;
    remainingMinutes: number;
    priorityLevel: PriorityLevel;
    routeDecision: InboxRouteTarget;
    traceId: string | null;
  };
  "sla.breached": {
    interactionId: string;
    businessId: string;
    leadId: string;
    queueId: string | null;
    slaKind: string;
    deadline: string;
    breachedAt: string;
    overdueMinutes: number;
    priorityLevel: PriorityLevel;
    routeDecision: InboxRouteTarget;
    traceId: string | null;
  };
  "interaction.resolved": {
    interactionId: string;
    businessId: string;
    leadId: string;
    queueId: string | null;
    resolutionCode: string | null;
    lifecycleState: InboundLifecycleState;
    resolvedAt: string;
    resolutionScore: number | null;
    traceId: string | null;
  };
  "interaction.reopened": {
    interactionId: string;
    businessId: string;
    leadId: string;
    queueId: string | null;
    lifecycleState: InboundLifecycleState;
    reopenedAt: string;
    reason: string;
    traceId: string | null;
  };
};

export type ReceptionEventEnvelope<
  TEvent extends ReceptionEventName = ReceptionEventName,
> = {
  type: TEvent;
  version: typeof RECEPTION_EVENT_CONTRACT_VERSION;
  aggregateType: ReceptionEventAggregateType;
  aggregateId: string;
  dedupeKey: string;
  consumerDedupeKey: string;
  occurredAt: string;
  payload: ReceptionEventMap[TEvent];
};

export type ReceptionEventWriter = <
  TEvent extends ReceptionEventName,
>(
  input: PublishReceptionEventInput<TEvent>
) => Promise<ReceptionEventEnvelope<TEvent>>;

export type PublishReceptionEventInput<
  TEvent extends ReceptionEventName,
> = {
  event: TEvent;
  businessId?: string | null;
  aggregateType: ReceptionEventAggregateType;
  aggregateId: string;
  eventKey?: string | null;
  dedupeKey?: string | null;
  consumerDedupeKey?: string | null;
  occurredAt?: Date;
  payload: ReceptionEventMap[TEvent];
};

export const buildReceptionConsumerDedupeKey = <
  TEvent extends ReceptionEventName,
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
    "reception",
    `v${RECEPTION_EVENT_CONTRACT_VERSION}`,
    event,
    aggregateId,
    String(eventKey || aggregateId).trim() || aggregateId,
  ].join(":");

export const buildReceptionEventDedupeKey = <
  TEvent extends ReceptionEventName,
>({
  event,
  aggregateId,
  eventKey,
}: {
  event: TEvent;
  aggregateId: string;
  eventKey?: string | null;
}) =>
  buildReceptionConsumerDedupeKey({
    event,
    aggregateId,
    eventKey,
  });

export const buildReceptionEventEnvelope = <
  TEvent extends ReceptionEventName,
>({
  event,
  aggregateType,
  aggregateId,
  eventKey,
  dedupeKey,
  consumerDedupeKey,
  occurredAt = new Date(),
  payload,
}: PublishReceptionEventInput<TEvent>): ReceptionEventEnvelope<TEvent> => ({
  type: event,
  version: RECEPTION_EVENT_CONTRACT_VERSION,
  aggregateType,
  aggregateId,
  dedupeKey:
    String(dedupeKey || "").trim() ||
    buildReceptionEventDedupeKey({
      event,
      aggregateId,
      eventKey,
    }),
  consumerDedupeKey:
    String(consumerDedupeKey || "").trim() ||
    buildReceptionConsumerDedupeKey({
      event,
      aggregateId,
      eventKey,
    }),
  occurredAt: occurredAt.toISOString(),
  payload,
});

export const publishReceptionEvent: ReceptionEventWriter = async (input) => {
  const envelope = buildReceptionEventEnvelope(input as any);

  await createDurableOutboxEvent({
    businessId: input.businessId || null,
    eventType: input.event,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    dedupeKey: envelope.dedupeKey,
    payload: envelope as unknown as Record<string, unknown>,
  });

  return envelope as any;
};
