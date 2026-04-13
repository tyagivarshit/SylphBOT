import { apiFetch } from "./apiClient";

export type AnalyticsMetric = {
  value: number;
  previous: number;
  delta: number;
  trend: "up" | "down" | "flat";
  format: "number" | "percent" | "minutes";
  improvedWhen: "higher" | "lower";
};

export type AnalyticsDashboard = {
  meta: {
    range: string;
    label: string;
    start: string;
    end: string;
    generatedAt: string;
    planKey: "FREE_LOCKED" | "BASIC" | "PRO" | "ELITE";
    isElite: boolean;
    upgradeRequired: boolean;
  };
  business: {
    name: string;
    industry: string | null;
    website: string | null;
    teamSize: string | null;
    timezone: string | null;
  };
  summary: {
    healthScore: AnalyticsMetric;
    leadsCaptured: AnalyticsMetric;
    qualifiedLeads: AnalyticsMetric;
    bookedMeetings: AnalyticsMetric;
    leadToBookingRate: AnalyticsMetric;
    avgFirstResponseMinutes: AnalyticsMetric;
    avgLeadScore: AnalyticsMetric;
    aiReplyShare: AnalyticsMetric;
    unreadBacklog: number;
    hotLeadCount: number;
    activeConversations: number;
    humanTakeoverCount: number;
  };
  trends: {
    series: Array<{
      date: string;
      label: string;
      leads: number;
      qualified: number;
      bookings: number;
      inboundMessages: number;
      aiReplies: number;
      agentReplies: number;
    }>;
    totals: {
      inboundMessages: number;
      aiReplies: number;
      agentReplies: number;
      totalReplies: number;
      avgMessagesPerLead: number;
    };
  };
  funnel: Array<{
    key: string;
    label: string;
    count: number;
    conversionFromTop: number;
    conversionFromPrevious: number;
  }>;
  sourcePerformance: Array<{
    source: string;
    leads: number;
    qualified: number;
    bookings: number;
    conversionRate: number;
    avgLeadScore: number;
    share: number;
  }>;
  deepDive: {
    stageDistribution: Array<{
      key: string;
      label: string;
      count: number;
      share: number;
    }>;
    intentBreakdown: Array<{
      intent: string;
      count: number;
      share: number;
    }>;
    temperatureBreakdown: Array<{
      bucket: string;
      count: number;
      share: number;
    }>;
    weekdayPerformance: Array<{
      day: string;
      leads: number;
      messages: number;
      bookings: number;
    }>;
    operationalMetrics: {
      hotLeadsWithoutBooking: number;
      unreadQualifiedLeads: number;
      humanTakeoverCount: number;
      avgFollowupsPerLead: number;
    };
    insights: Array<{
      title: string;
      value: string;
      note: string;
      tone: "positive" | "neutral" | "warning";
    }>;
  } | null;
};

export async function getAnalyticsDashboard(
  range: string
): Promise<AnalyticsDashboard> {
  const res = await apiFetch<AnalyticsDashboard>(
    `/api/analytics/dashboard?range=${range}`
  );

  if (!res.success || !res.data) {
    throw new Error(res.message || "Failed to load analytics");
  }

  return res.data;
}

export async function getOverview(range: string) {
  return (await getAnalyticsDashboard(range)).summary;
}

export async function getCharts(range: string) {
  return (await getAnalyticsDashboard(range)).trends.series;
}

export async function getFunnel(range = "30d") {
  return (await getAnalyticsDashboard(range)).funnel;
}

export async function getSources(range = "30d") {
  return (await getAnalyticsDashboard(range)).sourcePerformance;
}
