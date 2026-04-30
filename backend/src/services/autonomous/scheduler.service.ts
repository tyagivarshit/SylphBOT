import prisma from "../../config/prisma";
import { acquireDistributedLock } from "../distributedLock.service";
import { getIntelligenceRuntimeInfluence } from "../intelligence/intelligenceRuntimeInfluence.service";
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
const AUTONOMOUS_SCHEDULER_LEADER_KEY = "autonomous:scheduler:leader";
const AUTONOMOUS_SCHEDULER_LEASE_MS = 90_000;
const AUTONOMOUS_SCHEDULER_REFRESH_MS = 30_000;

const globalForAutonomousScheduler = globalThis as typeof globalThis & {
  __sylphAutonomousSchedulerRun?: Promise<{
    generatedAt: string;
    businesses: number;
    evaluatedLeads: number;
    queued: number;
    pending: number;
    blocked: number;
    skipped: number;
    results: AutonomousSchedulerLeadResult[];
  }> | null;
};

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
  threshold,
}: {
  score: number;
  autoDispatch: boolean;
  threshold: number;
}) => autoDispatch && score >= threshold;

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
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId: currentBusinessId,
    }).catch(() => null);
    const dispatchThreshold = Math.max(
      45,
      Math.min(
        95,
        Math.round(
          Number(runtime?.controls.autonomous.autoDispatchScoreFloor || MIN_AUTODISPATCH_SCORE)
        )
      )
    );
    const dispatchEnabled = autoDispatch && !Boolean(runtime?.controls.autonomous.paused);
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
        autoDispatch: dispatchEnabled,
        threshold: dispatchThreshold,
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
              autoDispatch: dispatchEnabled,
              threshold: dispatchThreshold,
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
        autoDispatch: dispatchEnabled,
        dispatchThreshold,
        maxLeadsPerBusiness,
        intelligencePolicyVersion: runtime?.policyVersion || null,
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

export const runAutonomousSchedulerAsLeader = async ({
  runner,
  ...options
}: Parameters<typeof runAutonomousScheduler>[0] & {
  runner?: typeof runAutonomousScheduler;
}) => {
  if (globalForAutonomousScheduler.__sylphAutonomousSchedulerRun) {
    return null;
  }

  const lock = await acquireDistributedLock({
    key: AUTONOMOUS_SCHEDULER_LEADER_KEY,
    ttlMs: AUTONOMOUS_SCHEDULER_LEASE_MS,
    refreshIntervalMs: AUTONOMOUS_SCHEDULER_REFRESH_MS,
    waitMs: 0,
  });

  if (!lock) {
    return null;
  }

  if (globalForAutonomousScheduler.__sylphAutonomousSchedulerRun) {
    await lock.release().catch(() => undefined);
    return null;
  }

  const execute = runner || runAutonomousScheduler;
  const runPromise = execute(options);
  globalForAutonomousScheduler.__sylphAutonomousSchedulerRun = runPromise;

  try {
    return await runPromise;
  } finally {
    if (globalForAutonomousScheduler.__sylphAutonomousSchedulerRun === runPromise) {
      globalForAutonomousScheduler.__sylphAutonomousSchedulerRun = null;
    }

    await lock.release().catch(() => undefined);
  }
};
