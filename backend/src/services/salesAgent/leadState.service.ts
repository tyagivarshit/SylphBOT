import prisma from "../../config/prisma";
import logger from "../../utils/logger";
import type { LeadRevenueState, SalesIntent } from "./types";

type LeadStateOutcome =
  | "replied"
  | "link_clicked"
  | "booked_call"
  | "payment_completed"
  | "opened";

type UpdateLeadStateInput = {
  businessId?: string | null;
  leadId: string;
  message?: string | null;
  intent?: SalesIntent | string | null;
  outcome?: LeadStateOutcome | string | null;
  absoluteLeadScore?: number | null;
  scoreDelta?: number;
  preferredStage?: string | null;
  preferredAiStage?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

type LeadSnapshot = {
  id: string;
  businessId: string;
  leadScore: number;
  revenueState: string | null;
  stage: string | null;
  aiStage: string | null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeState = (value?: string | null): LeadRevenueState => {
  const normalized = String(value || "").toUpperCase();

  if (normalized === "CONVERTED") return "CONVERTED";
  if (normalized === "HOT") return "HOT";
  if (normalized === "WARM") return "WARM";
  return "COLD";
};

const normalizeOutcome = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

const signalDeltaFromOutcome = (outcome?: string | null) => {
  switch (normalizeOutcome(outcome)) {
    case "payment_completed":
      return 40;
    case "booked_call":
      return 28;
    case "link_clicked":
      return 12;
    case "replied":
      return 7;
    case "opened":
      return 3;
    default:
      return 0;
  }
};

const signalDeltaFromMessage = (message?: string | null) => {
  const text = String(message || "").toLowerCase();
  let delta = 0;

  if (!text) {
    return delta;
  }

  if (/price|pricing|cost|budget|fees/.test(text)) delta += 6;
  if (/book|schedule|slot|call|meeting|demo/.test(text)) delta += 10;
  if (/buy|purchase|pay|payment|checkout|invoice/.test(text)) delta += 14;
  if (/urgent|asap|today|now|ready/.test(text)) delta += 5;
  if (/not interested|stop|leave me|unsubscribe/.test(text)) delta -= 20;
  if (/later|not now|maybe|thinking/.test(text)) delta -= 3;

  return delta;
};

const stateFromScore = (
  score: number,
  outcome?: string | null,
  existingState?: string | null
): LeadRevenueState => {
  const normalizedOutcome = normalizeOutcome(outcome);

  if (normalizedOutcome === "payment_completed") {
    return "CONVERTED";
  }

  if (normalizeState(existingState) === "CONVERTED") {
    return "CONVERTED";
  }

  if (score >= 28) return "HOT";
  if (score >= 10) return "WARM";
  return "COLD";
};

const stageFromState = ({
  state,
  outcome,
  preferredStage,
}: {
  state: LeadRevenueState;
  outcome?: string | null;
  preferredStage?: string | null;
}) => {
  const normalizedOutcome = normalizeOutcome(outcome);

  if (normalizedOutcome === "payment_completed") return "WON";
  if (normalizedOutcome === "booked_call") return "BOOKED_CALL";
  if (state === "CONVERTED") return preferredStage || "WON";
  if (state === "HOT") return preferredStage || "READY_TO_BUY";
  if (state === "WARM") return preferredStage || "INTERESTED";
  return preferredStage || "NEW";
};

const aiStageFromState = (
  state: LeadRevenueState,
  preferredAiStage?: string | null
) => {
  if (state === "CONVERTED") return "HOT";
  return preferredAiStage || state;
};

const getReason = (input: UpdateLeadStateInput, nextState: LeadRevenueState) => {
  if (input.outcome) {
    return `outcome:${normalizeOutcome(input.outcome)}`;
  }

  if (input.intent) {
    return `intent:${String(input.intent).toUpperCase()}`;
  }

  return `score:${nextState.toLowerCase()}`;
};

const getLead = async (leadId: string): Promise<LeadSnapshot | null> =>
  prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      id: true,
      businessId: true,
      leadScore: true,
      revenueState: true,
      stage: true,
      aiStage: true,
    },
  });

