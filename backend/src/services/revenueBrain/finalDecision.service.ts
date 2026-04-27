import type {
  RevenueBrainContext,
  RevenueBrainDecision,
  RevenueBrainDeterministicPlanSnapshot,
  RevenueBrainFinalResolvedDecision,
  RevenueBrainIntentResult,
  RevenueBrainReply,
  RevenueBrainRoute,
  RevenueBrainStateResult,
  RevenueBrainToolPlan,
} from "./types";

const normalizeString = (value?: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const safeArray = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const fallbackAction = ({
  context,
  route,
  decision,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  decision: RevenueBrainDecision;
}) => {
  if (route === "BOOKING") {
    return "BOOK";
  }

  if (route === "NO_REPLY") {
    return null;
  }

  return (
    decision.salesDecision?.action ||
    context.salesContext.progression.currentAction ||
    null
  );
};

const fallbackPriority = ({
  context,
  route,
  decision,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  decision: RevenueBrainDecision;
}) => {
  if (route === "NO_REPLY") {
    return 0;
  }

  const basePriority =
    decision.salesDecision?.priority ||
    context.salesContext.progression.actionPriority ||
    30;

  if (route === "BOOKING") {
    return Math.max(basePriority, 90);
  }

  return basePriority;
};

const fallbackTone = ({
  context,
  decision,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
}) =>
  normalizeString(decision.salesDecision?.tone) ||
  normalizeString(context.salesContext.client.aiTone) ||
  "human-confident";

const fallbackCta = ({
  context,
  route,
  decision,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  decision: RevenueBrainDecision;
}) => {
  if (route === "NO_REPLY" || route === "ESCALATE") {
    return "NONE" as const;
  }

  return (
    decision.conversion?.cta.cta ||
    decision.salesDecision?.cta ||
    context.salesContext.profile.intentDirective.cta ||
    context.salesContext.optimization.recommendedCTA ||
    "REPLY_DM"
  );
};

const resolveSnapshotReply = ({
  context,
  reply,
  finalResolvedDecision,
  state,
}: {
  context: RevenueBrainContext;
  reply?: RevenueBrainReply | null;
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
  state: RevenueBrainStateResult;
}) => ({
  generated: Boolean(reply),
  message: reply?.message || null,
  cta: reply?.cta || finalResolvedDecision.cta,
  angle:
    reply?.angle ||
    context.salesContext.profile.intentDirective.angle ||
    context.semanticMemory.recommendedAngle ||
    null,
  reason:
    reply?.reason ||
    (finalResolvedDecision.route === "NO_REPLY"
      ? state.transitionReason
      : finalResolvedDecision.metadata.reasoning[0] || null),
  confidence: reply?.confidence || null,
  source: reply?.source || finalResolvedDecision.metadata.source || null,
});

export const resolveRevenueExperimentLearningArmKey = ({
  variantKey,
  experimentVariantKey,
  experimentArm,
}: {
  variantKey?: string | null;
  experimentVariantKey?: string | null;
  experimentArm?: string | null;
}) =>
  normalizeString(variantKey) ||
  normalizeString(experimentVariantKey) ||
  normalizeString(experimentArm);

export const resolveRevenueBrainFinalDecision = ({
  context,
  route,
  decision,
  reply,
  toolPlan,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  decision: RevenueBrainDecision;
  reply?: RevenueBrainReply | null;
  toolPlan: RevenueBrainToolPlan[];
}): RevenueBrainFinalResolvedDecision => {
  const variantId =
    normalizeString(decision.salesDecision?.variant?.id) ||
    normalizeString(decision.conversion?.experiment.variantId);
  const variantKey =
    normalizeString(decision.salesDecision?.variant?.variantKey) ||
    normalizeString(decision.conversion?.experiment.variantKey) ||
    normalizeString(decision.conversion?.experiment.armKey);
  const learningArmKey = resolveRevenueExperimentLearningArmKey({
    variantKey,
    experimentVariantKey: decision.conversion?.experiment.variantKey || null,
    experimentArm: decision.conversion?.experiment.armKey || null,
  });
  const cta = reply?.cta || fallbackCta({ context, route, decision });

  return {
    route,
    action: fallbackAction({
      context,
      route,
      decision,
    }),
    cta,
    priority: fallbackPriority({
      context,
      route,
      decision,
    }),
    tone: fallbackTone({
      context,
      decision,
    }),
    metadata: {
      source: reply?.source || route,
      strategy: decision.salesDecision?.strategy || null,
      structure: normalizeString(decision.salesDecision?.structure),
      ctaStyle: normalizeString(
        decision.salesDecision?.ctaStyle || decision.conversion?.cta.style
      ),
      messageLength: normalizeString(decision.salesDecision?.messageLength),
      variantId,
      variantKey,
      learningArmKey,
      conversionScore: decision.conversion?.score || null,
      conversionBucket: normalizeString(decision.conversion?.bucket),
      objectionPath: decision.conversion?.objection.path || [],
      trustLevel: normalizeString(decision.conversion?.trust.level),
      trustInjectionType: normalizeString(
        decision.conversion?.trust.injectionType
      ),
      urgencyLevel: normalizeString(decision.conversion?.urgency.level),
      urgencyReason: normalizeString(decision.conversion?.urgency.reason),
      negotiationMode: normalizeString(decision.conversion?.negotiation.mode),
      offerType: normalizeString(decision.conversion?.offer.type),
      closeMotion: normalizeString(decision.conversion?.close.motion),
      experimentArm: normalizeString(decision.conversion?.experiment.armKey),
      experimentVariantId: normalizeString(
        decision.conversion?.experiment.variantId
      ),
      experimentVariantKey: normalizeString(
        decision.conversion?.experiment.variantKey
      ),
      ethicsApproved:
        typeof decision.conversion?.ethics.approved === "boolean"
          ? decision.conversion.ethics.approved
          : null,
      ethicsBlockedPatterns: decision.conversion?.ethics.blockedPatterns || [],
      ethicsFallbackApplied:
        typeof decision.conversion?.ethics.fallbackApplied === "boolean"
          ? decision.conversion.ethics.fallbackApplied
          : null,
      ethicsFallbackReason: normalizeString(
        decision.conversion?.ethics.fallbackReason
      ),
      reasoning: safeArray([
        ...(decision.reasoning || []),
        ...(decision.salesDecision?.reasoning || []),
      ]),
      toolPlan,
    },
  };
};

export const buildRevenueBrainDeterministicPlanSnapshot = ({
  context,
  intent,
  state,
  reply,
  toolPlan,
  finalResolvedDecision,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
  reply?: RevenueBrainReply | null;
  toolPlan: RevenueBrainToolPlan[];
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
}): RevenueBrainDeterministicPlanSnapshot => ({
  version: "phase3b",
  traceId: context.traceId,
  businessId: context.businessId,
  leadId: context.leadId,
  clientId: context.salesContext.client.id || null,
  source: context.source,
  preview: context.preview,
  inputMessage: context.inputMessage,
  planKey: context.planContext.planKey,
  route: finalResolvedDecision.route,
  action: finalResolvedDecision.action,
  cta: finalResolvedDecision.cta,
  priority: finalResolvedDecision.priority,
  tone: finalResolvedDecision.tone,
  reasoning: finalResolvedDecision.metadata.reasoning,
  toolPlan,
  state: {
    currentState: state.currentState,
    nextState: state.nextState,
    stage: state.stage,
    aiStage: state.aiStage,
    transitionReason: state.transitionReason,
    conversationStateName: state.conversationStateName,
    shouldReply: state.shouldReply,
  },
  intent: {
    intent: intent.intent,
    confidence: intent.confidence,
    decisionIntent: intent.decisionIntent,
    objection: intent.objection,
    temperature: intent.temperature,
    stage: intent.stage,
    userSignal: intent.userSignal,
  },
  reply: resolveSnapshotReply({
    context,
    reply,
    finalResolvedDecision,
    state,
  }),
  resolvedDecision: finalResolvedDecision,
  context: {
    leadState: context.salesContext.leadState.state,
    nextLeadState: state.nextState,
    actionPriority: finalResolvedDecision.priority || null,
    funnelPosition: context.salesContext.progression.funnelPosition || null,
    emotion: context.salesContext.profile.emotion || null,
    knowledgeHitIds: context.semanticMemory.hits.map((hit) => hit.id),
    knowledgeSources: context.semanticMemory.hits.map((hit) => hit.sourceType),
    memoryFactCount: context.salesContext.memory.facts.length,
    freshMemoryFactCount: context.salesContext.memory.facts.filter(
      (fact) => !fact.stale
    ).length,
    crmCompositeScore: context.crmIntelligence.scorecard.compositeScore || null,
    crmValueTier: normalizeString(context.crmIntelligence.value.valueTier),
    crmChurnRisk: normalizeString(context.crmIntelligence.value.churnRisk),
    crmLifecycleStage: normalizeString(context.crmIntelligence.lifecycle.stage),
    crmPrimarySegment: normalizeString(
      context.crmIntelligence.segments.primarySegment
    ),
  },
});

export const buildRevenueBrainReplyMeta = ({
  context,
  intent,
  state,
  reply,
  toolPlan,
  finalResolvedDecision,
  existingMeta,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
  reply: RevenueBrainReply;
  toolPlan: RevenueBrainToolPlan[];
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
  existingMeta?: Record<string, unknown> | null;
}) => {
  const snapshot = buildRevenueBrainDeterministicPlanSnapshot({
    context,
    intent,
    state,
    reply,
    toolPlan,
    finalResolvedDecision,
  });

  return {
    ...(existingMeta || {}),
    route: finalResolvedDecision.route,
    source: reply.source,
    latencyMs: reply.latencyMs,
    traceId: context.traceId,
    messageType: "AI_REPLY",
    reason: reply.reason,
    structured: reply.structured || null,
    leadState: context.salesContext.leadState.state,
    nextLeadState: state.nextState,
    stateTransition: {
      from: state.currentState,
      to: state.nextState,
    },
    variantId: finalResolvedDecision.metadata.variantId,
    variantKey: finalResolvedDecision.metadata.variantKey,
    learningArmKey: finalResolvedDecision.metadata.learningArmKey,
    decisionAction: finalResolvedDecision.action,
    decisionPriority: finalResolvedDecision.priority,
    decisionStrategy: finalResolvedDecision.metadata.strategy,
    decisionTone: finalResolvedDecision.tone,
    decisionStructure: finalResolvedDecision.metadata.structure,
    decisionCTA: finalResolvedDecision.cta,
    decisionCTAStyle: finalResolvedDecision.metadata.ctaStyle,
    decisionMessageLength: finalResolvedDecision.metadata.messageLength,
    conversionScore: finalResolvedDecision.metadata.conversionScore,
    conversionBucket: finalResolvedDecision.metadata.conversionBucket,
    objectionPath: finalResolvedDecision.metadata.objectionPath,
    trustLevel: finalResolvedDecision.metadata.trustLevel,
    trustInjectionType: finalResolvedDecision.metadata.trustInjectionType,
    urgencyLevel: finalResolvedDecision.metadata.urgencyLevel,
    urgencyReason: finalResolvedDecision.metadata.urgencyReason,
    negotiationMode: finalResolvedDecision.metadata.negotiationMode,
    offerType: finalResolvedDecision.metadata.offerType,
    closeMotion: finalResolvedDecision.metadata.closeMotion,
    experimentArm: finalResolvedDecision.metadata.experimentArm,
    experimentVariantId: finalResolvedDecision.metadata.experimentVariantId,
    experimentVariantKey: finalResolvedDecision.metadata.experimentVariantKey,
    ethicsApproved: finalResolvedDecision.metadata.ethicsApproved,
    ethicsBlockedPatterns: finalResolvedDecision.metadata.ethicsBlockedPatterns,
    ethicsFallbackApplied:
      finalResolvedDecision.metadata.ethicsFallbackApplied,
    ethicsFallbackReason:
      finalResolvedDecision.metadata.ethicsFallbackReason,
    knowledgeHitIds: snapshot.context.knowledgeHitIds,
    knowledgeHitCount: snapshot.context.knowledgeHitIds.length,
    knowledgeSources: snapshot.context.knowledgeSources,
    memoryFactCount: snapshot.context.memoryFactCount,
    freshMemoryFactCount: snapshot.context.freshMemoryFactCount,
    crmCompositeScore: snapshot.context.crmCompositeScore,
    crmValueTier: snapshot.context.crmValueTier,
    crmChurnRisk: snapshot.context.crmChurnRisk,
    crmLifecycleStage: snapshot.context.crmLifecycleStage,
    crmPrimarySegment: snapshot.context.crmPrimarySegment,
    confidence: reply.confidence,
    finalResolvedDecision,
    revenueBrainSnapshot: snapshot,
    deliveryConfirmed: false,
    deliveryConfirmedAt: null,
  };
};

export const isRevenueBrainDeliveryConfirmed = ({
  delivered,
  localPreviewOnly,
  platform,
}: {
  delivered: boolean;
  localPreviewOnly?: boolean;
  platform?: string | null;
}) => {
  if (delivered) {
    return true;
  }

  if (localPreviewOnly) {
    return true;
  }

  return !normalizeString(platform);
};
