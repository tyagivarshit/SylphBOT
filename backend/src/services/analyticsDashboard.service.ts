import {
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  format,
  startOfDay,
  subDays,
} from "date-fns";
import {
  AnalyticsAppointmentRecord,
  AnalyticsLeadRecord,
  AnalyticsMessageRecord,
  getAllLeadAppointments,
  getAllLeads,
  getAppointmentsForLeadIds,
  getAppointmentsInRange,
  getBusinessProfile,
  getLeadsInRange,
  getMessagesInRange,
} from "../analytics/analyticsDashboard.repository";

type PlanKey = "FREE_LOCKED" | "BASIC" | "PRO" | "ELITE";
type MetricFormat = "number" | "percent" | "minutes";
type ImprovedWhen = "higher" | "lower";

type Metric = {
  value: number;
  previous: number;
  delta: number;
  trend: "up" | "down" | "flat";
  format: MetricFormat;
  improvedWhen: ImprovedWhen;
};

type DateWindow = {
  range: string;
  label: string;
  current: {
    start: Date;
    end: Date;
  };
  previous: {
    start: Date;
    end: Date;
  };
};

type SourcePerformanceItem = {
  source: string;
  leads: number;
  qualified: number;
  bookings: number;
  conversionRate: number;
  avgLeadScore: number;
  share: number;
};

const QUALIFIED_STAGES = new Set(["QUALIFIED", "READY_TO_BUY", "WON"]);
const READY_STAGES = new Set(["READY_TO_BUY", "WON"]);
const INBOUND_SENDERS = new Set(["USER"]);
const OUTBOUND_SENDERS = new Set(["AI", "AGENT"]);
const ACTIVE_BOOKING_STATUSES = new Set(["BOOKED", "RESCHEDULED", "CONFIRMED"]);

const RANGE_CONFIG: Record<
  string,
  {
    label: string;
    days: number;
  }
> = {
  "7d": { label: "Last 7 days", days: 7 },
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  "180d": { label: "Last 180 days", days: 180 },
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  INTERESTED: "Interested",
  QUALIFIED: "Qualified",
  READY_TO_BUY: "Ready To Buy",
  WON: "Won",
  LOST: "Lost",
};

function getDateWindow(inputRange: string): DateWindow {
  const config = RANGE_CONFIG[inputRange] || RANGE_CONFIG["30d"];
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(end, config.days - 1));
  const previousEnd = endOfDay(subDays(start, 1));
  const previousStart = startOfDay(subDays(previousEnd, config.days - 1));

  return {
    range: Object.keys(RANGE_CONFIG).includes(inputRange)
      ? inputRange
      : "30d",
    label: config.label,
    current: {
      start,
      end,
    },
    previous: {
      start: previousStart,
      end: previousEnd,
    },
  };
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percent(part: number, total: number) {
  if (!total) {
    return 0;
  }

  return round((part / total) * 100, 1);
}

function getTrend(
  value: number,
  previous: number
): "up" | "down" | "flat" {
  if (value > previous) {
    return "up";
  }

  if (value < previous) {
    return "down";
  }

  return "flat";
}

function buildMetric(
  value: number,
  previous: number,
  format: MetricFormat,
  improvedWhen: ImprovedWhen = "higher"
): Metric {
  const delta =
    previous === 0
      ? value === 0
        ? 0
        : 100
      : round(((value - previous) / previous) * 100, 1);

  return {
    value: round(value, format === "number" ? 0 : 1),
    previous: round(previous, format === "number" ? 0 : 1),
    delta,
    trend: getTrend(value, previous),
    format,
    improvedWhen,
  };
}

function isQualifiedLead(lead: AnalyticsLeadRecord) {
  return QUALIFIED_STAGES.has((lead.stage || "").toUpperCase());
}

function isReadyLead(lead: AnalyticsLeadRecord) {
  return (
    READY_STAGES.has((lead.stage || "").toUpperCase()) ||
    (lead.aiStage || "").toUpperCase() === "HOT" ||
    lead.leadScore >= 8
  );
}

