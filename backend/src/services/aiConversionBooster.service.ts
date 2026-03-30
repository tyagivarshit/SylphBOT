import prisma from "../config/prisma";

/*
=========================================================
AI CONVERSION BOOSTER (SMART + BEHAVIOR AWARE 🔥)
=========================================================
*/

interface BoosterInput {
  leadId: string;
  message: string;
  behavior?: {
    urgency?: boolean;
    pushBooking?: boolean;
  };
}

interface BoosterOutput {
  boostedMessage: string;
  applied: boolean;
}

/* =====================================================
🔥 TRIGGER CHECK
===================================================== */
const shouldApplyBooster = (message: string) => {

  const msg = message.toLowerCase();

  const triggers = [
    "price",
    "cost",
    "interested",
    "details",
    "tell me",
    "how",
    "info",
  ];

  return triggers.some((t) => msg.includes(t));
};

/* =====================================================
🔥 URGENCY
===================================================== */
const generateUrgencyLine = () => {

  const lines = [
    "⚡ Just a heads up — slots are filling fast today.",
    "⏳ Only a few spots left for today.",
    "🔥 This is getting booked quickly right now.",
  ];

  return lines[Math.floor(Math.random() * lines.length)];
};

/* =====================================================
🔥 FOMO
===================================================== */
const generateFomoLine = () => {

  const lines = [
    "Most people prefer to jump on a quick call to understand better.",
    "People usually take action at this stage to avoid missing out.",
    "This is where most customers move forward quickly.",
  ];

  return lines[Math.floor(Math.random() * lines.length)];
};

/* =====================================================
🔥 CTA (BEHAVIOR BASED)
===================================================== */
const generateCTA = (
  stage: string,
  aiStage?: string,
  behavior?: BoosterInput["behavior"]
) => {

  if (behavior?.pushBooking) {

    if (stage === "READY_TO_BUY" || aiStage === "HOT") {
      return "Want me to lock a slot for you right now?";
    }

    return "Want me to quickly book a call for you?";
  }

  return "Would you like more details?";
};

/*
=========================================================
MAIN FUNCTION
=========================================================
*/

export const applyConversionBooster = async ({
  leadId,
  message,
  behavior,
}: BoosterInput): Promise<BoosterOutput> => {

  try {

    if (!message || message.length < 10) {
      return { boostedMessage: message, applied: false };
    }

    /* 🔥 TRIGGER CHECK */
    if (!shouldApplyBooster(message)) {
      return { boostedMessage: message, applied: false };
    }

    /* 🔥 GET LEAD */
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        stage: true,
        aiStage: true,
        leadScore: true,
      },
    });

    if (!lead) {
      return { boostedMessage: message, applied: false };
    }

    /* 🔥 AVOID LOW INTENT */
    if ((lead.leadScore ?? 0) < 2) {
      return { boostedMessage: message, applied: false };
    }

    /* =====================================================
    🔥 BUILD RESPONSE
    ===================================================== */

    let extra = "";

    /* 🔥 URGENCY ONLY IF ALLOWED */
    if (behavior?.urgency) {
      extra += `\n\n${generateUrgencyLine()}`;
    }

    /* 🔥 FOMO ONLY FOR MID/HIGH INTENT */
    if ((lead.leadScore ?? 0) >= 4) {
      extra += `\n\n${generateFomoLine()}`;
    }

    /* 🔥 CTA */
    const cta = generateCTA(
      lead.stage || "NEW",
      lead.aiStage || "COLD",
      behavior
    );

    extra += `\n\n👉 ${cta}`;

    const boosted = `${message}${extra}`;

    return {
      boostedMessage: boosted.trim(),
      applied: true,
    };

  } catch (error) {

    console.error("CONVERSION BOOSTER ERROR:", error);

    return {
      boostedMessage: message,
      applied: false,
    };

  }

};