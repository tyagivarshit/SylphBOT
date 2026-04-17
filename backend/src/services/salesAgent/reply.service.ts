import OpenAI from "openai";
import { selectBestAction } from "./decisionEngine.service";
import { buildSalesAgentContext } from "./intelligence.service";
import { recordSalesReplyEvent } from "./optimizer.service";
import { persistSalesProgressionState } from "./progression.service";
import {
  buildFallbackSalesReply,
  buildSalesAgentMessages,
  enforceSalesReplyGuardrails,
  parseSalesAgentReply,
} from "./prompt.service";
import { buildRecoverySalesReply } from "./replyGuardrails.service";
import type { SalesAgentReply } from "./types";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

type ReplyInput = {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  source?: string | null;
  preview?: boolean;
};

const createAIReply = async (input: ReplyInput): Promise<SalesAgentReply> => {
  const context = await buildSalesAgentContext(input);
  const decision = await selectBestAction({
    businessId: input.businessId,
    leadId: input.leadId,
    clientId: context.client.id || null,
    messageType: "AI_REPLY",
    leadState: context.leadState.state,
    intent: context.profile.intentCategory,
    salesIntent: context.profile.intent,
    progression: context.progression,
    emotion: context.profile.emotion,
    clientData: context.client,
    capabilities: context.capabilities,
  });
  const variant = decision?.variant || null;
  const optimizedContext = {
    ...context,
    decision,
    variant,
  };
  const promptMessages = buildSalesAgentMessages(optimizedContext);

  try {
    const response = await groq.chat.completions.create({
      model: process.env.SALES_AGENT_MODEL || "llama-3.1-8b-instant",
      temperature: optimizedContext.planKey === "ELITE" ? 0.45 : 0.35,
      max_tokens: optimizedContext.planKey === "ELITE" ? 240 : 180,
      messages: promptMessages as any,
    });

    const rawReply =
      response.choices?.[0]?.message?.content?.trim() || "";
    const parsed =
      parseSalesAgentReply(rawReply, optimizedContext) ||
      buildFallbackSalesReply(optimizedContext);
    const finalReply = enforceSalesReplyGuardrails(parsed, optimizedContext);

    if (!input.preview) {
      await persistSalesProgressionState({
        leadId: input.leadId,
        intent: context.profile.intent,
        summary: context.memory.summary,
        progression: context.progression,
        reply: finalReply,
        decision,
      }).catch(() => {});

      await recordSalesReplyEvent({
        businessId: input.businessId,
        leadId: input.leadId,
        planKey: context.planKey,
        cta: finalReply.cta,
        angle: finalReply.angle,
        stage: context.profile.stage,
        temperature: context.profile.temperature,
        intent: context.profile.intent,
        decisionIntent: context.profile.intentCategory,
        emotion: context.profile.emotion,
        objection: context.profile.objection.type,
        userSignal: context.profile.userSignal,
        platform: context.lead.platform || null,
        source: input.source || "AI_ROUTER",
        variantId: variant?.id || null,
        variantKey: variant?.variantKey || null,
        variantTone: decision?.tone || variant?.tone || null,
        variantCTAStyle: decision?.ctaStyle || variant?.ctaStyle || null,
        variantMessageLength:
          decision?.messageLength || variant?.messageLength || null,
        decisionStrategy: decision?.strategy || null,
        decisionTone: decision?.tone || null,
        decisionStructure: decision?.structure || null,
        leadState: context.leadState.state,
        action: decision?.action || null,
        actionPriority: decision?.priority || null,
        funnelPosition: context.progression.funnelPosition,
      });
    }

    return {
      ...finalReply,
      meta: {
        planKey: context.planKey,
        temperature: context.profile.temperature,
        stage: context.profile.stage,
        leadState: context.leadState.state,
        intent: context.profile.intent,
        decisionIntent: context.profile.intentCategory,
        emotion: context.profile.emotion,
        objection: context.profile.objection.type,
        qualificationMissing: context.profile.qualification.missingFields,
        userSignal: context.profile.userSignal,
        progression: context.progression,
        variantId: variant?.id || null,
        variantKey: variant?.variantKey || null,
        variantLabel: variant?.label || null,
        variantTone: decision?.tone || variant?.tone || null,
        variantCTAStyle: decision?.ctaStyle || variant?.ctaStyle || null,
        variantMessageLength:
          decision?.messageLength || variant?.messageLength || null,
        decisionStrategy: decision?.strategy || null,
        decisionTone: decision?.tone || null,
        decisionAction: decision?.action || null,
        decisionPriority: decision?.priority || null,
        decisionCTA: decision?.cta || null,
        decisionCTAStyle: decision?.ctaStyle || null,
        decisionStructure: decision?.structure || null,
        decisionMessageLength: decision?.messageLength || null,
        decisionGuidance: decision?.guidance || null,
        intentDirective: context.profile.intentDirective,
        topPatterns: decision?.topPatterns || [],
        messageType: "AI_REPLY",
      },
    };
  } catch {
    const fallback = buildFallbackSalesReply(optimizedContext);
    const finalReply = enforceSalesReplyGuardrails(fallback, optimizedContext);

    if (!input.preview) {
      await persistSalesProgressionState({
        leadId: input.leadId,
        intent: context.profile.intent,
        summary: context.memory.summary,
        progression: context.progression,
        reply: finalReply,
        decision,
      }).catch(() => {});

      await recordSalesReplyEvent({
        businessId: input.businessId,
        leadId: input.leadId,
        planKey: context.planKey,
        cta: finalReply.cta,
        angle: finalReply.angle,
        stage: context.profile.stage,
        temperature: context.profile.temperature,
        intent: context.profile.intent,
        decisionIntent: context.profile.intentCategory,
        emotion: context.profile.emotion,
        objection: context.profile.objection.type,
        userSignal: context.profile.userSignal,
        platform: context.lead.platform || null,
        source: input.source || "AI_ROUTER",
        variantId: variant?.id || null,
        variantKey: variant?.variantKey || null,
        variantTone: decision?.tone || variant?.tone || null,
        variantCTAStyle: decision?.ctaStyle || variant?.ctaStyle || null,
        variantMessageLength:
          decision?.messageLength || variant?.messageLength || null,
        decisionStrategy: decision?.strategy || null,
        decisionTone: decision?.tone || null,
        decisionStructure: decision?.structure || null,
        leadState: context.leadState.state,
        action: decision?.action || null,
        actionPriority: decision?.priority || null,
        funnelPosition: context.progression.funnelPosition,
      });
    }

    return {
      ...finalReply,
      meta: {
        planKey: context.planKey,
        temperature: context.profile.temperature,
        stage: context.profile.stage,
        leadState: context.leadState.state,
        intent: context.profile.intent,
        decisionIntent: context.profile.intentCategory,
        emotion: context.profile.emotion,
        objection: context.profile.objection.type,
        qualificationMissing: context.profile.qualification.missingFields,
        userSignal: context.profile.userSignal,
        progression: context.progression,
        variantId: variant?.id || null,
        variantKey: variant?.variantKey || null,
        variantLabel: variant?.label || null,
        variantTone: decision?.tone || variant?.tone || null,
        variantCTAStyle: decision?.ctaStyle || variant?.ctaStyle || null,
        variantMessageLength:
          decision?.messageLength || variant?.messageLength || null,
        decisionStrategy: decision?.strategy || null,
        decisionTone: decision?.tone || null,
        decisionAction: decision?.action || null,
        decisionPriority: decision?.priority || null,
        decisionCTA: decision?.cta || null,
        decisionCTAStyle: decision?.ctaStyle || null,
        decisionStructure: decision?.structure || null,
        decisionMessageLength: decision?.messageLength || null,
        decisionGuidance: decision?.guidance || null,
        intentDirective: context.profile.intentDirective,
        topPatterns: decision?.topPatterns || [],
        messageType: "AI_REPLY",
        mode: "fallback",
      },
    };
  }
};

export const generateSalesAgentReply = async (input: ReplyInput) =>
  createAIReply(input);

export const buildSalesAgentRecoveryReply = (message?: string | null) =>
  buildRecoverySalesReply(message);
