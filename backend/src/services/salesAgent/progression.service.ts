import {
  getConversationState,
  setConversationState,
  updateConversationState,
} from "../conversationState.service";
import type {
  SalesActionType,
  SalesAgentReply,
  SalesCTA,
  SalesDecisionAction,
  SalesIntent,
  SalesProgressionState,
  SalesUserSignal,
} from "./types";

type StoredSalesState = {
  previousIntent?: SalesIntent | null;
  previousCTA?: SalesCTA | null;
  lastAction?: SalesActionType | null;
  lastReply?: string | null;
  lastReplyNormalized?: string | null;
  lastConversationSummary?: string | null;
  hasShownPricing?: boolean;
  hasSuggestedPlan?: boolean;
  hasPushedCTA?: boolean;
  hasClosed?: boolean;
  repeatedIntentCount?: number;
  repeatedReplyCount?: number;
  pricingStep?: number;
  responseHistory?: string[];
};

const SALES_STATE_KEY = "salesAgent";
const SALES_STATE_NAME = "SALES_AGENT_ACTIVE";
const SALES_STATE_TTL_MINUTES = 24 * 60;

const ACTION_PRIORITY: Record<SalesActionType, number> = {
  SHOW_PRICING: 100,
  CLOSE: 100,
  SUGGEST_PLAN: 95,
  PUSH_CTA: 92,
  BOOK: 90,
  HANDLE_OBJECTION: 70,
  QUALIFY: 50,
  ENGAGE: 30,
};

const normalizeComparable = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const detectUserSignal = (message: string): SalesUserSignal => {
  const text = normalizeComparable(message);

  if (!text) return "neutral";
  if (
    /^(yes|yeah|yep|yup|ok|okay|sure|done|send it|go ahead|let s do it|book it|works|sounds good)$/.test(
      text
    ) ||
    /\b(yes|sure|send it|go ahead|book it|sounds good|works for me)\b/.test(text)
  ) {
    return "yes";
  }

  if (
    /\b(no|nope|not now|don t|do not|stop|no thanks|not interested|leave it)\b/.test(
      text
    )
  ) {
    return "no";
  }

  if (
    /\b(maybe|later|not sure|thinking|need time|hmm|hesitant|expensive|costly|budget)\b/.test(
      text
    )
  ) {
    return "hesitation";
  }

  if (message.includes("?")) {
    return "question";
  }

  return "neutral";
};

const readStoredSalesState = async (leadId: string): Promise<StoredSalesState> => {
  const state = await getConversationState(leadId);
  return (state?.context?.[SALES_STATE_KEY] || {}) as StoredSalesState;
};

const resolveEffectiveIntent = ({
  rawIntent,
  stored,
  userSignal,
}: {
  rawIntent: SalesIntent;
  stored: StoredSalesState;
  userSignal: SalesUserSignal;
}): SalesIntent => {
  if (
    (rawIntent === "GENERAL" ||
      rawIntent === "GREETING" ||
      rawIntent === "ENGAGEMENT") &&
    stored.previousIntent &&
    (userSignal === "yes" ||
      userSignal === "no" ||
      userSignal === "hesitation" ||
      userSignal === "question")
  ) {
    return stored.previousIntent;
  }

  return rawIntent;
};

const toPricingStep = (
  stored: StoredSalesState,
  userSignal: SalesUserSignal,
  loopDetected: boolean
): 0 | 1 | 2 | 3 | 4 => {
  const shownPricing = Boolean(stored.hasShownPricing);
  const suggestedPlan = Boolean(stored.hasSuggestedPlan);
  const pushedCta = Boolean(stored.hasPushedCTA);

  if (!shownPricing) return 1;
  if (!suggestedPlan) return userSignal === "yes" ? 2 : 2;
  if (!pushedCta) {
    if (userSignal === "hesitation") return 2;
    return 3;
  }

  if (userSignal === "hesitation") return 2;
  if (loopDetected || userSignal === "yes" || userSignal === "question") return 4;
  return 3;
};

