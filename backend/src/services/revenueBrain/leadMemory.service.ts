import prisma from "../../config/prisma";
import type { SalesAgentContext } from "../salesAgent/types";
import { collapseMemoryFacts } from "./memory.utils";
import type { RevenueBrainLeadMemorySnapshot } from "./types";

const buildSnapshotFromSalesContext = async (
  leadId: string,
  salesContext: SalesAgentContext
): Promise<RevenueBrainLeadMemorySnapshot> => {
  const liveLead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    select: {
      isHumanActive: true,
      followupCount: true,
    },
  });

  return {
    leadId,
    name: salesContext.lead.name || null,
    email: salesContext.lead.email || null,
    phone: salesContext.lead.phone || null,
    platform: salesContext.lead.platform || null,
    stage: salesContext.lead.stage || null,
    aiStage: salesContext.lead.aiStage || null,
    revenueState: salesContext.leadState.state || salesContext.lead.revenueState,
    intent: salesContext.profile.intent || salesContext.lead.intent || null,
    leadScore: Number(salesContext.profile.leadScore || salesContext.lead.leadScore || 0),
    isHumanActive: Boolean(liveLead?.isHumanActive),
    followupCount: Number(
      liveLead?.followupCount ?? salesContext.lead.followupCount ?? 0
    ),
    facts: salesContext.memory.facts || [],
  };
};

export const getLeadMemorySnapshot = async ({
  leadId,
  salesContext,
}: {
  leadId: string;
  salesContext?: SalesAgentContext | null;
}): Promise<RevenueBrainLeadMemorySnapshot> => {
  if (salesContext) {
    return buildSnapshotFromSalesContext(leadId, salesContext);
  }

  const [lead, memories] = await Promise.all([
    prisma.lead.findUnique({
      where: {
        id: leadId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        platform: true,
        stage: true,
        aiStage: true,
        revenueState: true,
        intent: true,
        leadScore: true,
        isHumanActive: true,
        followupCount: true,
      },
    }),
    prisma.memory.findMany({
      where: {
        leadId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        key: true,
        value: true,
        confidence: true,
        source: true,
        lastObservedAt: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    leadId,
    name: lead?.name || null,
    email: lead?.email || null,
    phone: lead?.phone || null,
    platform: lead?.platform || null,
    stage: lead?.stage || null,
    aiStage: lead?.aiStage || null,
    revenueState: lead?.revenueState || null,
    intent: lead?.intent || null,
    leadScore: Number(lead?.leadScore || 0),
    isHumanActive: Boolean(lead?.isHumanActive),
    followupCount: Number(lead?.followupCount || 0),
    facts: collapseMemoryFacts(memories),
  };
};
