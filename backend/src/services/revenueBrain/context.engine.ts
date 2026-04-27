import crypto from "crypto";
import { getPlanKey } from "../../config/plan.config";
import { buildLeadIntelligenceProfile } from "../crm/leadIntelligence.service";
import { resolvePlanContext, type ResolvedPlanContext } from "../feature.service";
import { buildSalesAgentContext } from "../salesAgent/intelligence.service";
import { getConversationMemorySnapshot } from "./conversationMemory.service";
import { getLeadMemorySnapshot } from "./leadMemory.service";
import { getSemanticMemorySnapshot } from "./semanticMemory.service";
import type { RevenueBrainContext, RevenueBrainInput, RevenueBrainSource } from "./types";

const buildFallbackPlanContext = (plan?: unknown): ResolvedPlanContext => {
  const record =
    plan && typeof plan === "object"
      ? (plan as { name?: string | null; type?: string | null })
      : { name: "LOCKED", type: "LOCKED" };

  return {
    plan: {
      name: record.name || "LOCKED",
      type: record.type || "LOCKED",
    },
    planKey: getPlanKey({
      name: record.name || "LOCKED",
      type: record.type || "LOCKED",
    }),
    state: "LOCKED",
    source: "locked",
    lockReason: "subscription_locked",
    subscriptionStatus: null,
  };
};

const normalizeSource = (source?: string | null, preview?: boolean): RevenueBrainSource => {
  if (preview) {
    return "PREVIEW";
  }

  const normalized = String(source || "")
    .trim()
    .toUpperCase();

  if (
    normalized === "QUEUE" ||
    normalized === "PREVIEW" ||
    normalized === "API" ||
    normalized === "FOLLOWUP" ||
    normalized === "MANUAL" ||
    normalized === "AUTONOMOUS" ||
    normalized === "LEGACY_COMPAT"
  ) {
    return normalized as RevenueBrainSource;
  }

  return "QUEUE";
};

export const buildRevenueBrainContext = async (
  input: RevenueBrainInput
): Promise<RevenueBrainContext> => {
  const traceId = input.traceId?.trim() || `revenue_brain_${crypto.randomUUID()}`;
  const source = normalizeSource(input.source, input.preview);
  const planContext = await resolvePlanContext(input.businessId).catch(() =>
    buildFallbackPlanContext(input.plan)
  );
  const salesContext = await buildSalesAgentContext({
    businessId: input.businessId,
    leadId: input.leadId,
    message: input.message,
    plan: input.plan || planContext.plan,
  });

  const [leadMemory, conversationMemory, semanticMemory, crmIntelligence] =
    await Promise.all([
    getLeadMemorySnapshot({
      leadId: input.leadId,
      salesContext,
    }),
    getConversationMemorySnapshot({
      leadId: input.leadId,
      salesContext,
    }),
    getSemanticMemorySnapshot({
      businessId: input.businessId,
      message: input.message,
      salesContext,
    }),
    buildLeadIntelligenceProfile({
      businessId: input.businessId,
      leadId: input.leadId,
      inputMessage: input.message,
      salesContext,
      preview: Boolean(input.preview),
      traceId,
      source: "REVENUE_BRAIN_CONTEXT",
    }),
  ]);

  const normalizedLeadMemory = {
    ...leadMemory,
    stage: crmIntelligence.lifecycle.nextLeadStage,
    aiStage: crmIntelligence.lifecycle.nextAIStage,
    revenueState: crmIntelligence.stateGraph.commercial.state,
  };

  return {
    traceId,
    businessId: input.businessId,
    leadId: input.leadId,
    inputMessage: input.message,
    preview: Boolean(input.preview),
    source,
    planContext,
    salesContext,
    leadMemory: normalizedLeadMemory,
    conversationMemory,
    semanticMemory,
    crmIntelligence,
  };
};
