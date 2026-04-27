import prisma from "../../config/prisma";
import { buildLeadIntelligenceProfile } from "../crm/leadIntelligence.service";
import { buildExpansionOpportunity } from "./expansion.service";
import { evaluateAutonomousOutreachGuardrails } from "./guardrail.service";
import { buildLeadRevivalOpportunity } from "./leadRevival.service";
import { buildReferralOpportunity } from "./referral.service";
import { buildRetentionOpportunity } from "./retention.service";
import type {
  AutonomousGuardrailDecision,
  AutonomousLeadSnapshot,
  AutonomousOpportunityCandidate,
  AutonomousOpportunityEvaluation,
} from "./types";
import { buildWinbackOpportunity } from "./winback.service";

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toJsonRecord = (value: unknown) =>
  isPlainRecord(value) ? (value as Record<string, unknown>) : {};

const rankOpportunityEvaluations = (
  evaluations: AutonomousOpportunityEvaluation[]
) =>
  [...evaluations].sort((left, right) => {
    if (left.guardrail.allowed !== right.guardrail.allowed) {
      return left.guardrail.allowed ? -1 : 1;
    }

    if (right.candidate.score !== left.candidate.score) {
      return right.candidate.score - left.candidate.score;
    }

    return left.candidate.engine.localeCompare(right.candidate.engine);
  });

export const buildAutonomousLeadSnapshot = async ({
  leadId,
  businessId,
  now = new Date(),
}: {
  leadId: string;
  businessId?: string | null;
  now?: Date;
}): Promise<AutonomousLeadSnapshot | null> => {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          timezone: true,
          industry: true,
        },
      },
      client: {
        select: {
          id: true,
          platform: true,
          aiTone: true,
          phoneNumberId: true,
          pageId: true,
          accessToken: true,
        },
      },
    },
  });

  if (!lead) {
    return null;
  }

  if (businessId && lead.businessId !== businessId) {
    return null;
  }

  const [profile, recentMessages, conversions, appointments, recentCampaigns] =
    await Promise.all([
      buildLeadIntelligenceProfile({
        businessId: lead.businessId,
        leadId: lead.id,
        inputMessage: "",
        preview: false,
        source: "AUTONOMOUS_ENGINE",
      }),
      prisma.message.findMany({
        where: {
          leadId: lead.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 12,
        select: {
          id: true,
          sender: true,
          content: true,
          createdAt: true,
          metadata: true,
        },
      }),
      prisma.conversionEvent.findMany({
        where: {
          leadId: lead.id,
        },
        orderBy: {
          occurredAt: "desc",
        },
        take: 10,
        select: {
          outcome: true,
          value: true,
          occurredAt: true,
        },
      }),
      prisma.appointment.findMany({
        where: {
          leadId: lead.id,
        },
        orderBy: {
          startTime: "desc",
        },
        take: 5,
        select: {
          id: true,
          status: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.autonomousCampaign.findMany({
        where: {
          leadId: lead.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        select: {
          id: true,
          engine: true,
          status: true,
          createdAt: true,
          queuedAt: true,
          dispatchedAt: true,
          blockedAt: true,
          failedAt: true,
        },
      }),
    ]);

  return {
    businessId: lead.businessId,
    leadId: lead.id,
    now,
    business: {
      name: lead.business?.name || null,
      timezone: lead.business?.timezone || null,
      industry: lead.business?.industry || null,
    },
    lead: {
      id: lead.id,
      name: lead.name || null,
      platform: lead.platform || null,
      phone: lead.phone || null,
      instagramId: lead.instagramId || null,
      email: lead.email || null,
      stage: lead.stage || null,
      aiStage: lead.aiStage || null,
      revenueState: lead.revenueState || null,
      isHumanActive: Boolean(lead.isHumanActive),
      followupCount: Number(lead.followupCount || 0),
      lastFollowupAt: lead.lastFollowupAt || null,
      lastEngagedAt: lead.lastEngagedAt || null,
      lastClickedAt: lead.lastClickedAt || null,
      lastBookedAt: lead.lastBookedAt || null,
      lastConvertedAt: lead.lastConvertedAt || null,
      lastMessageAt: lead.lastMessageAt || null,
      createdAt: lead.createdAt || null,
    },
    client: lead.client
      ? {
          id: lead.client.id,
          platform: lead.client.platform || null,
          aiTone: lead.client.aiTone || null,
          phoneNumberId: lead.client.phoneNumberId || null,
          pageId: lead.client.pageId || null,
          accessTokenEncrypted: lead.client.accessToken || null,
        }
      : null,
    profile,
    recentMessages: recentMessages.map((message) => ({
      id: message.id,
      sender: message.sender,
      content: message.content,
      createdAt: message.createdAt,
      metadata: toJsonRecord(message.metadata),
    })),
    conversions: conversions.map((event) => ({
      outcome: event.outcome,
      value: typeof event.value === "number" ? event.value : null,
      occurredAt: event.occurredAt,
    })),
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
    })),
    recentCampaigns: recentCampaigns.map((campaign) => ({
      id: campaign.id,
      engine: campaign.engine,
      status: campaign.status,
      createdAt: campaign.createdAt,
      queuedAt: campaign.queuedAt || null,
      dispatchedAt: campaign.dispatchedAt || null,
      blockedAt: campaign.blockedAt || null,
      failedAt: campaign.failedAt || null,
    })),
  };
};

export const evaluateAutonomousOpportunities = (
  snapshot: AutonomousLeadSnapshot
): AutonomousOpportunityEvaluation[] => {
  const candidates = [
    buildLeadRevivalOpportunity(snapshot),
    buildWinbackOpportunity(snapshot),
    buildExpansionOpportunity(snapshot),
    buildRetentionOpportunity(snapshot),
    buildReferralOpportunity(snapshot),
  ].filter((candidate): candidate is AutonomousOpportunityCandidate => Boolean(candidate));

  return rankOpportunityEvaluations(
    candidates.map((candidate) => ({
      candidate,
      guardrail: evaluateAutonomousOutreachGuardrails({
        snapshot,
        engine: candidate.engine,
      }),
    }))
  );
};

export const resolveBestAutonomousOpportunity = (
  snapshot: AutonomousLeadSnapshot
): {
  candidate: AutonomousOpportunityCandidate;
  guardrail: AutonomousGuardrailDecision;
} | null => {
  const [best] = evaluateAutonomousOpportunities(snapshot);
  return best || null;
};
