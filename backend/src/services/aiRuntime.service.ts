import prisma from "../config/prisma";
import { isHumanActive } from "./humanTakeoverManager.service";
import { buildSalesAgentContext } from "./salesAgent/intelligence.service";
import {
  buildSalesAgentRecoveryReply,
  generateSalesAgentReply,
} from "./salesAgent/reply.service";
import type { SalesAgentReply, SalesIntent } from "./salesAgent/types";

type UnifiedAIInput = {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  source?: string | null;
  preview?: boolean;
};

type UnifiedIntentAnalysis = {
  intent: SalesIntent;
  confidence: number;
  stage: string;
  temperature: string;
  leadScore: number;
  decisionIntent: string;
  objection: string;
};

const SYSTEM_MESSAGE_PATTERN =
  /please wait|moment before sending|try again later|conversation limit reached/i;

const normalizeMessage = (message: string) => String(message || "").trim();

const isSystemMessage = (message: string) =>
  SYSTEM_MESSAGE_PATTERN.test(normalizeMessage(message).toLowerCase());

const checkRepeatedUserMessage = async (leadId: string, message: string) => {
  const normalized = normalizeMessage(message).toLowerCase();

  if (!normalized) {
    return false;
  }

  const recentMessages = await prisma.message.findMany({
    where: {
      leadId,
      sender: "USER",
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      content: true,
    },
  });

  const repeatedCount = recentMessages.filter((item) => {
    return normalizeMessage(item.content || "").toLowerCase() === normalized;
  }).length;

  return repeatedCount >= 3;
};

const buildSpamGuardrailReply = (): SalesAgentReply => ({
  message:
    "I saw the same question a few times.\nTell me the one thing you want first and I'll keep it clear.",
  cta: "REPLY_DM",
  angle: "personalization",
  reason: "spam_guardrail",
});

const estimateIntentConfidence = (
  message: string,
  intent: SalesIntent
): number => {
  const text = normalizeMessage(message).toLowerCase();

  if (!text) {
    return 0.35;
  }

  if (
    intent === "GREETING" &&
    /^(hi|hello|hey|hii|yo|namaste|hola|hello there|hey there)$/i.test(text)
  ) {
    return 0.98;
  }

  if (
    intent === "PRICING" &&
    /price|pricing|cost|fees|package|packages|plan|plans|investment|charges/.test(
      text
    )
  ) {
    return 0.96;
  }

  if (
    intent === "BOOKING" &&
    /book|booking|schedule|slot|call|meeting|demo/.test(text)
  ) {
    return 0.96;
  }

  if (
    intent === "PURCHASE" &&
    /buy|purchase|pay|payment|checkout|invoice|link/.test(text)
  ) {
    return 0.97;
  }

  if (
    intent === "OBJECTION" &&
    /expensive|trust|proof|review|later|not sure|skeptical|worth it/.test(text)
  ) {
    return 0.92;
  }

  if (intent === "QUALIFICATION" || intent === "ENGAGEMENT") {
    return 0.84;
  }

  if (
    intent === "GENERAL" &&
    (text.includes("?") || text.split(/\s+/).length > 4)
  ) {
    return 0.78;
  }

  return 0.7;
};

export const generateUnifiedAIReply = async (
  input: UnifiedAIInput
): Promise<SalesAgentReply | null> => {
  const message = normalizeMessage(input.message);

  if (!message || isSystemMessage(message)) {
    return null;
  }

  if (await isHumanActive(input.leadId)) {
    return null;
  }

  if (await checkRepeatedUserMessage(input.leadId, message)) {
    return buildSpamGuardrailReply();
  }

  try {
    return await generateSalesAgentReply({
      businessId: input.businessId,
      leadId: input.leadId,
      message,
      plan: input.plan,
      source: input.source || "LEGACY_COMPAT",
      preview: input.preview,
    });
  } catch {
    return buildSalesAgentRecoveryReply(message);
  }
};

export const generateUnifiedAIReplyText = async (input: UnifiedAIInput) => {
  const reply = await generateUnifiedAIReply(input);
  const text = normalizeMessage(reply?.message || "");

  return text || null;
};

export const analyzeUnifiedSalesIntent = async (
  input: UnifiedAIInput
): Promise<UnifiedIntentAnalysis> => {
  const message = normalizeMessage(input.message);

  if (!message) {
    return {
      intent: "GENERAL",
      confidence: 0.35,
      stage: "NEW",
      temperature: "COLD",
      leadScore: 0,
      decisionIntent: "explore",
      objection: "NONE",
    };
  }

  try {
    const context = await buildSalesAgentContext({
      businessId: input.businessId,
      leadId: input.leadId,
      message,
      plan: input.plan,
    });

    return {
      intent: context.profile.intent,
      confidence: estimateIntentConfidence(message, context.profile.intent),
      stage: context.profile.stage,
      temperature: context.profile.temperature,
      leadScore: context.profile.leadScore,
      decisionIntent: context.profile.intentCategory,
      objection: context.profile.objection.type,
    };
  } catch {
    return {
      intent: "GENERAL",
      confidence: 0.5,
      stage: "NEW",
      temperature: "COLD",
      leadScore: 0,
      decisionIntent: "explore",
      objection: "NONE",
    };
  }
};

export const generateUnifiedFallback = (
  message: string,
  options?: {
    previousIntent?: string | null;
    lastAction?: string | null;
  }
) => buildSalesAgentRecoveryReply(message, options).message;
