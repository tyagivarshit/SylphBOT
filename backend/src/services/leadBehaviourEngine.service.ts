import prisma from "../config/prisma";

/*
=========================================================
LEAD BEHAVIOR ENGINE (AUTO-CLOSING AI BRAIN)
=========================================================
*/

interface BehaviorInput {
  leadId: string;
}

interface BehaviorOutput {
  tone: "soft" | "persuasive" | "aggressive";
  goal: "educate" | "nurture" | "close";
  pushBooking: boolean;
  urgency: boolean;
}

/* =====================================================
🔥 MAIN ENGINE
===================================================== */

export const getLeadBehavior = async ({
  leadId,
}: BehaviorInput): Promise<BehaviorOutput> => {

  try {

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        aiStage: true,
        leadScore: true,
        stage: true,
      },
    });

    if (!lead) {
      return {
        tone: "soft",
        goal: "educate",
        pushBooking: false,
        urgency: false,
      };
    }

    const { aiStage, leadScore } = lead;

    /* =====================================================
    🔥 HOT LEADS (CLOSE FAST)
    ===================================================== */
    if (aiStage === "HOT" || (leadScore ?? 0) >= 8) {
      return {
        tone: "aggressive",
        goal: "close",
        pushBooking: true,
        urgency: true,
      };
    }

    /* =====================================================
    🌤️ WARM LEADS (CONVERT)
    ===================================================== */
    if (aiStage === "WARM" || (leadScore ?? 0) >= 4) {
      return {
        tone: "persuasive",
        goal: "nurture",
        pushBooking: true,
        urgency: false,
      };
    }

    /* =====================================================
    ❄️ COLD LEADS (EDUCATE)
    ===================================================== */
    return {
      tone: "soft",
      goal: "educate",
      pushBooking: false,
      urgency: false,
    };

  } catch (error) {

    console.error("BEHAVIOR ENGINE ERROR:", error);

    return {
      tone: "soft",
      goal: "educate",
      pushBooking: false,
      urgency: false,
    };

  }

};