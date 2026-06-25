import type {
  SalesAgentContext,
  SalesAgentReply,
  SalesAngle,
  SalesCTA,
} from "./types";
import { container } from "../../runtime/core";
import {
  buildFallbackReplyMessage,
  finalizeSalesReply,
  getFallbackAngle,
  getFallbackCta,
} from "./replyGuardrails.service";

const MAX_REPLY_LENGTH: Record<string, number> = {
  BASIC: 220,
  PRO: 260,
  ELITE: 320,
  FREE_LOCKED: 180,
};

const VARIANT_LENGTH_CAP: Record<string, number> = {
  micro: 160,
  short: 220,
  medium: 280,
  detailed: 340,
};

const dedupeTrailingUserMessage = (context: SalesAgentContext) => {
  const last = context.memory.conversation[context.memory.conversation.length - 1];

  if (
    last?.role === "user" &&
    last.content.trim().toLowerCase() ===
      context.inboundMessage.trim().toLowerCase()
  ) {
    return context.memory.conversation.slice(0, -1);
  }

  return context.memory.conversation;
};

export const buildSalesAgentMessages = (context: SalesAgentContext) => {
  const recentConversation = dedupeTrailingUserMessage(context).slice(-4);
  const decision = context.decision;
  const variant = decision?.variant || context.variant;
  const targetLength =
    decision?.messageLength ||
    variant?.messageLength ||
    context.optimization.recommendedMessageLength ||
    "short";
  const maxLength =
    VARIANT_LENGTH_CAP[String(targetLength).toLowerCase()] ||
    MAX_REPLY_LENGTH[context.planKey];

  const conversionRules = `
- If the user asks price, ask 1 qualifying question first.
- If the user shows buying interest, suggest booking or purchase immediately.
- If the user hesitates, handle the objection before pushing again.
- Every response must move the conversation forward.
`.trim();

  const planRules = `
- Plan: ${context.capabilities.label} (${context.planKey})
- Intelligence tier: ${context.capabilities.intelligenceTier}
- Max qualification questions: ${context.capabilities.maxQualificationQuestions}
- Primary CTAs: ${context.capabilities.primaryCtas.join(", ")}
- ${context.capabilities.systemDirective}
`.trim();

  const leadProfile = `
- Revenue state: ${context.leadState.state}
- State directive: ${context.leadState.directive}
- Temperature: ${context.profile.temperature}
- Stage: ${context.profile.stage}
- Intent Category: ${context.profile.intentCategory}
- Emotion: ${context.profile.emotion}
- Objection: ${context.profile.objection.label}
- Missing qualification fields: ${
    context.profile.qualification.missingFields.join(", ") || "none"
  }
- Intent goal: ${context.profile.intentDirective.primaryGoal}
- Intent rule: ${context.profile.intentDirective.responseRule}
- Intent CTA: ${context.profile.intentDirective.cta}
- Intent angle: ${context.profile.intentDirective.angle}
- Previous intent: ${context.progression.previousIntent || "none"}
- Previous CTA: ${context.progression.previousCTA || "none"}
- Last action: ${context.progression.lastAction || "none"}
- Funnel position: ${context.progression.funnelPosition}
- User signal: ${context.profile.userSignal}
- Loop detected: ${context.progression.loopDetected ? "yes" : "no"}
`.trim();

  const decisionEngineInstructions = `
- Action: ${decision?.action || context.progression.currentAction}
- Action priority: ${decision?.priority || context.progression.actionPriority}
- Strategy: ${decision?.strategy || "ENGAGEMENT"}
- Best CTA: ${decision?.cta || context.optimization.recommendedCTA}
- Best tone: ${decision?.tone || variant?.tone || context.optimization.recommendedTone || "human-confident"}
- Best structure: ${decision?.structure || variant?.structure || "value_proof_cta"}
- CTA style: ${decision?.ctaStyle || variant?.ctaStyle || context.optimization.recommendedCTAStyle || "single-clear-cta"}
- Target length: ${targetLength}
- Selected variant: ${variant?.label || "default"}
- Variant instructions: ${variant?.instructions || "Use the strongest recent pattern without sounding scripted."}
- Top patterns: ${
    decision?.topPatterns?.length
      ? decision.topPatterns.join(" | ")
      : context.optimization.topPatterns?.join(" | ") || "none yet"
  }
- Guidance: ${decision?.guidance || context.optimization.guidance}
`.trim();

  const outputRules = `
- Keep the reply under ${maxLength} characters.
- Use 2 to 4 short lines only.
- Use one CTA path only.
- Keep questions minimal.
- The message must directly address the latest user message and end with a next step.
- No bullet list.
- No markdown.
- Return strict JSON only with keys: message, intent, stage, leadType, cta, confidence, reason.
- Allowed intent values: price, info, booking, support, other.
- Allowed stage values: DISCOVERY, QUALIFIED, PITCH, OBJECTION, BOOKING, CLOSED.
- Allowed leadType values: LOW, MEDIUM, HIGH.
- Allowed cta values: book, ask_more, none.
- confidence must be a number between 0 and 1.
`.trim();

  const optimizationInsight = `
- Recommended angle: ${context.optimization.recommendedAngle}
- Recommended CTA: ${context.optimization.recommendedCTA}
- Recommended tone: ${context.optimization.recommendedTone || "human-confident"}
- Recommended CTA style: ${context.optimization.recommendedCTAStyle || "single-clear-cta"}
- Recommended length: ${context.optimization.recommendedMessageLength || "short"}
- Decision CTA: ${decision?.cta || context.optimization.recommendedCTA}
- Decision tone: ${decision?.tone || context.optimization.recommendedTone || "human-confident"}
- Decision structure: ${decision?.structure || "value_proof_cta"}
- Top patterns: ${
    context.optimization.topPatterns?.length
      ? context.optimization.topPatterns.join(" | ")
      : "No winning pattern yet."
  }
- Guidance: ${context.optimization.guidance}
`.trim();

  const replyPolicy = `
- Latest user message type: ${context.profile.intent}
- User signal: ${context.profile.userSignal}
- Answer first, then move forward.
- Use pricing/knowledge/business context before generic sales talk.
`.trim();

  const compiler = container.resolve<any>("IPromptCompiler");
  const compiled = compiler.compile(
    context.client.id || "default_tenant",
    "sales_agent_prompt",
    "1.0.0",
    {
      input: "",
    },
    {
      conversionRules,
      planRules,
      leadProfile,
      decisionEngineInstructions,
      outputRules,
      businessName: context.business.name || "Business",
      businessIndustry: context.business.industry || "General",
      businessWebsite: context.business.website || "N/A",
      businessTone: context.client.aiTone || "Confident and human",
      businessInfo: context.client.businessInfo || "No business info provided.",
      pricingInfo: context.client.pricingInfo || "No pricing info provided.",
      faqKnowledge: context.client.faqKnowledge || "No FAQ info provided.",
      salesInstructions: context.client.salesInstructions || "Close confidently and keep replies short.",
      crmMemory: context.memory.memory || "No durable memory yet.",
      conversationSummary: context.memory.summary || "No summary yet.",
      lastConversationSummary: context.progression.lastConversationSummary || "No stored sales summary yet.",
      knowledgeHits: context.knowledge.slice(0, 2).join("\n") || "No direct knowledge hit.",
      optimizationInsight,
      inboundMessage: context.inboundMessage || "",
      lastReply: context.progression.lastReply || "No previous AI sales reply yet.",
      replyPolicy,
    }
  );

  return [
    {
      role: "system",
      content: compiled.system,
    },
    ...recentConversation.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: "user",
      content: compiled.user,
    },
  ];
};

