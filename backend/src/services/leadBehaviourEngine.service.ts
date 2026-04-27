import prisma from "../config/prisma";
import { buildLeadIntelligenceProfile } from "./crm/leadIntelligence.service";

interface BehaviorInput {
  leadId: string;
}

interface BehaviorOutput {
  tone: "soft" | "persuasive" | "aggressive";
  goal: "educate" | "nurture" | "close";
  pushBooking: boolean;
  urgency: boolean;
}

const fallbackBehavior: BehaviorOutput = {
  tone: "soft",
  goal: "educate",
  pushBooking: false,
  urgency: false,
};

export const getLeadBehavior = async ({
  leadId,
}: BehaviorInput): Promise<BehaviorOutput> => {
  try {
    const lead = await prisma.lead.findUnique({
      where: {
        id: leadId,
      },
      select: {
        businessId: true,
      },
    });

    if (!lead?.businessId) {
      return fallbackBehavior;
    }

    const profile = await buildLeadIntelligenceProfile({
      businessId: lead.businessId,
      leadId,
      source: "LEGACY_BEHAVIOR_ENGINE",
    });

    if (
      profile.behavior.predictedBehavior === "BOOKING_READY" ||
      profile.behavior.predictedBehavior === "CLOSE_READY"
    ) {
      return {
        tone: "aggressive",
        goal: "close",
        pushBooking: true,
        urgency: profile.behavior.urgency === "HIGH",
      };
    }

    if (
      profile.behavior.predictedBehavior === "PRICE_EVALUATION" ||
      profile.behavior.predictedBehavior === "NEEDS_NURTURE"
    ) {
      return {
        tone: "persuasive",
        goal: "nurture",
        pushBooking: true,
        urgency: false,
      };
    }

    return {
      tone: "soft",
      goal: "educate",
      pushBooking: profile.behavior.nextBestAction === "SHORT_PROOF_FOLLOWUP",
      urgency: false,
    };
  } catch (error) {
    console.error("BEHAVIOR ENGINE ERROR:", error);
    return fallbackBehavior;
  }
};
