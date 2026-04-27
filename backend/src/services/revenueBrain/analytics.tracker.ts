import prisma from "../../config/prisma";
import { markKnowledgeRetrieved } from "../knowledgeReinforcement.service";
import {
  recordSalesReplyEvent,
  recordSalesReplyFailureEvent,
} from "../salesAgent/optimizer.service";
import { isRevenueBrainProductionLearningEligible } from "./deliveryPolicy.service";
import {
  registerRevenueBrainSubscriber,
  subscribeRevenueBrainEvent,
} from "./eventBus.service";
import type {
  RevenueBrainDeliveryConfirmedEvent,
  RevenueBrainDeliveryFailedEvent,
  RevenueBrainExecutionSnapshot,
} from "./types";

const toJsonSafe = (value: unknown) => {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

export const buildRevenueBrainCompletedAnalyticsMeta = (
  event: RevenueBrainExecutionSnapshot
) => {
  const resolved = event.finalResolvedDecision;
  const toolSuccessCount = event.tools.filter(
    (tool) => tool.status === "applied"
  ).length;
  const toolFailureCount = event.tools.filter(
    (tool) => tool.status === "failed"
  ).length;
  const knowledgeIds = event.context.semanticMemory.hits.map((hit) => hit.id);
  const memoryFacts = event.context.salesContext.memory.facts || [];

  return {
    traceId: event.traceId,
    leadId: event.context.leadId,
    route: resolved.route,
    source: event.context.source,
    preview: event.context.preview,
    latencyMs: event.reply?.latencyMs || null,
    intent: event.intent.intent,
    decisionIntent: event.intent.decisionIntent,
    temperature: event.intent.temperature,
    objection: event.intent.objection,
    leadState: event.state.nextState,
    transitionReason: event.state.transitionReason,
    action: resolved.action,
    cta: resolved.cta,
    priority: resolved.priority,
    tone: resolved.tone,
    followupAction: event.artifacts.followup?.action || null,
    coupon: event.artifacts.coupon || null,
    knowledgeHitCount: event.context.semanticMemory.hits.length,
    knowledgeHitIds: knowledgeIds,
    memoryFactCount: memoryFacts.length,
    freshMemoryFactCount: memoryFacts.filter((fact) => !fact.stale).length,
    crmCompositeScore: event.context.crmIntelligence.scorecard.compositeScore,
    crmEngagementScore: event.context.crmIntelligence.scorecard.engagementScore,
    crmQualificationScore:
      event.context.crmIntelligence.scorecard.qualificationScore,
    crmBuyingIntentScore:
      event.context.crmIntelligence.scorecard.buyingIntentScore,
    crmValueTier: event.context.crmIntelligence.value.valueTier,
    crmValueScore: event.context.crmIntelligence.value.valueScore,
    crmChurnScore: event.context.crmIntelligence.value.churnScore,
    crmChurnRisk: event.context.crmIntelligence.value.churnRisk,
    crmLifecycleStage: event.context.crmIntelligence.lifecycle.stage,
    crmLifecycleStatus: event.context.crmIntelligence.lifecycle.status,
    crmPrimarySegment: event.context.crmIntelligence.segments.primarySegment,
    crmSecondarySegment:
      event.context.crmIntelligence.segments.secondarySegment,
    crmRelationshipScore:
      event.context.crmIntelligence.relationships.relationshipScore,
    crmRelationshipEdges: event.context.crmIntelligence.relationships.edgeCount,
    crmNextBestAction: event.context.crmIntelligence.behavior.nextBestAction,
    crmPredictedBehavior: event.context.crmIntelligence.behavior.predictedBehavior,
    variantId: resolved.metadata.variantId,
    variantKey: resolved.metadata.variantKey,
    learningArmKey: resolved.metadata.learningArmKey,
    conversionScore: resolved.metadata.conversionScore,
    conversionBucket: resolved.metadata.conversionBucket,
    objectionPath: resolved.metadata.objectionPath,
    trustLevel: resolved.metadata.trustLevel,
    trustInjectionType: resolved.metadata.trustInjectionType,
    urgencyLevel: resolved.metadata.urgencyLevel,
    urgencyReason: resolved.metadata.urgencyReason,
    negotiationMode: resolved.metadata.negotiationMode,
    offerType: resolved.metadata.offerType,
    closeMotion: resolved.metadata.closeMotion,
    experimentArm: resolved.metadata.experimentArm,
    experimentVariantId: resolved.metadata.experimentVariantId,
    experimentVariantKey: resolved.metadata.experimentVariantKey,
    ethicsApproved: resolved.metadata.ethicsApproved,
    ethicsBlockedPatterns: resolved.metadata.ethicsBlockedPatterns,
    ethicsFallbackApplied: resolved.metadata.ethicsFallbackApplied,
    ethicsFallbackReason: resolved.metadata.ethicsFallbackReason,
    reasoning: resolved.metadata.reasoning,
    toolSuccessCount,
    toolFailureCount,
    plannedTools: event.toolPlan.map((tool) => ({
      name: tool.name,
      phase: tool.phase,
      reason: tool.reason,
    })),
    finalResolvedDecision: toJsonSafe(event.finalResolvedDecision || null),
    deterministicPlanSnapshot: toJsonSafe(
      event.deterministicPlanSnapshot || null
    ),
    deliveryConfirmed: false,
  };
};

const resolveSalesReplyBase = (
  snapshot: RevenueBrainExecutionSnapshot["deterministicPlanSnapshot"] | null
) => {
  const resolved = snapshot?.resolvedDecision;

  return {
    planKey: ((snapshot?.planKey || "PRO") as any),
    cta: snapshot?.reply.cta || resolved?.cta || "REPLY_DM",
    angle: snapshot?.reply.angle || "value",
    stage: snapshot?.state.stage || "DISCOVERY",
    temperature: snapshot?.intent.temperature || "COLD",
    intent: snapshot?.intent.intent || "GENERAL",
    decisionIntent: snapshot?.intent.decisionIntent || null,
    emotion: snapshot?.context.emotion || null,
    userSignal: snapshot?.intent.userSignal || null,
    objection: snapshot?.intent.objection || "NONE",
    variantId: resolved?.metadata.variantId || null,
    variantKey: resolved?.metadata.variantKey || null,
    variantTone: resolved?.tone || null,
    variantCTAStyle: resolved?.metadata.ctaStyle || null,
    variantMessageLength: resolved?.metadata.messageLength || null,
    decisionStrategy: resolved?.metadata.strategy || null,
    decisionTone: resolved?.tone || null,
    decisionStructure: resolved?.metadata.structure || null,
    conversionScore: resolved?.metadata.conversionScore || null,
    conversionBucket: resolved?.metadata.conversionBucket || null,
    trustLevel: resolved?.metadata.trustLevel || null,
    urgencyLevel: resolved?.metadata.urgencyLevel || null,
    negotiationMode: resolved?.metadata.negotiationMode || null,
    offerType: resolved?.metadata.offerType || null,
    closeMotion: resolved?.metadata.closeMotion || null,
    experimentArm: resolved?.metadata.experimentArm || null,
    leadState: snapshot?.state.nextState || null,
    action: resolved?.action || null,
    actionPriority: resolved?.priority || null,
    funnelPosition: snapshot?.context.funnelPosition || null,
  };
};

export const buildRevenueBrainDeliveryReplyEventInput = (
  event: RevenueBrainDeliveryConfirmedEvent
) => {
  const snapshot = event.planSnapshot;
  const base = resolveSalesReplyBase(snapshot);

  return {
    businessId: event.businessId,
    leadId: event.leadId,
    planKey: base.planKey,
    cta: base.cta,
    angle: base.angle,
    stage: base.stage,
    temperature: base.temperature,
    intent: base.intent,
    decisionIntent: base.decisionIntent,
    emotion: base.emotion,
    userSignal: base.userSignal,
    objection: base.objection,
    platform: event.delivery.platform,
    source: `REVENUE_BRAIN_${snapshot?.resolvedDecision.route || event.route}`,
    variantId: base.variantId,
    variantKey: base.variantKey,
    variantTone: base.variantTone,
    variantCTAStyle: base.variantCTAStyle,
    variantMessageLength: base.variantMessageLength,
    decisionStrategy: base.decisionStrategy,
    decisionTone: base.decisionTone,
    decisionStructure: base.decisionStructure,
    conversionScore: base.conversionScore,
    conversionBucket: base.conversionBucket,
    trustLevel: base.trustLevel,
    urgencyLevel: base.urgencyLevel,
    negotiationMode: base.negotiationMode,
    offerType: base.offerType,
    closeMotion: base.closeMotion,
    experimentArm: base.experimentArm,
    leadState: base.leadState,
    action: base.action,
    actionPriority: base.actionPriority,
    funnelPosition: base.funnelPosition,
  };
};

export const buildRevenueBrainDeliveryFailureReplyEventInput = (
  event: RevenueBrainDeliveryFailedEvent
) => {
  const snapshot = event.planSnapshot;
  const base = resolveSalesReplyBase(snapshot);

  return {
    businessId: event.businessId,
    leadId: event.leadId,
    route: snapshot?.resolvedDecision.route || event.route,
    planKey: base.planKey,
    cta: base.cta,
    angle: base.angle,
    stage: base.stage,
    temperature: base.temperature,
    intent: base.intent,
    decisionIntent: base.decisionIntent,
    emotion: base.emotion,
    userSignal: base.userSignal,
    objection: base.objection,
    platform: event.delivery.platform,
    source: `REVENUE_BRAIN_${snapshot?.resolvedDecision.route || event.route}`,
    variantId: base.variantId,
    variantKey: base.variantKey,
    variantTone: base.variantTone,
    variantCTAStyle: base.variantCTAStyle,
    variantMessageLength: base.variantMessageLength,
    decisionStrategy: base.decisionStrategy,
    decisionTone: base.decisionTone,
    decisionStructure: base.decisionStructure,
    conversionScore: base.conversionScore,
    conversionBucket: base.conversionBucket,
    trustLevel: base.trustLevel,
    urgencyLevel: base.urgencyLevel,
    negotiationMode: base.negotiationMode,
    offerType: base.offerType,
    closeMotion: base.closeMotion,
    experimentArm: base.experimentArm,
    leadState: base.leadState,
    action: base.action,
    actionPriority: base.actionPriority,
    funnelPosition: base.funnelPosition,
    failureReason: event.failure.reason,
    failureStage: event.failure.stage,
    currentAttempt: event.failure.currentAttempt,
    maxAttempts: event.failure.maxAttempts,
    willRetry: event.failure.willRetry,
    terminal: event.failure.terminal,
    deliveryMode: event.delivery.mode,
  };
};

export const registerRevenueBrainAnalyticsTracker = () => {
  registerRevenueBrainSubscriber("revenue_brain.analytics", () => {
    subscribeRevenueBrainEvent(
      "revenue_brain.tool_executed",
      async (event) => {
        if (event.context.preview) {
          return;
        }

        await prisma.analytics.create({
          data: {
            businessId: event.context.businessId,
            type: "REVENUE_BRAIN_TOOL",
            meta: {
              traceId: event.traceId,
              leadId: event.context.leadId,
              tool: event.tool.name,
              phase: event.tool.phase,
              status: event.tool.status,
              error: event.tool.error || null,
              payload: toJsonSafe(event.tool.payload),
            },
          },
        });
      },
      {
        handlerId: "analytics.tool_executed",
      }
    );

    subscribeRevenueBrainEvent(
      "revenue_brain.completed",
      async (event) => {
        if (event.context.preview) {
          return;
        }

        await prisma.analytics.create({
          data: {
            businessId: event.context.businessId,
            type: "REVENUE_CONVERSION_STRATEGY",
            meta: {
              traceId: event.traceId,
              leadId: event.context.leadId,
              route: event.finalResolvedDecision.route,
              action: event.finalResolvedDecision.action,
              cta: event.finalResolvedDecision.cta,
              priority: event.finalResolvedDecision.priority,
              tone: event.finalResolvedDecision.tone,
              variantId: event.finalResolvedDecision.metadata.variantId,
              variantKey: event.finalResolvedDecision.metadata.variantKey,
              learningArmKey:
                event.finalResolvedDecision.metadata.learningArmKey,
              score: event.finalResolvedDecision.metadata.conversionScore,
              bucket: event.finalResolvedDecision.metadata.conversionBucket,
              objectionPath:
                event.finalResolvedDecision.metadata.objectionPath,
              trustLevel: event.finalResolvedDecision.metadata.trustLevel,
              trustInjectionType:
                event.finalResolvedDecision.metadata.trustInjectionType,
              urgencyLevel: event.finalResolvedDecision.metadata.urgencyLevel,
              urgencyReason: event.finalResolvedDecision.metadata.urgencyReason,
              negotiationMode:
                event.finalResolvedDecision.metadata.negotiationMode,
              offerType: event.finalResolvedDecision.metadata.offerType,
              closeMotion: event.finalResolvedDecision.metadata.closeMotion,
              experimentArm: event.finalResolvedDecision.metadata.experimentArm,
              experimentVariantId:
                event.finalResolvedDecision.metadata.experimentVariantId,
              experimentVariantKey:
                event.finalResolvedDecision.metadata.experimentVariantKey,
              ethicsApproved:
                event.finalResolvedDecision.metadata.ethicsApproved,
              blockedPatterns:
                event.finalResolvedDecision.metadata.ethicsBlockedPatterns,
              ethicsFallbackApplied:
                event.finalResolvedDecision.metadata.ethicsFallbackApplied,
              ethicsFallbackReason:
                event.finalResolvedDecision.metadata.ethicsFallbackReason,
              reasoning:
                event.finalResolvedDecision.metadata.reasoning.slice(0, 12),
            },
          },
        });

        await prisma.analytics.create({
          data: {
            businessId: event.context.businessId,
            type: "REVENUE_BRAIN_COMPLETED",
            meta: buildRevenueBrainCompletedAnalyticsMeta(event),
          },
        });
      },
      {
        handlerId: "analytics.completed",
      }
    );

    subscribeRevenueBrainEvent(
      "revenue_brain.delivery_confirmed",
      async (event) => {
        if (!event.planSnapshot || event.planSnapshot.preview) {
          return;
        }

        await prisma.analytics.create({
          data: {
            businessId: event.businessId,
            type: "REVENUE_BRAIN_DELIVERY_CONFIRMED",
            meta: {
              traceId: event.traceId,
              leadId: event.leadId,
              messageId: event.messageId,
              route: event.route,
              platform: event.delivery.platform,
              deliveryMode: event.delivery.mode,
              confirmedAt: event.delivery.confirmedAt,
              source: event.source,
              finalResolvedDecision: toJsonSafe(
                event.planSnapshot.resolvedDecision
              ),
              deterministicPlanSnapshot: toJsonSafe(event.planSnapshot),
              deliveryConfirmed: true,
            },
          },
        });

        if (
          isRevenueBrainProductionLearningEligible({
            mode: event.delivery.mode,
            preview: event.delivery.preview,
            simulation: event.delivery.simulation,
            sandbox: event.delivery.sandbox,
            production: event.delivery.production,
          })
        ) {
          await markKnowledgeRetrieved(
            event.planSnapshot.context.knowledgeHitIds
          );

          await recordSalesReplyEvent(
            buildRevenueBrainDeliveryReplyEventInput(event)
          );
        }
      },
      {
        handlerId: "analytics.delivery_confirmed",
      }
    );

    subscribeRevenueBrainEvent(
      "revenue_brain.delivery_failed",
      async (event) => {
        await prisma.analytics.create({
          data: {
            businessId: event.businessId,
            type: "REVENUE_BRAIN_DELIVERY_FAILED",
            meta: {
              traceId: event.traceId,
              leadId: event.leadId,
              route: event.route,
              source: event.source,
              platform: event.delivery.platform,
              deliveryMode: event.delivery.mode,
              failedAt: event.delivery.failedAt,
              preview: event.delivery.preview,
              simulation: event.delivery.simulation,
              sandbox: event.delivery.sandbox,
              production: event.delivery.production,
              failureStage: event.failure.stage,
              failureReason: event.failure.reason,
              currentAttempt: event.failure.currentAttempt,
              maxAttempts: event.failure.maxAttempts,
              willRetry: event.failure.willRetry,
              terminal: event.failure.terminal,
              finalResolvedDecision: toJsonSafe(
                event.planSnapshot?.resolvedDecision || null
              ),
              deterministicPlanSnapshot: toJsonSafe(event.planSnapshot),
            },
          },
        });

        if (
          event.failure.terminal &&
          isRevenueBrainProductionLearningEligible({
            mode: event.delivery.mode,
            preview: event.delivery.preview,
            simulation: event.delivery.simulation,
            sandbox: event.delivery.sandbox,
            production: event.delivery.production,
          })
        ) {
          await recordSalesReplyFailureEvent(
            buildRevenueBrainDeliveryFailureReplyEventInput(event)
          );
        }
      },
      {
        handlerId: "analytics.delivery_failed",
      }
    );

    subscribeRevenueBrainEvent(
      "revenue_brain.failed",
      async (event) => {
        await prisma.analytics.create({
          data: {
            businessId: event.input.businessId,
            type: "REVENUE_BRAIN_FAILED",
            meta: {
              traceId: event.traceId,
              leadId: event.input.leadId,
              error: event.error,
              source: event.input.source || null,
            },
          },
        });
      },
      {
        handlerId: "analytics.failed",
      }
    );
  });
};
