import logger from "../../utils/logger";
import { runAutomationEngine } from "../automationEngine.service";
import { registerRevenueBrainAnalyticsTracker } from "./analytics.tracker";
import { buildRevenueBrainContext } from "./context.engine";
import { resolveRevenueBrainDecision } from "./decision.engine";
import { queueRevenueBrainEvent } from "./eventBus.service";
import {
  buildRevenueBrainDeterministicPlanSnapshot,
  buildRevenueBrainReplyMeta,
  resolveRevenueBrainFinalDecision,
} from "./finalDecision.service";
import { resolveRevenueBrainIntent } from "./intent.engine";
import { registerRevenueBrainLearningTracker } from "./learning.tracker";
import {
  buildDeterministicRevenueReply,
  composeRevenueSalesReply,
} from "./responseComposer.service";
import { validateRevenueBrainInput } from "./schemaValidator.service";
import { resolveRevenueBrainState } from "./stateMachine.engine";
import {
  buildRevenueBrainToolPlan,
  mergeRevenueBrainToolPlans,
} from "./toolPlan.service";
import { runBookingTool } from "./tools/booking.tool";
import { runCouponTool } from "./tools/coupon.tool";
import { runCRMTool } from "./tools/crm.tool";
import { runEscalateTool } from "./tools/escalate.tool";
import { resolveFollowupDirective } from "./tools/followup.tool";
import type {
  RevenueBrainContext,
  RevenueBrainDecision,
  RevenueBrainFinalResolvedDecision,
  RevenueBrainInput,
  RevenueBrainIntentResult,
  RevenueBrainReply,
  RevenueBrainRoute,
  RevenueBrainStateResult,
  RevenueBrainToolArtifacts,
  RevenueBrainToolExecution,
  RevenueBrainToolPlan,
} from "./types";

const ensureTrackersRegistered = () => {
  registerRevenueBrainAnalyticsTracker();
  registerRevenueBrainLearningTracker();
};

const withRevenueBrainMeta = ({
  context,
  intent,
  reply,
  state,
  finalResolvedDecision,
  artifacts,
  toolPlan,
}: {
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  reply: RevenueBrainReply;
  state: RevenueBrainStateResult;
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
  artifacts: RevenueBrainToolArtifacts;
  toolPlan: RevenueBrainToolPlan[];
}): RevenueBrainReply => ({
  ...reply,
  meta: {
    ...buildRevenueBrainReplyMeta({
      context,
      intent,
      state,
      reply,
      toolPlan,
      finalResolvedDecision,
      existingMeta: reply.meta || {},
    }),
    revenueBrain: {
      route: finalResolvedDecision.route,
      reasoning: finalResolvedDecision.metadata.reasoning,
      conversion: {
        score: finalResolvedDecision.metadata.conversionScore,
        bucket: finalResolvedDecision.metadata.conversionBucket,
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
        ethicsBlockedPatterns:
          finalResolvedDecision.metadata.ethicsBlockedPatterns,
        ethicsFallbackApplied:
          finalResolvedDecision.metadata.ethicsFallbackApplied,
        ethicsFallbackReason:
          finalResolvedDecision.metadata.ethicsFallbackReason,
      },
      transition: {
        currentState: state.currentState,
        nextState: state.nextState,
        allowedTransitions: state.allowedTransitions,
        reason: state.transitionReason,
      },
      followup: artifacts.followup || null,
      coupon: artifacts.coupon || null,
      escalation: artifacts.escalation || null,
      notifyOwner: artifacts.notifyOwner || null,
      crmIntelligence: {
        lifecycleStage: context.crmIntelligence.lifecycle.stage,
        lifecycleStatus: context.crmIntelligence.lifecycle.status,
        commercialState: context.crmIntelligence.stateGraph.commercial.state,
        bookingState: context.crmIntelligence.stateGraph.booking.state,
        compositeScore: context.crmIntelligence.scorecard.compositeScore,
        valueTier: context.crmIntelligence.value.valueTier,
        churnRisk: context.crmIntelligence.value.churnRisk,
        primarySegment: context.crmIntelligence.segments.primarySegment,
        nextBestAction: context.crmIntelligence.behavior.nextBestAction,
        relationshipSummary: context.crmIntelligence.relationships.summary,
      },
      toolPlan,
      traceId: reply.traceId,
    },
  },
});