function getTemperatureBucket(lead: AnalyticsLeadRecord) {
  const aiStage = (lead.aiStage || "").toUpperCase();

  if (aiStage === "HOT" || lead.leadScore >= 8 || isReadyLead(lead)) {
    return "HOT";
  }

  if (
    aiStage === "WARM" ||
    lead.leadScore >= 4 ||
    (lead.stage || "").toUpperCase() === "INTERESTED"
  ) {
    return "WARM";
  }

  return "COLD";
}

function getActiveBookedLeadIds(appointments: AnalyticsAppointmentRecord[]) {
  return new Set(
    appointments
      .filter(
        (appointment) =>
          appointment.leadId &&
          ACTIVE_BOOKING_STATUSES.has((appointment.status || "").toUpperCase())
      )
      .map((appointment) => String(appointment.leadId))
  );
}

function getBookedMeetingCount(appointments: AnalyticsAppointmentRecord[]) {
  return appointments.filter((appointment) =>
    ACTIVE_BOOKING_STATUSES.has((appointment.status || "").toUpperCase())
  ).length;
}

function getAverageLeadScore(leads: AnalyticsLeadRecord[]) {
  if (!leads.length) {
    return 0;
  }

  return round(
    leads.reduce((sum, lead) => sum + (lead.leadScore || 0), 0) / leads.length,
    1
  );
}

function getMessageMix(messages: AnalyticsMessageRecord[]) {
  return messages.reduce(
    (acc, message) => {
      const sender = (message.sender || "").toUpperCase();

      if (INBOUND_SENDERS.has(sender)) {
        acc.inbound += 1;
      } else if (sender === "AI") {
        acc.aiReplies += 1;
      } else if (sender === "AGENT") {
        acc.agentReplies += 1;
      } else if (OUTBOUND_SENDERS.has(sender)) {
        acc.agentReplies += 1;
      }

      return acc;
    },
    {
      inbound: 0,
      aiReplies: 0,
      agentReplies: 0,
    }
  );
}

function getResponseMetrics(messages: AnalyticsMessageRecord[]) {
  const grouped = new Map<string, AnalyticsMessageRecord[]>();

  for (const message of messages) {
    const list = grouped.get(message.leadId) || [];
    list.push(message);
    grouped.set(message.leadId, list);
  }

  const responseTimes: number[] = [];
  let conversationsWithInbound = 0;

  for (const thread of grouped.values()) {
    let firstInboundAt: Date | null = null;
    let responded = false;

    for (const message of thread) {
      const sender = (message.sender || "").toUpperCase();

      if (!firstInboundAt && INBOUND_SENDERS.has(sender)) {
        firstInboundAt = message.createdAt;
        conversationsWithInbound += 1;
        continue;
      }

      if (firstInboundAt && OUTBOUND_SENDERS.has(sender)) {
        responseTimes.push(
          Math.max(differenceInMinutes(message.createdAt, firstInboundAt), 0)
        );
        responded = true;
        break;
      }
    }

    if (firstInboundAt && !responded) {
      continue;
    }
  }

  const average =
    responseTimes.length > 0
      ? round(
          responseTimes.reduce((sum, minutes) => sum + minutes, 0) /
            responseTimes.length,
          1
        )
      : 0;

  return {
    averageMinutes: average,
    responseCoverage: percent(responseTimes.length, conversationsWithInbound),
  };
}

