import type {
  SalesAgentContext,
  SalesAgentReply,
  SalesCTA,
  SalesIntent,
  SalesResponseCTA,
  SalesResponseIntent,
  SalesResponseLeadType,
  SalesResponseStage,
  SalesStructuredOutput,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeMessage = (message: string) => String(message || "").trim();

export const estimateSalesIntentConfidence = (
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

const toResponseIntent = (intent: SalesIntent): SalesResponseIntent => {
  if (intent === "PRICING") return "price";
  if (intent === "BOOKING" || intent === "PURCHASE") return "booking";
  if (intent === "OBJECTION" || intent === "FOLLOW_UP") return "support";
  if (
    intent === "GENERAL" ||
    intent === "QUALIFICATION" ||
    intent === "ENGAGEMENT" ||
    intent === "GREETING"
  ) {
    return "info";
  }

  return "other";
};

const toResponseStage = (
  context?: SalesAgentContext | null
): SalesResponseStage => {
  if (!context) {
    return "DISCOVERY";
  }

  const action = context.decision?.action || context.progression.currentAction;
  const profileStage = String(context.profile.stage || "").trim().toUpperCase();

  if (action === "CLOSE" || context.profile.intent === "PURCHASE") {
    return "CLOSED";
  }

  if (action === "BOOK" || context.profile.intent === "BOOKING") {
    return "BOOKING";
  }

  if (action === "HANDLE_OBJECTION" || context.profile.intent === "OBJECTION") {
    return "OBJECTION";
  }

  if (
    action === "SHOW_PRICING" ||
    action === "SUGGEST_PLAN" ||
    action === "PUSH_CTA" ||
    context.profile.intent === "PRICING"
  ) {
    return "PITCH";
  }

  if (
    profileStage === "QUALIFIED" ||
    profileStage === "READY_TO_BUY" ||
    profileStage === "INTERESTED" ||
    context.profile.temperature === "HOT" ||
    context.profile.qualification.missingFields.length <= 1
  ) {
    return "QUALIFIED";
  }

  return "DISCOVERY";
};

const toResponseLeadType = (
  context?: SalesAgentContext | null
): SalesResponseLeadType => {
  const temperature = String(context?.profile.temperature || "").toUpperCase();

  if (temperature === "HOT") return "HIGH";
  if (temperature === "WARM") return "MEDIUM";
  return "LOW";
};

const toResponseCta = (cta?: SalesCTA | null): SalesResponseCTA => {
  if (cta === "BOOK_CALL" || cta === "BUY_NOW") {
    return "book";
  }

  if (cta === "NONE") {
    return "none";
  }

  return "ask_more";
};

const normalizeReason = (reason?: string | null) =>
  String(reason || "").trim() || "sales_framework_response";

const normalizeConfidence = (value?: number | null) =>
  Number.isFinite(value) ? clamp(Number(value), 0, 1) : null;

export const buildFallbackStructuredSalesOutput = (
  reply: Pick<SalesAgentReply, "message" | "cta" | "reason" | "confidence">
): SalesStructuredOutput => ({
  message: normalizeMessage(reply.message),
  intent: "other",
  stage: "DISCOVERY",
  leadType: "LOW",
  cta: toResponseCta(reply.cta),
  confidence: normalizeConfidence(reply.confidence) ?? 0.35,
  reason: normalizeReason(reply.reason),
});

export const buildStructuredSalesOutput = ({
  context,
  reply,
}: {
  context: SalesAgentContext;
  reply: Pick<SalesAgentReply, "message" | "cta" | "reason" | "confidence">;
}): SalesStructuredOutput => ({
  message: normalizeMessage(reply.message),
  intent: toResponseIntent(context.profile.intent),
  stage: toResponseStage(context),
  leadType: toResponseLeadType(context),
  cta: toResponseCta(reply.cta),
  confidence:
    normalizeConfidence(reply.confidence) ??
    estimateSalesIntentConfidence(
      context.inboundMessage,
      context.profile.intent
    ),
  reason: normalizeReason(reply.reason),
});