export const getLeadStateDirective = (state: LeadRevenueState) => {
  if (state === "CONVERTED") {
    return "The lead has converted. Be helpful, confirm next steps, and avoid pushing a new sale.";
  }

  if (state === "HOT") {
    return "Lead is hot: use urgency plus one clear CTA. Push booking or payment with confidence, but avoid pressure.";
  }

  if (state === "WARM") {
    return "Lead is warm: lead with value, answer the real objection, and move them toward a low-friction CTA.";
  }

  return "Lead is cold: create curiosity, stay brief, ask one easy question, and avoid heavy selling.";
};

export const updateLeadState = async (
  input: UpdateLeadStateInput
): Promise<{
  state: LeadRevenueState;
  previousState: LeadRevenueState;
  leadScore: number;
  stage: string;
  aiStage: string;
  directive: string;
}> => {
  const lead = await getLead(input.leadId);

  if (!lead) {
    throw new Error("Lead not found");
  }

  const previousState = normalizeState(lead.revenueState || lead.aiStage);
  const currentScore = Number(lead.leadScore || 0);
  const eventDelta =
    input.scoreDelta ||
    signalDeltaFromOutcome(input.outcome) +
      signalDeltaFromMessage(input.message);
  const nextScore =
    typeof input.absoluteLeadScore === "number"
      ? clamp(input.absoluteLeadScore, 0, 100)
      : clamp(currentScore + eventDelta, 0, 100);
  const nextState = stateFromScore(
    nextScore,
    input.outcome,
    lead.revenueState
  );
  const nextStage = stageFromState({
    state: nextState,
    outcome: input.outcome,
    preferredStage: input.preferredStage,
  });
  const nextAiStage = aiStageFromState(nextState, input.preferredAiStage);
  const now = new Date();
  const normalizedOutcome = normalizeOutcome(input.outcome);

  const data: Record<string, unknown> = {
    leadScore: nextScore,
    revenueState: nextState,
    stage: nextStage,
    aiStage: nextAiStage,
  };

  if (["replied", "opened", "link_clicked"].includes(normalizedOutcome)) {
    data.lastEngagedAt = now;
  }

  if (normalizedOutcome === "link_clicked") {
    data.lastClickedAt = now;
  }

  if (normalizedOutcome === "booked_call") {
    data.lastBookedAt = now;
  }

  if (normalizedOutcome === "payment_completed") {
    data.lastConvertedAt = now;
  }

  await prisma.lead.update({
    where: {
      id: input.leadId,
    },
    data: data as any,
  });

  if (previousState !== nextState || eventDelta !== 0 || input.outcome) {
    await prisma.leadStateHistory.create({
      data: {
        businessId: input.businessId || lead.businessId,
        leadId: input.leadId,
        previousState,
        nextState,
        reason: getReason(input, nextState),
        scoreDelta:
          typeof input.absoluteLeadScore === "number"
            ? nextScore - currentScore
            : eventDelta,
        metadata: {
          source: input.source || null,
          outcome: input.outcome || null,
          intent: input.intent || null,
          previousStage: lead.stage || null,
          nextStage,
          ...(input.metadata || {}),
        },
      },
    });
  }

  logger.debug(
    {
      leadId: input.leadId,
      businessId: input.businessId || lead.businessId,
      previousState,
      nextState,
      nextScore,
      outcome: input.outcome || null,
      source: input.source || null,
    },
    "Lead state evaluated"
  );

  return {
    state: nextState,
    previousState,
    leadScore: nextScore,
    stage: nextStage,
    aiStage: nextAiStage,
    directive: getLeadStateDirective(nextState),
  };
};

export const getLeadStateContext = async (leadId: string) => {
  const lead = await getLead(leadId);
  const state = normalizeState(lead?.revenueState || lead?.aiStage);

  return {
    state,
    directive: getLeadStateDirective(state),
  };
};