function buildDailySeries(
  start: Date,
  end: Date,
  leads: AnalyticsLeadRecord[],
  messages: AnalyticsMessageRecord[],
  appointments: AnalyticsAppointmentRecord[]
) {
  const days = eachDayOfInterval({ start, end });
  const map = new Map(
    days.map((date) => [
      format(date, "yyyy-MM-dd"),
      {
        date: format(date, "yyyy-MM-dd"),
        label: format(date, days.length > 31 ? "dd MMM" : "EEE, dd MMM"),
        leads: 0,
        qualified: 0,
        bookings: 0,
        inboundMessages: 0,
        aiReplies: 0,
        agentReplies: 0,
      },
    ])
  );

  for (const lead of leads) {
    const key = format(lead.createdAt, "yyyy-MM-dd");
    const bucket = map.get(key);

    if (!bucket) {
      continue;
    }

    bucket.leads += 1;

    if (isQualifiedLead(lead)) {
      bucket.qualified += 1;
    }
  }

  for (const message of messages) {
    const key = format(message.createdAt, "yyyy-MM-dd");
    const bucket = map.get(key);

    if (!bucket) {
      continue;
    }

    const sender = (message.sender || "").toUpperCase();

    if (INBOUND_SENDERS.has(sender)) {
      bucket.inboundMessages += 1;
    } else if (sender === "AI") {
      bucket.aiReplies += 1;
    } else {
      bucket.agentReplies += 1;
    }
  }

  for (const appointment of appointments) {
    if (!ACTIVE_BOOKING_STATUSES.has((appointment.status || "").toUpperCase())) {
      continue;
    }

    const key = format(appointment.createdAt, "yyyy-MM-dd");
    const bucket = map.get(key);

    if (bucket) {
      bucket.bookings += 1;
    }
  }

  return Array.from(map.values());
}

function buildSourcePerformance(
  leads: AnalyticsLeadRecord[],
  bookedLeadIds: Set<string>
): SourcePerformanceItem[] {
  const totalLeads = leads.length;
  const map = new Map<
    string,
    {
      leads: number;
      qualified: number;
      bookings: number;
      scoreTotal: number;
    }
  >();

  for (const lead of leads) {
    const source = (lead.platform || "Unknown").toUpperCase();
    const current = map.get(source) || {
      leads: 0,
      qualified: 0,
      bookings: 0,
      scoreTotal: 0,
    };

    current.leads += 1;
    current.scoreTotal += lead.leadScore || 0;

    if (isQualifiedLead(lead)) {
      current.qualified += 1;
    }

    if (bookedLeadIds.has(lead.id)) {
      current.bookings += 1;
    }

    map.set(source, current);
  }

  return Array.from(map.entries())
    .map(([source, item]) => ({
      source,
      leads: item.leads,
      qualified: item.qualified,
      bookings: item.bookings,
      conversionRate: percent(item.bookings, item.leads),
      avgLeadScore: round(item.scoreTotal / item.leads, 1),
      share: percent(item.leads, totalLeads),
    }))
    .sort((left, right) => right.leads - left.leads);
}

function buildStageDistribution(leads: AnalyticsLeadRecord[]) {
  const total = leads.length;
  const counts = new Map<string, number>();

  for (const lead of leads) {
    const key = (lead.stage || "NEW").toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([key, count]) => ({
      key,
      label: STAGE_LABELS[key] || key.replace(/_/g, " "),
      count,
      share: percent(count, total),
    }))
    .sort((left, right) => right.count - left.count);
}

