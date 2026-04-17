import prisma from "../../config/prisma";
import { selectBestAction } from "./decisionEngine.service";
import { getSalesCapabilityProfile, resolveSalesPlanKey } from "./policy.service";
import {
  getSalesOptimizationInsights,
  recordSalesFollowupEvent,
} from "./optimizer.service";
import type {
  SalesAngle,
  SalesCTA,
  SalesDecisionAction,
  SalesFollowupStepKey,
  SalesFollowupTrigger,
  SalesLeadTemperature,
  SalesMessageVariantContext,
  SalesPlanKey,
} from "./types";

type FollowupBlueprint = {
  step: SalesFollowupStepKey;
  delayMs: number;
  angle: SalesAngle;
  trigger: SalesFollowupTrigger;
  label: string;
};

const MAX_FOLLOWUPS = 2;

const FOLLOWUP_SEQUENCE: FollowupBlueprint[] = [
  {
    step: "NO_REPLY_1H",
    delayMs: 1 * 60 * 60 * 1000,
    angle: "personalization",
    trigger: "no_reply",
    label: "No reply after first AI response",
  },
  {
    step: "NO_REPLY_24H",
    delayMs: 24 * 60 * 60 * 1000,
    angle: "social_proof",
    trigger: "no_reply",
    label: "No reply after one day",
  },
  {
    step: "NO_REPLY_48H",
    delayMs: 48 * 60 * 60 * 1000,
    angle: "urgency",
    trigger: "no_reply",
    label: "No reply after two days",
  },
  {
    step: "OPENED_NO_RESPONSE",
    delayMs: 2 * 60 * 60 * 1000,
    angle: "curiosity",
    trigger: "opened_not_responded",
    label: "Opened but did not respond",
  },
  {
    step: "CLICKED_NOT_BOOKED",
    delayMs: 30 * 60 * 1000,
    angle: "urgency",
    trigger: "clicked_not_booked",
    label: "Clicked but did not book",
  },
];

const getTemperature = (leadScore: number, aiStage?: string | null) => {
  const normalized = String(aiStage || "").toUpperCase();

  if (normalized === "HOT" || leadScore >= 18) return "HOT";
  if (normalized === "WARM" || leadScore >= 8) return "WARM";
  return "COLD";
};

const normalizeFollowupStep = (
  step: SalesFollowupStepKey
): SalesFollowupStepKey => {
  if (step === "1h") return "NO_REPLY_1H";
  if (step === "24h") return "NO_REPLY_24H";
  if (step === "48h") return "NO_REPLY_48H";
  return step;
};

const getAdaptiveDelay = (
  blueprint: FollowupBlueprint,
  temperature: SalesLeadTemperature
) => {
  if (blueprint.trigger === "clicked_not_booked") {
    return temperature === "HOT" ? 15 * 60 * 1000 : blueprint.delayMs;
  }

  if (blueprint.step === "NO_REPLY_1H") {
    if (temperature === "HOT") return 30 * 60 * 1000;
    if (temperature === "WARM") return 45 * 60 * 1000;
  }

  return blueprint.delayMs;
};

const getBlueprint = (step: SalesFollowupStepKey) =>
  FOLLOWUP_SEQUENCE.find((item) => item.step === normalizeFollowupStep(step)) ||
  FOLLOWUP_SEQUENCE[0];

