import { startOfDay } from "date-fns";
import prisma from "../../config/prisma";
import { getAutonomousEvents } from "./observability.service";
import type { AutonomousDashboardData, AutonomousEngine } from "./types";

const ENGINES: AutonomousEngine[] = [
  "lead_revival",
  "winback",
  "expansion",
  "retention",
  "referral",
];

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toJsonRecord = (value: unknown) =>
  isPlainRecord(value) ? (value as Record<string, unknown>) : {};

const countByReason = (events: Array<{ meta: unknown }>) => {
  const counts = new Map<string, number>();

  for (const event of events) {
    const meta = toJsonRecord(event.meta);
    const blockedReasons = Array.isArray(meta.blockedReasons)
      ? meta.blockedReasons
      : [];

    for (const reason of blockedReasons) {
      const normalized = String(reason || "").trim();

      if (!normalized) {
        continue;
      }

      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([reason, count]) => ({
      reason,
      count,
    }));
};

export const getAutonomousDashboard = async (
  businessId: string
): Promise<AutonomousDashboardData> => {
  const startToday = startOfDay(new Date());
  const [opportunities, campaigns, events] = await Promise.all([
    prisma.autonomousOpportunity.findMany({
      where: {
        businessId,
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        {
          score: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      take: 20,
    }),
    prisma.autonomousCampaign.findMany({
      where: {
        businessId,
      },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }),
    getAutonomousEvents({
      businessId,
      limit: 30,
    }),
  ]);

  const pending = opportunities.filter((item) => item.status === "PENDING").length;
  const queued = campaigns.filter((item) => item.status === "QUEUED").length;
  const blocked = opportunities.filter((item) => item.status === "BLOCKED").length;
  const dispatchedToday = campaigns.filter(
    (item) =>
      item.status === "DISPATCHED" &&
      item.dispatchedAt &&
      item.dispatchedAt >= startToday
  ).length;
  const avgScore = opportunities.length
    ? Math.round(
        opportunities.reduce((sum, item) => sum + Number(item.score || 0), 0) /
          opportunities.length
      )
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      pending,
      queued,
      dispatchedToday,
      blocked,
      avgScore,
    },
    engines: ENGINES.map((engine) => ({
      engine,
      pending: opportunities.filter(
        (item) => item.engine === engine && item.status === "PENDING"
      ).length,
      queued: campaigns.filter(
        (item) => item.engine === engine && item.status === "QUEUED"
      ).length,
      blocked: opportunities.filter(
        (item) => item.engine === engine && item.status === "BLOCKED"
      ).length,
      dispatchedToday: campaigns.filter(
        (item) =>
          item.engine === engine &&
          item.status === "DISPATCHED" &&
          item.dispatchedAt &&
          item.dispatchedAt >= startToday
      ).length,
    })),
    opportunities: opportunities.map((item) => ({
      leadId: item.leadId,
      leadName: item.lead?.name || null,
      engine: item.engine,
      status: item.status,
      score: Number(item.score || 0),
      priority: item.priority,
      title: item.title,
      objective: item.objective,
      summary: item.summary,
      blockedReasons: item.blockedReasons || [],
      recommendedAt: item.recommendedAt.toISOString(),
      nextEligibleAt: item.nextEligibleAt?.toISOString() || null,
      updatedAt: item.updatedAt.toISOString(),
    })),
    campaigns: campaigns.map((item) => ({
      id: item.id,
      leadId: item.leadId,
      leadName: item.lead?.name || null,
      engine: item.engine,
      status: item.status,
      title: item.title,
      objective: item.objective,
      queuedAt: item.queuedAt?.toISOString() || null,
      dispatchedAt: item.dispatchedAt?.toISOString() || null,
      failedAt: item.failedAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
    })),
    observability: {
      lastSchedulerRunAt:
        events.find((event) => event.type === "AUTONOMOUS_SCHEDULER_COMPLETED")
          ?.createdAt.toISOString() || null,
      recentEvents: events.map((event) => ({
        id: event.id,
        type: event.type,
        leadId: String(toJsonRecord(event.meta).leadId || "") || null,
        createdAt: event.createdAt.toISOString(),
        meta: toJsonRecord(event.meta),
      })),
      blockedReasons: countByReason(
        events.filter((event) =>
          event.type === "AUTONOMOUS_OPPORTUNITY_BLOCKED"
        )
      ),
    },
  };
};