function buildIntentBreakdown(leads: AnalyticsLeadRecord[]) {
  const leadsWithIntent = leads.filter((lead) => Boolean(lead.intent));
  const total = leadsWithIntent.length;
  const counts = new Map<string, number>();

  for (const lead of leadsWithIntent) {
    const key = (lead.intent || "GENERAL").toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([intent, count]) => ({
      intent,
      count,
      share: percent(count, total),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6);
}

function buildTemperatureBreakdown(leads: AnalyticsLeadRecord[]) {
  const total = leads.length;
  const counts = {
    HOT: 0,
    WARM: 0,
    COLD: 0,
  };

  for (const lead of leads) {
    counts[getTemperatureBucket(lead)] += 1;
  }

  return (["HOT", "WARM", "COLD"] as const).map((bucket) => ({
    bucket,
    count: counts[bucket],
    share: percent(counts[bucket], total),
  }));
}

function buildWeekdayPerformance(
  leads: AnalyticsLeadRecord[],
  messages: AnalyticsMessageRecord[],
  appointments: AnalyticsAppointmentRecord[]
) {
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const map = new Map(
    order.map((day) => [
      day,
      {
        day,
        leads: 0,
        messages: 0,
        bookings: 0,
      },
    ])
  );

  for (const lead of leads) {
    const key = format(lead.createdAt, "EEE");
    const bucket = map.get(key);

    if (bucket) {
      bucket.leads += 1;
    }
  }

  for (const message of messages) {
    const key = format(message.createdAt, "EEE");
    const bucket = map.get(key);

    if (bucket) {
      bucket.messages += 1;
    }
  }

  for (const appointment of appointments) {
    if (!ACTIVE_BOOKING_STATUSES.has((appointment.status || "").toUpperCase())) {
      continue;
    }

    const key = format(appointment.createdAt, "EEE");
    const bucket = map.get(key);

    if (bucket) {
      bucket.bookings += 1;
    }
  }

  return order.map((day) => map.get(day)!);
}

function buildFunnel(
  leads: AnalyticsLeadRecord[],
  allBookedLeadIds: Set<string>
) {
  const total = leads.length;
  const engaged = leads.filter((lead) => Boolean(lead.lastMessageAt)).length;
  const qualified = leads.filter(isQualifiedLead).length;
  const ready = leads.filter(isReadyLead).length;
  const booked = leads.filter((lead) => allBookedLeadIds.has(lead.id)).length;

  const stages = [
    { key: "leads", label: "Leads", count: total },
    { key: "engaged", label: "Engaged", count: engaged },
    { key: "qualified", label: "Qualified", count: qualified },
    { key: "ready", label: "Ready To Buy", count: ready },
    { key: "booked", label: "Booked", count: booked },
  ];

  return stages.map((stage, index) => ({
    ...stage,
    conversionFromTop: percent(stage.count, total),
    conversionFromPrevious:
      index === 0 ? 100 : percent(stage.count, stages[index - 1].count),
  }));
}

function getHealthScore(params: {
  leadToBookingRate: number;
  qualificationRate: number;
  responseTimeMinutes: number;
  unreadBacklog: number;
  totalLeads: number;
}) {
  const bookingScore = Math.min(params.leadToBookingRate / 25, 1) * 30;
  const qualificationScore =
    Math.min(params.qualificationRate / 40, 1) * 25;
  const responseScore =
    Math.max(0, 1 - Math.min(params.responseTimeMinutes, 120) / 120) * 25;
  const backlogRate =
    params.totalLeads > 0 ? params.unreadBacklog / params.totalLeads : 0;
  const backlogScore = Math.max(0, 1 - Math.min(backlogRate, 1)) * 20;

  return Math.round(
    bookingScore + qualificationScore + responseScore + backlogScore
  );
}

function buildInsights(params: {
  sourcePerformance: SourcePerformanceItem[];
  hotLeadsWithoutBooking: number;
  unreadQualifiedLeads: number;
  aiReplyShare: number;
  averageResponseMinutes: number;
}) {
  const topSource = params.sourcePerformance[0];

  return [
    {
      title: "Top converting source",
      value: topSource ? topSource.source : "No source data",
      note: topSource
        ? `${topSource.conversionRate}% of ${topSource.source} leads converted to meetings`
        : "Capture more leads to identify channel leaders",
      tone: "positive" as const,
    },
    {
      title: "Hot leads still open",
      value: `${params.hotLeadsWithoutBooking}`,
      note: "High-intent leads without a meeting on the calendar",
      tone:
        params.hotLeadsWithoutBooking > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      title: "Qualified backlog",
      value: `${params.unreadQualifiedLeads}`,
      note: "Qualified leads waiting on a reply or manual follow-up",
      tone:
        params.unreadQualifiedLeads > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      title: "Automation coverage",
      value: `${round(params.aiReplyShare, 1)}%`,
      note: `Average first response is ${round(
        params.averageResponseMinutes,
        1
      )} minutes`,
      tone:
        params.aiReplyShare >= 60 ? ("positive" as const) : ("neutral" as const),
    },
  ];
}

export async function getAnalyticsDashboard(
  businessId: string,
  range: string,
  planKey: PlanKey
) {
  const window = getDateWindow(range);

  const [
    business,
    currentLeads,
    previousLeads,
    allLeads,
    currentMessages,
    previousMessages,
    currentAppointments,
    previousAppointments,
    allLeadAppointments,
  ] = await Promise.all([
    getBusinessProfile(businessId),
    getLeadsInRange(businessId, window.current.start, window.current.end),
    getLeadsInRange(businessId, window.previous.start, window.previous.end),
    getAllLeads(businessId),
    getMessagesInRange(businessId, window.current.start, window.current.end),
    getMessagesInRange(businessId, window.previous.start, window.previous.end),
    getAppointmentsInRange(businessId, window.current.start, window.current.end),
    getAppointmentsInRange(businessId, window.previous.start, window.previous.end),
    getAllLeadAppointments(businessId),
  ]);

  const [currentLeadAppointments, previousLeadAppointments] = await Promise.all([
    getAppointmentsForLeadIds(currentLeads.map((lead) => lead.id)),
    getAppointmentsForLeadIds(previousLeads.map((lead) => lead.id)),
  ]);

  const currentLeadBookedIds = getActiveBookedLeadIds(currentLeadAppointments);
  const previousLeadBookedIds = getActiveBookedLeadIds(previousLeadAppointments);
  const allBookedLeadIds = getActiveBookedLeadIds(allLeadAppointments);

  const currentResponse = getResponseMetrics(currentMessages);
  const previousResponse = getResponseMetrics(previousMessages);
  const currentMix = getMessageMix(currentMessages);
  const previousMix = getMessageMix(previousMessages);

  const currentLeadToBookingRate = percent(
    currentLeadBookedIds.size,
    currentLeads.length
  );
  const previousLeadToBookingRate = percent(
    previousLeadBookedIds.size,
    previousLeads.length
  );

  const currentQualified = currentLeads.filter(isQualifiedLead).length;
  const previousQualified = previousLeads.filter(isQualifiedLead).length;
  const currentLeadScore = getAverageLeadScore(currentLeads);
  const previousLeadScore = getAverageLeadScore(previousLeads);
  const currentAIReplyShare = percent(
    currentMix.aiReplies,
    currentMix.aiReplies + currentMix.agentReplies
  );
  const previousAIReplyShare = percent(
    previousMix.aiReplies,
    previousMix.aiReplies + previousMix.agentReplies
  );
  const unreadBacklog = allLeads.filter((lead) => lead.unreadCount > 0).length;
  const hotLeadCount = allLeads.filter((lead) => getTemperatureBucket(lead) === "HOT")
    .length;
  const activeConversations = allLeads.filter((lead) => Boolean(lead.lastMessageAt))
    .length;
  const humanTakeoverCount = allLeads.filter((lead) => lead.isHumanActive).length;
  const qualificationRate = percent(currentQualified, currentLeads.length);
  const previousQualificationRate = percent(
    previousQualified,
    previousLeads.length
  );
  const currentHealthScore = getHealthScore({
    leadToBookingRate: currentLeadToBookingRate,
    qualificationRate,
    responseTimeMinutes: currentResponse.averageMinutes,
    unreadBacklog,
    totalLeads: allLeads.length,
  });
  const previousHealthScore = getHealthScore({
    leadToBookingRate: previousLeadToBookingRate,
    qualificationRate: previousQualificationRate,
    responseTimeMinutes: previousResponse.averageMinutes,
    unreadBacklog,
    totalLeads: Math.max(previousLeads.length, 1),
  });

  const sourcePerformance = buildSourcePerformance(
    currentLeads,
    currentLeadBookedIds
  );

  const hotLeadsWithoutBooking = allLeads.filter(
    (lead) => getTemperatureBucket(lead) === "HOT" && !allBookedLeadIds.has(lead.id)
  ).length;
  const unreadQualifiedLeads = allLeads.filter(
    (lead) => isQualifiedLead(lead) && lead.unreadCount > 0
  ).length;
  const averageFollowups =
    allLeads.length > 0
      ? round(
          allLeads.reduce((sum, lead) => sum + (lead.followupCount || 0), 0) /
            allLeads.length,
          1
        )
      : 0;

  const deepDive =
    planKey === "ELITE"
      ? {
          stageDistribution: buildStageDistribution(allLeads),
          intentBreakdown: buildIntentBreakdown(currentLeads),
          temperatureBreakdown: buildTemperatureBreakdown(allLeads),
          weekdayPerformance: buildWeekdayPerformance(
            currentLeads,
            currentMessages,
            currentAppointments
          ),
          operationalMetrics: {
            hotLeadsWithoutBooking,
            unreadQualifiedLeads,
            humanTakeoverCount,
            avgFollowupsPerLead: averageFollowups,
          },
          insights: buildInsights({
            sourcePerformance,
            hotLeadsWithoutBooking,
            unreadQualifiedLeads,
            aiReplyShare: currentAIReplyShare,
            averageResponseMinutes: currentResponse.averageMinutes,
          }),
        }
      : null;

  return {
    meta: {
      range: window.range,
      label: window.label,
      start: window.current.start.toISOString(),
      end: window.current.end.toISOString(),
      generatedAt: new Date().toISOString(),
      planKey,
      isElite: planKey === "ELITE",
      upgradeRequired: planKey !== "ELITE",
    },
    business: {
      name: business?.name || "Workspace",
      industry: business?.industry || null,
      website: business?.website || null,
      teamSize: business?.teamSize || null,
      timezone: business?.timezone || null,
    },
    summary: {
      healthScore: buildMetric(
        currentHealthScore,
        previousHealthScore,
        "number"
      ),
      leadsCaptured: buildMetric(
        currentLeads.length,
        previousLeads.length,
        "number"
      ),
      qualifiedLeads: buildMetric(
        currentQualified,
        previousQualified,
        "number"
      ),
      bookedMeetings: buildMetric(
        getBookedMeetingCount(currentAppointments),
        getBookedMeetingCount(previousAppointments),
        "number"
      ),
      leadToBookingRate: buildMetric(
        currentLeadToBookingRate,
        previousLeadToBookingRate,
        "percent"
      ),
      avgFirstResponseMinutes: buildMetric(
        currentResponse.averageMinutes,
        previousResponse.averageMinutes,
        "minutes",
        "lower"
      ),
      avgLeadScore: buildMetric(
        currentLeadScore,
        previousLeadScore,
        "number"
      ),
      aiReplyShare: buildMetric(
        currentAIReplyShare,
        previousAIReplyShare,
        "percent"
      ),
      unreadBacklog,
      hotLeadCount,
      activeConversations,
      humanTakeoverCount,
    },
    trends: {
      series: buildDailySeries(
        window.current.start,
        window.current.end,
        currentLeads,
        currentMessages,
        currentAppointments
      ),
      totals: {
        inboundMessages: currentMix.inbound,
        aiReplies: currentMix.aiReplies,
        agentReplies: currentMix.agentReplies,
        totalReplies: currentMix.aiReplies + currentMix.agentReplies,
        avgMessagesPerLead: currentLeads.length
          ? round(currentMessages.length / currentLeads.length, 1)
          : 0,
      },
    },
    funnel: buildFunnel(allLeads, allBookedLeadIds),
    sourcePerformance,
    deepDive,
  };
}