const resolveActionFromIntent = ({
  intent,
  pricingStep,
  userSignal,
  stored,
}: {
  intent: SalesIntent;
  pricingStep: 0 | 1 | 2 | 3 | 4;
  userSignal: SalesUserSignal;
  stored: StoredSalesState;
}): SalesActionType => {
  if (intent === "PRICING") {
    if (pricingStep === 1) return "SHOW_PRICING";
    if (pricingStep === 2) return "SUGGEST_PLAN";
    if (pricingStep === 3) return "PUSH_CTA";
    return "CLOSE";
  }

  if (intent === "BOOKING") return "BOOK";
  if (intent === "PURCHASE") return "CLOSE";
  if (intent === "OBJECTION") return "HANDLE_OBJECTION";

  if (
    intent === "QUALIFICATION" ||
    ((intent === "GENERAL" || intent === "ENGAGEMENT") &&
      userSignal === "question" &&
      stored.previousIntent !== "PRICING")
  ) {
    return "QUALIFY";
  }

  return "ENGAGE";
};

const escalateAction = (action: SalesActionType): SalesActionType => {
  if (action === "SHOW_PRICING") return "SUGGEST_PLAN";
  if (action === "SUGGEST_PLAN") return "PUSH_CTA";
  if (action === "PUSH_CTA") return "CLOSE";
  if (action === "HANDLE_OBJECTION") return "PUSH_CTA";
  if (action === "QUALIFY") return "PUSH_CTA";
  if (action === "ENGAGE") return "QUALIFY";
  return action;
};

const funnelPositionForAction = (action: SalesActionType) => {
  if (action === "SHOW_PRICING") return "pricing_shown";
  if (action === "SUGGEST_PLAN") return "plan_suggested";
  if (action === "PUSH_CTA") return "cta_pushed";
  if (action === "CLOSE") return "closing";
  if (action === "BOOK") return "booking";
  if (action === "HANDLE_OBJECTION") return "objection_handling";
  if (action === "QUALIFY") return "qualification";
  return "engagement";
};

export const getSalesActionPriority = (action: SalesActionType) =>
  ACTION_PRIORITY[action] || 0;

export const normalizeSalesReplyFingerprint = (message?: string | null) =>
  normalizeComparable(message);

export const buildSalesProgressionState = async ({
  leadId,
  rawIntent,
  message,
  summary,
}: {
  leadId: string;
  rawIntent: SalesIntent;
  message: string;
  summary?: string | null;
}) => {
  const stored = await readStoredSalesState(leadId);
  const userSignal = detectUserSignal(message);
  const effectiveIntent = resolveEffectiveIntent({
    rawIntent,
    stored,
    userSignal,
  });
  const repeatedIntentCount =
    effectiveIntent === stored.previousIntent
      ? Number(stored.repeatedIntentCount || 0) + 1
      : 0;
  const preliminaryPricingStep =
    effectiveIntent === "PRICING"
      ? toPricingStep(stored, userSignal, false)
      : 0;
  const preliminaryAction = resolveActionFromIntent({
    intent: effectiveIntent,
    pricingStep: preliminaryPricingStep,
    userSignal,
    stored,
  });
  const loopDetected =
    repeatedIntentCount >= 1 &&
    preliminaryAction === stored.lastAction &&
    effectiveIntent === stored.previousIntent;
  const pricingStep =
    effectiveIntent === "PRICING"
      ? toPricingStep(stored, userSignal, loopDetected)
      : 0;
  const currentAction = loopDetected
    ? escalateAction(
        resolveActionFromIntent({
          intent: effectiveIntent,
          pricingStep,
          userSignal,
          stored,
        })
      )
    : resolveActionFromIntent({
        intent: effectiveIntent,
        pricingStep,
        userSignal,
        stored,
      });
  const progression: SalesProgressionState = {
    funnelPosition: funnelPositionForAction(currentAction),
    currentAction,
    actionPriority: getSalesActionPriority(currentAction),
    pricingStep,
    hasShownPricing: Boolean(stored.hasShownPricing) || pricingStep >= 1,
    hasSuggestedPlan: Boolean(stored.hasSuggestedPlan) || pricingStep >= 2,
    hasPushedCTA: Boolean(stored.hasPushedCTA) || pricingStep >= 3,
    hasClosed: Boolean(stored.hasClosed) || pricingStep >= 4,
    loopDetected,
    repeatedIntentCount,
    repeatedReplyCount: Number(stored.repeatedReplyCount || 0),
    previousIntent: stored.previousIntent || null,
    previousCTA: stored.previousCTA || null,
    lastAction: stored.lastAction || null,
    lastReply: stored.lastReply || null,
    lastReplyNormalized: stored.lastReplyNormalized || null,
    lastConversationSummary:
      String(summary || "").trim() || stored.lastConversationSummary || null,
    userSignal,
    shouldAdvance:
      loopDetected ||
      userSignal === "yes" ||
      currentAction !== stored.lastAction,
  };

  return {
    effectiveIntent,
    progression,
  };
};

