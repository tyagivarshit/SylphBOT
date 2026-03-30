import prisma from "../config/prisma";

/*
=========================================================
LEAD INTELLIGENCE ENGINE (BRAIN OF SALES SYSTEM)
=========================================================
*/

interface IntelligenceInput {
  leadId: string;
  message: string;
}

interface IntelligenceOutput {
  score: number;
  temperature: "HOT" | "WARM" | "COLD";
  stage: string;
}

/* =====================================================
🔥 SCORING RULES (ADVANCED)
===================================================== */

const calculateScore = (message: string): number => {

  const msg = message.toLowerCase();

  let score = 0;

  /* 🔥 HIGH INTENT */
  if (/buy|purchase|start|book now/.test(msg)) score += 10;

  /* 💰 MONEY SIGNAL */
  if (/price|cost|pricing|fees/.test(msg)) score += 4;

  /* 📞 CALL INTENT */
  if (/call|demo|meeting/.test(msg)) score += 6;

  /* 🤔 INTEREST */
  if (/interested|tell me|details|info/.test(msg)) score += 3;

  /* ❌ NEGATIVE */
  if (/not interested|later|busy/.test(msg)) score -= 3;

  return score;
};

/* =====================================================
🔥 TEMPERATURE DETECTION
===================================================== */

const getTemperature = (score: number) => {

  if (score >= 8) return "HOT";
  if (score >= 4) return "WARM";
  return "COLD";
};

/* =====================================================
🔥 STAGE MAPPING
===================================================== */

const getStage = (temperature: string) => {

  if (temperature === "HOT") return "READY_TO_BUY";
  if (temperature === "WARM") return "INTERESTED";
  return "NEW";
};

/* =====================================================
🔥 BEHAVIOR LOGIC (IMPORTANT)
===================================================== */

export const getBehaviorConfig = (temperature: string) => {

  if (temperature === "HOT") {
    return {
      tone: "aggressive",
      goal: "close",
      pushBooking: true,
    };
  }

  if (temperature === "WARM") {
    return {
      tone: "persuasive",
      goal: "nurture",
      pushBooking: true,
    };
  }

  return {
    tone: "soft",
    goal: "educate",
    pushBooking: false,
  };
};

/*
=========================================================
MAIN FUNCTION
=========================================================
*/

export const processLeadIntelligence = async ({
  leadId,
  message,
}: IntelligenceInput): Promise<IntelligenceOutput | null> => {

  try {

    if (!leadId || !message) return null;

    /* 🔥 SCORE */
    const score = calculateScore(message);

    /* 🔥 TEMPERATURE */
    const temperature = getTemperature(score);

    /* 🔥 STAGE */
    const stage = getStage(temperature);

    /* 🔥 UPDATE DB */

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        leadScore: { increment: score },
        aiStage: temperature,
        stage,
      },
    });

    console.log("🧠 Lead Intelligence:", {
      score,
      temperature,
      stage,
    });

    return {
      score,
      temperature,
      stage,
    };

  } catch (error) {

    console.error("LEAD INTELLIGENCE ERROR:", error);

    return null;

  }

};