const publishTool = async ({
  traceId,
  context,
  tool,
}: {
  traceId: string;
  context: RevenueBrainContext;
  tool: RevenueBrainToolExecution;
}) => {
  void queueRevenueBrainEvent("revenue_brain.tool_executed", {
    traceId,
    context,
    tool,
  });
};

const buildAutomationReply = ({
  context,
  decision,
  message,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
  message: string;
}) =>
  buildDeterministicRevenueReply({
    context,
    route: "AUTOMATION",
    message,
    cta: decision.salesDecision?.cta || "REPLY_DM",
    angle:
      decision.conversion?.persuasion.angle ||
      context.salesContext.profile.intentDirective.angle ||
      "value",
    reason: "automation_route_handled",
    confidence: 0.92,
    decision,
    extraMeta: {
      automationHandled: true,
    },
  });

const getPlanPhase = (
  plan: RevenueBrainToolPlan[],
  phase: RevenueBrainToolPlan["phase"]
) => plan.filter((item) => item.phase === phase);

export const runRevenueBrainOrchestrator = async (
  input: RevenueBrainInput
): Promise<RevenueBrainReply | null> => {
  ensureTrackersRegistered();

  const startedAt = Date.now();
  const normalizedInput = validateRevenueBrainInput(input);
  const traceId =
    normalizedInput.traceId ||
    `revenue_brain_${normalizedInput.businessId.slice(-6)}_${normalizedInput.leadId.slice(-6)}`;

  try {
    void queueRevenueBrainEvent("revenue_brain.received", {
      traceId,
      startedAt,
      input: normalizedInput,
    });

    const context = await buildRevenueBrainContext({
      ...normalizedInput,
      traceId,
    });
    const intent = resolveRevenueBrainIntent(context);
    const state = await resolveRevenueBrainState({
      context,
      intent,
    });
    const initialDecision = await resolveRevenueBrainDecision({
      context,
      intent,
      state,
    });
    const tools: RevenueBrainToolExecution[] = [];
    const artifacts: RevenueBrainToolArtifacts = {};
    let route: RevenueBrainRoute = initialDecision.route;
    let reply: RevenueBrainReply | null = null;
    let finalToolPlan: RevenueBrainToolPlan[] = initialDecision.toolPlan;
    let finalDecision: RevenueBrainDecision = initialDecision;
    let finalResolvedDecision: RevenueBrainFinalResolvedDecision | null = null;

    void queueRevenueBrainEvent("revenue_brain.context_built", {
      traceId,
      context,
    });

    void queueRevenueBrainEvent("revenue_brain.intent_resolved", {
      traceId,
      context,
      intent,
      state,
    });

    void queueRevenueBrainEvent("revenue_brain.decision_made", {
      traceId,
      context,
      intent,
      state,
      decision: initialDecision,
    });

    for (const toolPlan of getPlanPhase(initialDecision.toolPlan, "before_reply")) {
      if (toolPlan.name === "booking") {
        const booking = await runBookingTool({ context });
        tools.push(booking.execution);
        artifacts.booking = booking.result;
        await publishTool({
          traceId,
          context,
          tool: booking.execution,
        });

        if (booking.result.handled && booking.result.message) {
          route = "BOOKING";
          reply = buildDeterministicRevenueReply({
            context,
            route,
            message: booking.result.message,
            cta: booking.result.cta || "BOOK_CALL",
            angle: booking.result.angle || "urgency",
            reason: booking.result.reason,
            confidence: 0.96,
            decision: initialDecision,
          });
        }
      }

      if (toolPlan.name === "coupon") {
        const coupon = await runCouponTool({ context });
        tools.push(coupon.execution);
        artifacts.coupon = coupon.result;
        await publishTool({
          traceId,
          context,
          tool: coupon.execution,
        });
      }

      if (toolPlan.name === "escalate") {
        const escalation = await runEscalateTool({
          context,
          reason: "user_requested_handoff",
        });
        tools.push(escalation.execution);
        artifacts.escalation = escalation.result;
        await publishTool({
          traceId,
          context,
          tool: escalation.execution,
        });

        if (!context.preview && !escalation.result.activated) {
          throw new Error(escalation.result.reason || "escalation_activation_failed");
        }

        route = "ESCALATE";
        reply = buildDeterministicRevenueReply({
          context,
          route,
          message: escalation.result.responseMessage,
          cta: "NONE",
          angle: "personalization",
          reason: escalation.result.reason,
          confidence: escalation.result.activated ? 0.99 : 0.9,
          decision: initialDecision,
          extraMeta: {
            escalationActivated: escalation.result.activated,
          },
        });
      }
    }

    if (!reply && route !== "NO_REPLY") {
      const automationReply = await runAutomationEngine({
        businessId: context.businessId,
        leadId: context.leadId,
        message: context.inputMessage,
      }).catch(() => null);

      if (automationReply) {
        route = "AUTOMATION";
        reply = buildAutomationReply({
          context,
          decision: initialDecision,
          message: automationReply,
        });
      }
    }

    if (!reply && route !== "NO_REPLY" && route !== "ESCALATE") {
      route = "SALES";
    }

    if (!reply && route === "SALES") {
      reply = await composeRevenueSalesReply({
        context,
        intent,
        state,
        decision: initialDecision,
        coupon: artifacts.coupon || null,
        beforeAIReply: normalizedInput.beforeAIReply,
      });
    }

    finalToolPlan = mergeRevenueBrainToolPlans(
      getPlanPhase(initialDecision.toolPlan, "before_reply"),
      buildRevenueBrainToolPlan({
        decision: initialDecision,
        route,
        hasReply: Boolean(reply),
      })
    );
    finalDecision = {
      ...initialDecision,
      toolPlan: finalToolPlan,
    };
    finalResolvedDecision = resolveRevenueBrainFinalDecision({
      context,
      route,
      decision: finalDecision,
      reply,
      toolPlan: finalToolPlan,
    });
    const deterministicPlanSnapshot = buildRevenueBrainDeterministicPlanSnapshot({
      context,
      intent,
      state,
      reply,
      toolPlan: finalToolPlan,
      finalResolvedDecision,
    });

    if (reply) {
      for (const toolPlan of finalToolPlan.filter(
        (item) => item.phase !== "before_reply"
      )) {
        if (toolPlan.name === "followup") {
          const followup = resolveFollowupDirective({
            context,
            decision: finalDecision,
            route,
            hasReply: true,
          });
          tools.push(followup.execution);
          artifacts.followup = followup.result;
          await publishTool({
            traceId,
            context,
            tool: followup.execution,
          });
        }

        if (toolPlan.name === "crm") {
          const crm = await runCRMTool({
            context,
            decision: finalDecision,
            route,
            reply,
            followup: artifacts.followup || null,
            finalResolvedDecision,
          });
          tools.push(crm.execution);
          artifacts.crm = crm.result;
          await publishTool({
            traceId,
            context,
            tool: crm.execution,
          });
        }
      }

      reply = withRevenueBrainMeta({
        context,
        intent,
        reply,
        state,
        finalResolvedDecision,
        artifacts,
        toolPlan: finalToolPlan,
      });
    }

    void queueRevenueBrainEvent("revenue_brain.completed", {
      traceId,
      startedAt,
      completedAt: Date.now(),
      input: normalizedInput,
      context,
      intent,
      state,
      decision: finalDecision,
      route,
      reply,
      toolPlan: finalToolPlan,
      tools,
      artifacts,
      finalResolvedDecision,
      deterministicPlanSnapshot,
    });

    return reply;
  } catch (error: any) {
    logger.error(
      {
        traceId,
        businessId: normalizedInput.businessId,
        leadId: normalizedInput.leadId,
        error,
      },
      "Revenue brain orchestration failed"
    );

    void queueRevenueBrainEvent("revenue_brain.failed", {
      traceId,
      startedAt,
      input: normalizedInput,
      error: error?.message || "revenue_brain_failed",
    });

    throw error;
  }
};