const getLatestLeadSignals = async (leadId: string) => {
  const [
    latestAIMessage,
    latestUserMessage,
    latestConversionEvent,
    booking,
    recentMessages,
    recentAIMessageCount,
  ] =
    await Promise.all([
      prisma.message.findFirst({
        where: {
          leadId,
          sender: "AI",
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.message.findFirst({
        where: {
          leadId,
          sender: "USER",
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.conversionEvent.findFirst({
        where: {
          leadId,
          outcome: {
            in: ["opened", "link_clicked"],
          },
        },
        orderBy: {
          occurredAt: "desc",
        },
      }),
      prisma.appointment.findFirst({
        where: {
          leadId,
          status: {
            in: ["BOOKED", "CONFIRMED", "RESCHEDULED"],
          },
        },
      }),
      prisma.message.findMany({
        where: {
          leadId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 6,
      }),
      prisma.message.count({
        where: {
          leadId,
          sender: "AI",
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

  const userRepliedAfterAI =
    Boolean(latestAIMessage && latestUserMessage) &&
    latestUserMessage!.createdAt > latestAIMessage!.createdAt;
  const eventAfterAI =
    Boolean(latestAIMessage && latestConversionEvent) &&
    latestConversionEvent!.occurredAt > latestAIMessage!.createdAt;
  let consecutiveAIWithoutReply = 0;

  for (const message of recentMessages) {
    if (message.sender === "USER") {
      break;
    }

    if (message.sender === "AI") {
      consecutiveAIWithoutReply += 1;
    }
  }

  return {
    latestAIMessage,
    latestUserMessage,
    latestConversionEvent,
    booking,
    userRepliedAfterAI,
    eventAfterAI,
    consecutiveAIWithoutReply,
    recentAIMessageCount,
  };
};

export const getSalesFollowupTrigger = async (
  leadId: string
): Promise<SalesFollowupTrigger> => {
  const signals = await getLatestLeadSignals(leadId);

  if (
    signals.latestConversionEvent?.outcome === "link_clicked" &&
    signals.eventAfterAI &&
    !signals.booking
  ) {
    return "clicked_not_booked";
  }

  if (
    signals.latestConversionEvent?.outcome === "opened" &&
    signals.eventAfterAI &&
    !signals.userRepliedAfterAI
  ) {
    return "opened_not_responded";
  }

  return "no_reply";
};

export const shouldSendSalesFollowup = async ({
  leadId,
  step,
}: {
  leadId: string;
  step: SalesFollowupStepKey;
}) => {
  const blueprint = getBlueprint(step);
  const signals = await getLatestLeadSignals(leadId);

  if (!signals.latestAIMessage) {
    return {
      shouldSend: false,
      reason: "no_ai_message",
      trigger: blueprint.trigger,
    };
  }

  if (signals.userRepliedAfterAI) {
    return {
      shouldSend: false,
      reason: "user_replied_after_ai",
      trigger: blueprint.trigger,
    };
  }

  if (signals.booking) {
    return {
      shouldSend: false,
      reason: "already_booked",
      trigger: blueprint.trigger,
    };
  }

  if (
    blueprint.trigger === "clicked_not_booked" &&
    !(
      signals.latestConversionEvent?.outcome === "link_clicked" &&
      signals.eventAfterAI
    )
  ) {
    return {
      shouldSend: false,
      reason: "no_recent_click",
      trigger: blueprint.trigger,
    };
  }

  if (
    blueprint.trigger === "opened_not_responded" &&
    !(
      signals.latestConversionEvent?.outcome === "opened" &&
      signals.eventAfterAI
    )
  ) {
    return {
      shouldSend: false,
      reason: "no_recent_open",
      trigger: blueprint.trigger,
    };
  }

  if (signals.consecutiveAIWithoutReply >= 3 || signals.recentAIMessageCount >= 4) {
    return {
      shouldSend: false,
      reason: "over_messaging_guard",
      trigger: blueprint.trigger,
    };
  }

  return {
    shouldSend: true,
    reason: blueprint.label,
    trigger: blueprint.trigger,
  };
};

const getFollowupIntent = (trigger: SalesFollowupTrigger) => {
  if (trigger === "clicked_not_booked") return "buy" as const;
  if (trigger === "opened_not_responded") return "explore" as const;
  return "doubt" as const;
};

const getFollowupSalesIntent = (trigger: SalesFollowupTrigger) => {
  if (trigger === "clicked_not_booked") return "PURCHASE" as const;
  if (trigger === "opened_not_responded") return "ENGAGEMENT" as const;
  return "OBJECTION" as const;
};

const getFollowupEmotion = (
  trigger: SalesFollowupTrigger,
  temperature: SalesLeadTemperature
) => {
  if (trigger === "clicked_not_booked" || temperature === "HOT") {
    return "urgent" as const;
  }

  if (trigger === "opened_not_responded") {
    return "curious" as const;
  }

  return "skeptical" as const;
};

const buildFollowupCopy = ({
  step,
  trigger,
  temperature,
  businessName,
  angle,
  cta,
  decision,
  variant,
}: {
  step: SalesFollowupStepKey;
  trigger: SalesFollowupTrigger;
  temperature: SalesLeadTemperature;
  businessName: string;
  angle: SalesAngle;
  cta: SalesCTA;
  decision?: SalesDecisionAction | null;
  variant?: SalesMessageVariantContext | null;
}) => {
  const ctaLine =
    cta === "BUY_NOW"
      ? "Want the payment link?"
      : cta === "BOOK_CALL"
        ? "Want the booking link?"
        : cta === "VIEW_DEMO"
          ? "Want the quick walkthrough?"
          : "Reply with your budget range and I'll narrow it down.";
  const structureCue =
    decision?.structure?.includes("direct") ||
    variant?.ctaStyle === "direct-booking"
      ? "The fastest move is the next step now."
      : decision?.structure?.includes("proof") ||
          variant?.ctaStyle === "proof-backed"
        ? "This is usually where the proof clears things up."
        : "I can keep this simple.";

  if (trigger === "clicked_not_booked") {
    return `You already clicked, so momentum is there. ${structureCue}\n${ctaLine}`.trim();
  }

  if (trigger === "opened_not_responded") {
    return `You opened this, so I'll keep it sharp. ${structureCue}\n${ctaLine}`.trim();
  }

  if (step === "NO_REPLY_1H" || step === "1h") {
    if (temperature === "HOT") {
      return `${businessName} here. You looked close earlier, so I don't want this cooling off.\n${ctaLine}`.trim();
    }

    return `${businessName} here. Based on your last message, this still looks like a strong fit.\n${ctaLine}`.trim();
  }

  if (step === "NO_REPLY_24H" || step === "24h") {
    return angle === "social_proof"
      ? `Most serious buyers get clarity once the proof is clear.\n${ctaLine}`
      : `Quick final nudge from ${businessName}. The fastest path is still one clear next step.\n${ctaLine}`;
  }

  if (temperature === "HOT") {
    return `Last check-in from ${businessName}. If you still want this, now is the cleanest time to move.\n${ctaLine}`;
  }

  return `Last quick note from ${businessName}. If timing is the blocker, I can keep this easy.\n${ctaLine}`;
};

export const getSalesFollowupSchedule = async (
  leadId: string,
  options?: {
    trigger?: SalesFollowupTrigger;
  }
) => {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    include: {
      business: {
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    return [];
  }

  const planKey = resolveSalesPlanKey(lead.business?.subscription?.plan || null);
  const capabilities = getSalesCapabilityProfile(planKey);

  if (!capabilities.enableFollowups) {
    return [];
  }

  if (lead.stage === "CLOSED" || lead.stage === "WON" || lead.stage === "BOOKED_CALL") {
    return [];
  }

  const temperature = getTemperature(lead.leadScore || 0, lead.aiStage);
  const trigger = options?.trigger || (await getSalesFollowupTrigger(leadId));
  const schedule =
    trigger === "clicked_not_booked"
      ? FOLLOWUP_SEQUENCE.filter((item) => item.trigger === "clicked_not_booked")
      : trigger === "opened_not_responded"
        ? FOLLOWUP_SEQUENCE.filter(
            (item) => item.trigger === "opened_not_responded"
          )
        : FOLLOWUP_SEQUENCE.filter((item) => item.trigger === "no_reply");
  const remainingFollowups = Math.max(
    0,
    MAX_FOLLOWUPS - Number(lead.followupCount || 0)
  );

  if (!remainingFollowups) {
    return [];
  }

  return schedule.slice(0, remainingFollowups).map((item) => ({
    ...item,
    delayMs: getAdaptiveDelay(item, temperature),
  }));
};

export const generateSalesFollowupMessage = async ({
  leadId,
  step,
}: {
  leadId: string;
  step: SalesFollowupStepKey;
}): Promise<{
  lead: any;
  planKey: SalesPlanKey;
  temperature: SalesLeadTemperature;
  angle: SalesAngle;
  cta: SalesCTA;
  trigger: SalesFollowupTrigger;
  decision: SalesDecisionAction | null;
  variant: SalesMessageVariantContext | null;
  message: string;
} | null> => {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    include: {
      client: true,
      business: {
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
        },
      },
    },
  });

  if (!lead || !lead.client || !lead.business) {
    return null;
  }

  const planKey = resolveSalesPlanKey(lead.business.subscription?.plan || null);
  const capabilities = getSalesCapabilityProfile(planKey);

  if (!capabilities.enableFollowups) {
    return null;
  }

  const normalizedStep = normalizeFollowupStep(step);
  const sendCheck = await shouldSendSalesFollowup({
    leadId,
    step: normalizedStep,
  });

  if (!sendCheck.shouldSend) {
    return null;
  }

  const temperature = getTemperature(lead.leadScore || 0, lead.aiStage);
  const optimization = await getSalesOptimizationInsights(lead.businessId);
  const blueprint = getBlueprint(normalizedStep);
  const decision = await selectBestAction({
    businessId: lead.businessId,
    leadId: lead.id,
    clientId: lead.clientId || null,
    messageType: "FOLLOWUP",
    leadState: lead.revenueState || lead.aiStage || temperature,
    intent: getFollowupIntent(blueprint.trigger),
    salesIntent: getFollowupSalesIntent(blueprint.trigger),
    emotion: getFollowupEmotion(blueprint.trigger, temperature),
    clientData: {
      aiTone: lead.client.aiTone || null,
      businessInfo: lead.client.businessInfo || null,
      pricingInfo: lead.client.pricingInfo || null,
      faqKnowledge: lead.client.faqKnowledge || null,
      salesInstructions: lead.client.salesInstructions || null,
    },
    capabilities,
  }).catch(() => null);
  const variant = decision?.variant || null;
  const angle =
    normalizedStep === "NO_REPLY_1H"
      ? "personalization"
      : optimization.recommendedAngle || blueprint.angle;
  const cta =
    decision?.cta ||
    (temperature === "HOT"
      ? "BOOK_CALL"
      : planKey === "BASIC"
        ? "CAPTURE_LEAD"
        : "VIEW_DEMO");
  const message = buildFollowupCopy({
    step: normalizedStep,
    trigger: blueprint.trigger,
    temperature,
    businessName: lead.business.name || "our team",
    angle,
    cta,
    decision,
    variant,
  });

  return {
    lead,
    planKey,
    temperature,
    angle,
    cta,
    trigger: blueprint.trigger,
    decision,
    variant,
    message,
  };
};

export const logSalesFollowupMessage = async ({
  businessId,
  leadId,
  step,
  cta,
  angle,
  planKey,
  temperature,
  trigger,
  variantId,
}: {
  businessId: string;
  leadId: string;
  step: SalesFollowupStepKey;
  cta: SalesCTA;
  angle: SalesAngle;
  planKey: SalesPlanKey;
  temperature: SalesLeadTemperature;
  trigger?: SalesFollowupTrigger;
  variantId?: string | null;
}) =>
  recordSalesFollowupEvent({
    businessId,
    leadId,
    step,
    cta,
    angle,
    planKey,
    temperature,
    trigger,
    variantId,
  });
