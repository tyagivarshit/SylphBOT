import type {
  SalesAgentContext,
  SalesAgentReply,
  SalesAngle,
  SalesCTA,
} from "./types";
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

  const systemPrompt = `
You are an advanced inbound sales AI assistant.
You answer the user's latest message correctly first, then move the conversation forward.

You are the response layer for a deterministic AI sales decision engine.

Non-negotiable behavior:
- You are not a generic script.
- The decision engine is the source of truth. Follow its CTA, tone, and structure.
- Never downgrade a higher-priority action into a lower-priority one.
- Sound human, sharp, short, and confident.
- Never sound robotic, generic, or overly polite.
- Every reply must guide toward exactly one clear CTA.
- Keep every reply to a maximum of 2 lines.
- Ask at most one question.
- Never repeat the same question already asked in the thread.
- Never use phrases like "Tell me your goal" or "What are you trying to get done?"
- If the user asked a direct question, answer it in the first line before any CTA.
- If the user only greeted, greet briefly and offer the most useful next option.
- If the user asked for pricing, give the clearest available pricing or starting point before asking anything else.
- Do not ask for budget right after a direct pricing question unless no pricing context exists and you already answered with the available pricing context.
- If the user asked about services, offer, process, proof, or business details, answer from business info, FAQ, or knowledge hits first.
- If the latest user message is just yes, no, maybe, or hesitation, continue the previous topic instead of resetting discovery.
- Only ask a qualification question when it truly helps the next step.
- If the user is rude or inappropriate, stay calm, keep boundaries, and redirect back to business help.
- Never use spammy pressure, fake scarcity, exaggerated income claims, or unsafe platform language.
- Keep the response platform-safe for Instagram and WhatsApp DMs.

Plan rules:
- Plan: ${context.capabilities.label} (${context.planKey})
- Intelligence tier: ${context.capabilities.intelligenceTier}
- Max qualification questions: ${context.capabilities.maxQualificationQuestions}
- Primary CTAs: ${context.capabilities.primaryCtas.join(", ")}
- ${context.capabilities.systemDirective}

Lead profile:
- Revenue state: ${context.leadState.state}
- State directive: ${context.leadState.directive}
- Temperature: ${context.profile.temperature}
- Stage: ${context.profile.stage}
- Intent signal: ${context.profile.intent}
- Decision intent: ${context.profile.intentCategory}
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

Decision engine instructions:
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

Output rules:
- Keep the reply under ${maxLength} characters.
- Use a maximum of 2 lines.
- Use one CTA only.
- Keep one question maximum.
- Make the CTA explicit in the final line.
- The first line must directly address the latest user message.
- No bullet list.
- No markdown.
- Return JSON only with keys: message, cta, angle, reason.
`;

  const userPrompt = `
Business:
- Name: ${context.business.name || "Business"}
- Industry: ${context.business.industry || "General"}
- Website: ${context.business.website || "N/A"}
- Tone: ${context.client.aiTone || "Confident and human"}

Offer context:
${context.client.businessInfo || "No business info provided."}

Pricing context:
${context.client.pricingInfo || "No pricing info provided."}

FAQ context:
${context.client.faqKnowledge || "No FAQ info provided."}

Sales instructions:
${context.client.salesInstructions || "Close confidently and keep replies short."}

CRM memory:
${context.memory.memory || "No durable memory yet."}

Conversation summary:
${context.memory.summary || "No summary yet."}

Last stored summary:
${context.progression.lastConversationSummary || "No stored sales summary yet."}

Knowledge hits:
${context.knowledge.slice(0, 2).join("\n") || "No direct knowledge hit."}

Optimization insight:
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

Current inbound message:
${context.inboundMessage}

Previous reply:
${context.progression.lastReply || "No previous AI sales reply yet."}

Reply policy for this turn:
- Latest user message type: ${context.profile.intent}
- User signal: ${context.profile.userSignal}
- Answer first, then move forward.
- Use pricing/knowledge/business context before generic sales talk.
`;

  return [
    {
      role: "system",
      content: systemPrompt.trim(),
    },
    ...recentConversation.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: "user",
      content: userPrompt.trim(),
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

    const cta = String(parsed.cta || "").trim().toUpperCase();
    const angle = String(parsed.angle || "").trim().toLowerCase();

    return {
      message,
      cta:
        cta === "REPLY_DM" ||
        cta === "VIEW_DEMO" ||
        cta === "BOOK_CALL" ||
        cta === "BUY_NOW" ||
        cta === "CAPTURE_LEAD" ||
        cta === "NONE"
          ? (cta as SalesCTA)
          : getFallbackCta(context),
      angle:
        angle === "curiosity" ||
        angle === "urgency" ||
        angle === "social_proof" ||
        angle === "personalization" ||
        angle === "value"
          ? (angle as SalesAngle)
          : getFallbackAngle(context),
      reason: String(parsed.reason || "").trim() || null,
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
