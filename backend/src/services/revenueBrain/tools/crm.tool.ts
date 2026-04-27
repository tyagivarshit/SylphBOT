import { enqueueLeadIntelligenceRefresh } from "../../crm/leadIntelligence.service";
import { updateConversationState } from "../../conversationState.service";
import { cacheSalesReplyState } from "../../salesAgent/replyCache.service";
import { persistSalesProgressionState } from "../../salesAgent/progression.service";
import type { SalesActionType } from "../../salesAgent/types";
import type {
  RevenueBrainCRMResult,
  RevenueBrainContext,
  RevenueBrainDecision,
  RevenueBrainFinalResolvedDecision,
  RevenueBrainFollowupDirective,
  RevenueBrainReply,
  RevenueBrainRoute,
  RevenueBrainToolExecution,
} from "../types";

const SALES_ACTIONS = new Set<SalesActionType>([
  "SHOW_PRICING",
  "SUGGEST_PLAN",
  "PUSH_CTA",
  "CLOSE",
  "BOOK",
  "HANDLE_OBJECTION",
  "QUALIFY",
  "ENGAGE",
]);

const resolveSalesAction = (
  candidate: string | null | undefined,
  fallback: SalesActionType
): SalesActionType =>
  candidate && SALES_ACTIONS.has(candidate as SalesActionType)
    ? (candidate as SalesActionType)
    : fallback;

const buildFallbackDecision = ({
  context,
  route,
  reply,
  finalResolvedDecision,
}: {
  context: RevenueBrainContext;
  route: RevenueBrainRoute;
  reply: RevenueBrainReply;
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
}) => ({
  action: resolveSalesAction(
    finalResolvedDecision.action,
    route === "BOOKING"
      ? "BOOK"
      : context.salesContext.progression.currentAction
  ),
  priority:
    finalResolvedDecision.priority ||
    (route === "BOOKING"
      ? 90
      : context.salesContext.progression.actionPriority || 30),
  strategy:
    finalResolvedDecision.metadata.strategy ||
    (context.salesContext.profile.temperature === "HOT"
      ? ("CONVERSION" as const)
      : context.salesContext.profile.temperature === "WARM"
        ? ("BALANCED" as const)
        : ("ENGAGEMENT" as const)),
  leadState: context.salesContext.leadState.state,
  intent: context.salesContext.profile.intentCategory,
  emotion: context.salesContext.profile.emotion,
  variant: null,
  cta: finalResolvedDecision.cta || reply.cta,
  tone:
    finalResolvedDecision.tone ||
    context.salesContext.client.aiTone ||
    "human-confident",
  structure:
    finalResolvedDecision.metadata.structure ||
    (route === "BOOKING" ? "direct_close" : "value_proof_cta"),
  ctaStyle:
    finalResolvedDecision.metadata.ctaStyle ||
    (route === "BOOKING" ? "direct-booking" : "single-clear-cta"),
  messageLength: finalResolvedDecision.metadata.messageLength || "short",
  replyRate: 0,
  conversionRate: 0,
  revenuePerMessage: 0,
  topPatterns: finalResolvedDecision.metadata.reasoning.slice(0, 3) || [],
  guidance: `route:${route.toLowerCase()}`,
  reasoning: finalResolvedDecision.metadata.reasoning,
});

export const runCRMTool = async ({
  context,
  decision,
  route,
  reply,
  followup,
  finalResolvedDecision,
  queueCRMRefresh = enqueueLeadIntelligenceRefresh,
}: {
  context: RevenueBrainContext;
  decision: RevenueBrainDecision;
  route: RevenueBrainRoute;
  reply: RevenueBrainReply;
  followup?: RevenueBrainFollowupDirective | null;
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
  queueCRMRefresh?: typeof enqueueLeadIntelligenceRefresh;
}): Promise<{
  execution: RevenueBrainToolExecution;
  result: RevenueBrainCRMResult;
}> => {
  let refreshQueued = false;

  try {
    const effectiveDecision = buildFallbackDecision({
      context,
      route,
      reply,
      finalResolvedDecision,
    });
    const progression = {
      ...context.salesContext.progression,
      currentAction: effectiveDecision.action,
      actionPriority: effectiveDecision.priority,
      funnelPosition:
        route === "BOOKING"
          ? "booking"
          : context.salesContext.progression.funnelPosition,
      shouldAdvance: true,
    };

    await persistSalesProgressionState({
      leadId: context.leadId,
      intent: context.salesContext.profile.intent,
      summary: context.conversationMemory.summary,
      progression,
      reply,
      decision: effectiveDecision as any,
    });

    await cacheSalesReplyState({
      leadId: context.leadId,
      decision: effectiveDecision as any,
      progression,
      reply,
    }).catch(() => undefined);

    await updateConversationState(context.leadId, {
      revenueBrain: {
        traceId: context.traceId,
        route: finalResolvedDecision.route,
        followupAction: followup?.action || null,
        decisionAction: finalResolvedDecision.action,
        decisionCTA: finalResolvedDecision.cta,
        conversionScore: finalResolvedDecision.metadata.conversionScore,
        conversionBucket: finalResolvedDecision.metadata.conversionBucket,
        objectionPath: finalResolvedDecision.metadata.objectionPath,
        urgencyLevel: finalResolvedDecision.metadata.urgencyLevel,
        trustLevel: finalResolvedDecision.metadata.trustLevel,
        experimentArm: finalResolvedDecision.metadata.experimentArm,
        updatedAt: new Date().toISOString(),
      },
    }).catch(() => undefined);

    if (!context.preview) {
      await queueCRMRefresh({
        businessId: context.businessId,
        leadId: context.leadId,
        inputMessage: context.inputMessage,
        salesContext: context.salesContext,
        traceId: context.traceId,
        source: "REVENUE_BRAIN_CRM_TOOL",
        route: finalResolvedDecision.route,
        followupAction: followup?.action || null,
        decisionAction: effectiveDecision.action,
      });
      refreshQueued = true;
    }

    return {
      execution: {
        name: "crm",
        phase: "after_reply",
        status: "applied",
        payload: {
          route: finalResolvedDecision.route,
          decisionAction: finalResolvedDecision.action,
          followupAction: followup?.action || null,
          refreshQueued,
          conversionScore: finalResolvedDecision.metadata.conversionScore,
          experimentArm: finalResolvedDecision.metadata.experimentArm,
        },
      },
      result: {
        synced: true,
        reason: context.preview ? "crm_preview_synced" : "crm_refresh_queued",
      },
    };
  } catch (error: any) {
    return {
      execution: {
        name: "crm",
        phase: "after_reply",
        status: "failed",
        payload: {
          route: finalResolvedDecision.route,
          decisionAction: finalResolvedDecision.action,
          followupAction: followup?.action || null,
          refreshQueued: false,
          conversionScore: finalResolvedDecision.metadata.conversionScore,
          experimentArm: finalResolvedDecision.metadata.experimentArm,
        },
        error: error?.message || "crm_sync_failed",
      },
      result: {
        synced: false,
        reason: error?.message || "crm_sync_failed",
      },
    };
  }
};