const extractJson = (text: string) => {
  const fenced = text.match(/```json\s*([\s\S]+?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const match = text.match(/\{[\s\S]+\}/);
  return match?.[0] || text;
};

export const parseSalesAgentReply = (
  raw: string,
  context: SalesAgentContext
): SalesAgentReply | null => {
  try {
    const parsed = JSON.parse(extractJson(raw));
    const message = String(parsed.message || "").trim();

    if (!message) {
      return null;
    }

    const rawCta = String(parsed.cta || "").trim();
    const cta = rawCta.toUpperCase();
    const requestedCta = rawCta.toLowerCase();
    const angle = String(parsed.angle || "").trim().toLowerCase();
    const confidenceValue =
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : Number(parsed.confidence);
    const confidence = Number.isFinite(confidenceValue)
      ? Math.max(0, Math.min(confidenceValue, 1))
      : undefined;
    const intent = String(parsed.intent || "").trim().toLowerCase();
    const stage = String(parsed.stage || "").trim().toUpperCase();
    const leadType = String(parsed.leadType || "").trim().toUpperCase();

    const normalizedCta =
      cta === "REPLY_DM" ||
      cta === "VIEW_DEMO" ||
      cta === "BOOK_CALL" ||
      cta === "BUY_NOW" ||
      cta === "CAPTURE_LEAD" ||
      cta === "NONE"
        ? (cta as SalesCTA)
        : requestedCta === "book"
          ? "BOOK_CALL"
          : requestedCta === "ask_more"
            ? "REPLY_DM"
            : requestedCta === "none"
              ? "NONE"
              : getFallbackCta(context);

    return {
      message,
      cta: normalizedCta,
      angle:
        angle === "curiosity" ||
        angle === "urgency" ||
        angle === "social_proof" ||
        angle === "personalization" ||
        angle === "value"
          ? (angle as SalesAngle)
          : getFallbackAngle(context),
      reason: String(parsed.reason || "").trim() || null,
      confidence,
      meta: {
        requestedOutput: {
          intent:
            intent === "price" ||
            intent === "info" ||
            intent === "booking" ||
            intent === "support" ||
            intent === "other"
              ? intent
              : null,
          stage:
            stage === "DISCOVERY" ||
            stage === "QUALIFIED" ||
            stage === "PITCH" ||
            stage === "OBJECTION" ||
            stage === "BOOKING" ||
            stage === "CLOSED"
              ? stage
              : null,
          leadType:
            leadType === "LOW" ||
            leadType === "MEDIUM" ||
            leadType === "HIGH"
              ? leadType
              : null,
          cta:
            requestedCta === "book" ||
            requestedCta === "ask_more" ||
            requestedCta === "none"
              ? requestedCta
              : null,
        },
      },
    };
  } catch {
    return null;
  }
};

export const buildFallbackSalesReply = (
  context: SalesAgentContext
): SalesAgentReply => ({
  message: buildFallbackReplyMessage(context),
  cta: getFallbackCta(context),
  angle: getFallbackAngle(context),
  reason: "fallback",
});

export const enforceSalesReplyGuardrails = (
  reply: SalesAgentReply,
  context: SalesAgentContext
): SalesAgentReply => {
  const variantLength = String(context.variant?.messageLength || "").toLowerCase();
  const decisionLength = String(context.decision?.messageLength || "").toLowerCase();
  const maxLength =
    VARIANT_LENGTH_CAP[decisionLength] ||
    VARIANT_LENGTH_CAP[variantLength] ||
    MAX_REPLY_LENGTH[context.planKey] ||
    240;
  return finalizeSalesReply(reply, context, maxLength);
};
