import prisma from "../../config/prisma";
import {
  clearAutonomousOpportunity,
  persistAutonomousOpportunity,
  queueAutonomousCampaign,
} from "./campaign.service";
import { recordAutonomousEvent } from "./observability.service";
import {
  buildAutonomousLeadSnapshot,
  resolveBestAutonomousOpportunity,
} from "./opportunity.service";
import type { AutonomousSchedulerLeadResult } from "./types";

const MIN_AUTODISPATCH_SCORE = 68;

const getCandidateBusinessIds = async (limit: number) => {
  const businesses = await prisma.business.findMany({
    where: {
      onboardingCompleted: true,
      deletedAt: null,
    },
    select: {
      id: true,
    },
    take: Math.max(1, Math.min(limit, 25)),
  });

  return businesses.map((business) => business.id);
};

const getCandidateLeadIds = async ({
  businessId,
  limit,
}: {
  businessId: string;
  limit: number;
}) => {
  const leads = await prisma.lead.findMany({
    where: {
      businessId,
      deletedAt: null,
      clientId: {
        not: null,
      },
      platform: {
        in: ["WHATSAPP", "INSTAGRAM"],
      },
    },
    orderBy: [
      {
        intelligenceUpdatedAt: "desc",
      },
      {
        lastMessageAt: "desc",
      },
    ],
    select: {
      id: true,
    },
    take: Math.max(1, Math.min(limit, 100)),
  });

  return leads.map((lead) => lead.id);
};

const shouldAutodispatch = ({
  score,
  autoDispatch,
}: {
  score: number;
  autoDispatch: boolean;
}) => autoDispatch && score >= MIN_AUTODISPATCH_SCORE;

export const runAutonomousScheduler = async ({
  businessId,
  autoDispatch = true,
  maxBusinesses = 5,
  maxLeadsPerBusiness = 25,
  now = new Date(),
}: {
  businessId?: string | null;
  autoDispatch?: boolean;
  maxBusinesses?: number;
  maxLeadsPerBusiness?: number;
  now?: Date;
}) => {
  const businessIds = businessId
    ? [businessId]
    : await getCandidateBusinessIds(maxBusinesses);
  const results: AutonomousSchedulerLeadResult[] = [];

  for (const currentBusinessId of businessIds) {
    const leadIds = await getCandidateLeadIds({
      businessId: currentBusinessId,
      limit: maxLeadsPerBusiness,
    });
    const businessResults: AutonomousSchedulerLeadResult[] = [];

    for (const leadId of leadIds) {
      const snapshot = await buildAutonomousLeadSnapshot({
        businessId: currentBusinessId,
        leadId,
        now,
      });

      if (!snapshot) {
        continue;
      }

      const best = resolveBestAutonomousOpportunity(snapshot);

      if (!best) {
        await clearAutonomousOpportunity({
          businessId: currentBusinessId,
          leadId,
        }).catch(() => undefined);
        results.push({
          leadId,
          engine: null,
          status: "SKIPPED",
          score: 0,
          blockedReasons: [],
        });
        businessResults.push({
          leadId,
          engine: null,
          status: "SKIPPED",
          score: 0,
          blockedReasons: [],
        });
        continue;
      }

      const opportunity = await persistAutonomousOpportunity({
        snapshot,
        candidate: best.candidate,
        guardrail: best.guardrail,
      });

      if (best.guardrail.allowed && shouldAutodispatch({
        score: best.candidate.score,
        autoDispatch,
      })) {
        await queueAutonomousCampaign({
          snapshot,
          candidate: best.candidate,
          guardrail: best.guardrail,
          opportunityId: opportunity.id,
        });
      }

      const leadResult: AutonomousSchedulerLeadResult = {
        leadId,
        engine: best.candidate.engine,
        status: best.guardrail.allowed
          ? shouldAutodispatch({
              score: best.candidate.score,
              autoDispatch,
            })
            ? "QUEUED"
            : "PENDING"
          : "BLOCKED",
        score: best.candidate.score,
        blockedReasons: best.guardrail.blockedReasons,
      };

      results.push(leadResult);
      businessResults.push(leadResult);
    }

    await recordAutonomousEvent({
      businessId: currentBusinessId,
      type: "AUTONOMOUS_SCHEDULER_COMPLETED",
      meta: {
        evaluatedLeads: businessResults.length,
        queued: businessResults.filter((item) => item.status === "QUEUED").length,
        blocked: businessResults.filter((item) => item.status === "BLOCKED").length,
        autoDispatch,
        maxLeadsPerBusiness,
      },
    }).catch(() => undefined);
  }

  return {
    generatedAt: now.toISOString(),
    businesses: businessIds.length,
    evaluatedLeads: results.length,
    queued: results.filter((item) => item.status === "QUEUED").length,
    pending: results.filter((item) => item.status === "PENDING").length,
    blocked: results.filter((item) => item.status === "BLOCKED").length,
    skipped: results.filter((item) => item.status === "SKIPPED").length,
    results,
  };
};
