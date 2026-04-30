import {
  publishReceptionEvent,
  type ReceptionEventWriter,
} from "./receptionEvent.service";
import type { PriorityDecision } from "./priorityEngine.service";
import type { ReceptionClassification } from "./receptionClassifier.service";
import type { SlaPolicyDecision } from "./slaPolicy.service";
import {
  type InboxRouteTarget,
  type InboundInteractionAuthorityRecord,
  type PriorityLevel,
  type ReceptionContextReferences,
  type ReceptionMemoryAuthorityRecord,
} from "./reception.shared";
import { transitionInboundInteraction } from "./inboundLifecycle.service";

export type InboxRoutingDecision = {
  routeDecision: InboxRouteTarget;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  slaDeadline: Date | null;
  requiresHumanQueue: boolean;
  reasons: string[];
};

export type InboxRoutingContext = {
  interaction: InboundInteractionAuthorityRecord;
  classification: ReceptionClassification;
  priority: PriorityDecision;
  sla: SlaPolicyDecision;
  references?: ReceptionContextReferences | null;
  receptionMemory?: ReceptionMemoryAuthorityRecord | null;
  intelligence?: {
    reception?: {
      forceHumanQueue?: boolean;
      escalationBias?: number;
    } | null;
    ai?: {
      forceHumanEscalation?: boolean;
    } | null;
  } | null;
};

export type InboxRoutingRepository = {
  applyRoutingDecision: (input: {
    interactionId: string;
    routing: InboxRoutingDecision;
  }) => Promise<InboundInteractionAuthorityRecord>;
};

export const resolveInboxRouting = ({
  classification,
  priority,
  sla,
  references,
  receptionMemory,
  intelligence,
}: InboxRoutingContext): InboxRoutingDecision => {
  const reasons = [...classification.reasons, ...priority.reasons, ...sla.reasons];
  const unresolvedCount = Number(receptionMemory?.unresolvedCount || 0);
  const escalationBias = Number(intelligence?.reception?.escalationBias || 0);
  const adjustedPriorityScore = Math.max(
    0,
    Math.min(100, Math.round(priority.score + escalationBias))
  );
  const forceHumanQueue = Boolean(intelligence?.reception?.forceHumanQueue);
  const forceEscalation = Boolean(intelligence?.ai?.forceHumanEscalation);
  let routeDecision: InboxRouteTarget = classification.routeHint;
  let requiresHumanQueue = false;

  if (classification.spamScore >= 0.85 || classification.routeHint === "SPAM_BIN") {
    routeDecision = "SPAM_BIN";
  } else if (forceHumanQueue) {
    routeDecision = adjustedPriorityScore >= 78 ? "ESCALATION" : "HUMAN_QUEUE";
    requiresHumanQueue = true;
    reasons.push("intelligence_force_human_queue");
  } else if (forceEscalation && adjustedPriorityScore >= 55) {
    routeDecision = "ESCALATION";
    requiresHumanQueue = true;
    reasons.push("intelligence_force_escalation");
  } else if (references?.leadControl?.isHumanControlActive) {
    routeDecision = "HUMAN_QUEUE";
    requiresHumanQueue = true;
  } else if (
    !references?.consent ||
    references.consent.status === "UNKNOWN" ||
    references.consent.status === "REVOKED"
  ) {
    routeDecision = "HUMAN_QUEUE";
    requiresHumanQueue = true;
  } else if (classification.intentClass === "ABUSE") {
    routeDecision = priority.level === "CRITICAL" ? "ESCALATION" : "OWNER";
    requiresHumanQueue = true;
  } else if (
    classification.intentClass === "COMPLAINT" &&
    (priority.level === "HIGH" ||
      priority.level === "CRITICAL" ||
      unresolvedCount > 0)
  ) {
    routeDecision = priority.level === "CRITICAL" ? "ESCALATION" : "HUMAN_QUEUE";
    requiresHumanQueue = true;
  } else if (classification.routeHint === "OWNER") {
    routeDecision = "OWNER";
    requiresHumanQueue = true;
  } else if (
    ["BILLING", "APPOINTMENTS", "SUPPORT"].includes(classification.routeHint)
  ) {
    routeDecision = classification.routeHint;
    requiresHumanQueue = priority.level === "CRITICAL" || adjustedPriorityScore >= 85;
  } else {
    routeDecision = "REVENUE_BRAIN";
    requiresHumanQueue = false;
  }

  requiresHumanQueue =
    requiresHumanQueue ||
    !["REVENUE_BRAIN", "SPAM_BIN"].includes(routeDecision);

  if (requiresHumanQueue) {
    reasons.push("human_queue_required");
  }

  return {
    routeDecision,
    priorityScore: adjustedPriorityScore,
    priorityLevel: priority.level,
    slaDeadline: routeDecision === "SPAM_BIN" ? null : sla.effectiveSlaDeadline,
    requiresHumanQueue,
    reasons,
  };
};

export const createPrismaInboxRoutingRepository = (): InboxRoutingRepository => ({
  applyRoutingDecision: async ({ interactionId, routing }) => {
    return transitionInboundInteraction({
      interactionId,
      expectedCurrentStates: ["CLASSIFIED", "ROUTED"],
      nextState: "ROUTED",
      allowSameState: true,
      updates: {
        routeDecision: routing.routeDecision,
        priorityScore: routing.priorityScore,
        priorityLevel: routing.priorityLevel,
        slaDeadline: routing.slaDeadline,
      },
      metadata: {
        routingDecision: {
          routeDecision: routing.routeDecision,
          priorityScore: routing.priorityScore,
          priorityLevel: routing.priorityLevel,
          slaDeadline: routing.slaDeadline
            ? routing.slaDeadline.toISOString()
            : null,
          lifecycleState: "ROUTED",
          requiresHumanQueue: routing.requiresHumanQueue,
          reasons: routing.reasons,
        },
      },
    });
  },
});

export const createInboxRouterService = ({
  repository = createPrismaInboxRoutingRepository(),
  eventWriter = publishReceptionEvent,
}: {
  repository?: InboxRoutingRepository;
  eventWriter?: ReceptionEventWriter;
} = {}) => ({
  route: resolveInboxRouting,
  applyRouting: async (context: InboxRoutingContext) => {
    const routing = resolveInboxRouting(context);
    const interaction = await repository.applyRoutingDecision({
      interactionId: context.interaction.id,
      routing,
    });

    await eventWriter({
      event: "inbound.routed",
      businessId: interaction.businessId,
      aggregateType: "inbound_interaction",
      aggregateId: interaction.id,
      eventKey: `${interaction.externalInteractionKey}:routed`,
      payload: {
        interactionId: interaction.id,
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        routeDecision: routing.routeDecision,
        priorityScore: routing.priorityScore,
        priorityLevel: routing.priorityLevel,
        slaDeadline: routing.slaDeadline
          ? routing.slaDeadline.toISOString()
          : null,
        lifecycleState: interaction.lifecycleState,
        requiresHumanQueue: routing.requiresHumanQueue,
        reasons: routing.reasons,
        traceId: interaction.traceId,
      },
    });

    return {
      interaction,
      routing,
    };
  },
});