const nextPricingStepFromAction = (
  action: SalesActionType,
  previousStep: number
): 0 | 1 | 2 | 3 | 4 => {
  if (action === "SHOW_PRICING") return 1;
  if (action === "SUGGEST_PLAN") return 2;
  if (action === "PUSH_CTA") return 3;
  if (action === "CLOSE" || action === "BOOK") return 4;
  return (Math.max(0, Math.min(previousStep, 4)) as 0 | 1 | 2 | 3 | 4);
};

export const persistSalesProgressionState = async ({
  leadId,
  intent,
  summary,
  progression,
  reply,
  decision,
}: {
  leadId: string;
  intent: SalesIntent;
  summary?: string | null;
  progression: SalesProgressionState;
  reply: SalesAgentReply;
  decision: SalesDecisionAction;
}) => {
  const current = await getConversationState(leadId);
  const existing = ((current?.context || {}) as Record<string, unknown>)[
    SALES_STATE_KEY
  ] as StoredSalesState | undefined;
  const replyFingerprint = normalizeSalesReplyFingerprint(reply.message);
  const responseHistory = Array.from(
    new Set([replyFingerprint, ...(existing?.responseHistory || [])].filter(Boolean))
  ).slice(0, 5);
  const nextState: StoredSalesState = {
    previousIntent: intent,
    previousCTA: reply.cta,
    lastAction: decision.action,
    lastReply: reply.message,
    lastReplyNormalized: replyFingerprint,
    lastConversationSummary:
      String(summary || "").trim() || existing?.lastConversationSummary || null,
    hasShownPricing:
      Boolean(existing?.hasShownPricing) || decision.action === "SHOW_PRICING",
    hasSuggestedPlan:
      Boolean(existing?.hasSuggestedPlan) || decision.action === "SUGGEST_PLAN",
    hasPushedCTA:
      Boolean(existing?.hasPushedCTA) ||
      decision.action === "PUSH_CTA" ||
      decision.action === "BOOK" ||
      decision.action === "CLOSE",
    hasClosed:
      Boolean(existing?.hasClosed) ||
      decision.action === "BOOK" ||
      decision.action === "CLOSE",
    repeatedIntentCount: progression.repeatedIntentCount,
    repeatedReplyCount:
      replyFingerprint && replyFingerprint === existing?.lastReplyNormalized
        ? Number(existing?.repeatedReplyCount || 0) + 1
        : 0,
    pricingStep: nextPricingStepFromAction(
      decision.action,
      progression.pricingStep
    ),
    responseHistory,
  };
  const mergedContext = {
    ...(current?.context || {}),
    [SALES_STATE_KEY]: nextState,
  };

  if (current) {
    await updateConversationState(leadId, {
      [SALES_STATE_KEY]: nextState,
    });
    return mergedContext;
  }

  await setConversationState(leadId, SALES_STATE_NAME, {
    context: mergedContext,
    ttlMinutes: SALES_STATE_TTL_MINUTES,
  });

  return mergedContext;
};
