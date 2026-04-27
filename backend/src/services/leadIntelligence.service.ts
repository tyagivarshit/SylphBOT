import prisma from "../config/prisma";
import {
  buildLeadIntelligenceProfile,
  refreshLeadIntelligenceProfile,
} from "./crm/leadIntelligence.service";

interface IntelligenceInput {
  leadId: string;
  message: string;
}

interface IntelligenceOutput {
  score: number;
  temperature: "HOT" | "WARM" | "COLD";
  stage: string;
}

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

export const processLeadIntelligence = async ({
  leadId,
  message,
}: IntelligenceInput): Promise<IntelligenceOutput | null> => {
  try {
    if (!leadId || !message) {
      return null;
    }

    const lead = await prisma.lead.findUnique({
      where: {
        id: leadId,
      },
      select: {
        businessId: true,
      },
    });

    if (!lead?.businessId) {
      return null;
    }

    const profile = await refreshLeadIntelligenceProfile({
      businessId: lead.businessId,
      leadId,
      inputMessage: message,
      source: "LEGACY_LEAD_INTELLIGENCE",
    });

    return {
      score: profile.scorecard.compositeScore,
      temperature:
        profile.lifecycle.nextAIStage === "HOT"
          ? "HOT"
          : profile.lifecycle.nextAIStage === "WARM"
            ? "WARM"
            : "COLD",
      stage: profile.lifecycle.nextLeadStage,
    };
  } catch (error) {
    console.error("LEAD INTELLIGENCE ERROR:", error);
    return null;
  }
};

export const getLeadIntelligenceProfile = async (leadId: string) => {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      businessId: true,
    },
  });

  if (!lead?.businessId) {
    return null;
  }

  return buildLeadIntelligenceProfile({
    businessId: lead.businessId,
    leadId,
    source: "LEGACY_LEAD_INTELLIGENCE_READ",
  });
};
