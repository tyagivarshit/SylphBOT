import {
  differenceInMinutes,
  endOfDay,
  format,
  startOfDay,
  subDays,
} from "date-fns";
import {
  AnalyticsAppointmentRecord,
  AnalyticsConversionEventRecord,
  AnalyticsLeadRecord,
  AnalyticsMessageRecord,
  AnalyticsRevenueBrainEventRecord,
  AnalyticsTrackedMessageRecord,
  getAllLeads,
  getBusinessProfile,
  getConversionEventsInRange,
  getMessagesInRange,
  getRevenueBrainAnalyticsInRange,
  getTrackedMessagesInRange,
  getAllAppointments,
} from "../analytics/analyticsDashboard.repository";
import { getVariantPerformance } from "./salesAgent/abTesting.service";
import { runSalesOptimizer } from "./salesAgent/optimizer.service";
import { getIsolatedProjectionSnapshot } from "../analytics/isolatedCache";

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
const ACTIVE_BOOKING_STATUSES = new Set([
  "CONFIRMED",
  "RESCHEDULED",
  "CHECKED_IN",
  "COMPLETED",
  "FOLLOWUP_BOOKED",
  "REMINDER_SENT",
]);

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

const ANALYTICS_DASHBOARD_CACHE_TTL_MS = 15_000;
const ANALYTICS_DASHBOARD_STALE_TTL_MS = 60_000;
const ANALYTICS_DASHBOARD_REFRESH_WAIT_MS = 180;
const ANALYTICS_DASHBOARD_COMPUTE_BUDGET_MS = 7_000;
const ANALYTICS_DASHBOARD_MIN_REFRESH_INTERVAL_MS = 1_500;

const logAnalyticsDashboardTiming = (
  event: string,
  fields: Record<string, unknown>
) => {
  console.info("[ANALYTICS_DASHBOARD_TIMING]", {
    event,
    ...fields,
  });
};

async function timeAnalyticsAwait<T>(
  label: string,
  fields: Record<string, unknown>,
  work: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  logAnalyticsDashboardTiming(`${label}:start`, fields);

  try {
    const result = await work();
    logAnalyticsDashboardTiming(`${label}:end`, {
      ...fields,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logAnalyticsDashboardTiming(`${label}:error`, {
      ...fields,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

const buildAnalyticsDashboardCacheKey = (
  businessId: string,
  range: string,
  planKey: PlanKey
) => `${businessId}:${range}:${planKey}`;

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

function getDaysInInterval(start: Date, end: Date) {
  const days: Date[] = [];
  const cursor = startOfDay(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function formatYYYYMMDD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatEEE(date: Date): string {
  return WEEKDAY_NAMES[date.getDay()];
}

function buildDailySeries(
  start: Date,
  end: Date,
  leads: AnalyticsLeadRecord[],
  messages: AnalyticsMessageRecord[],
  appointments: AnalyticsAppointmentRecord[]
) {
  const days = getDaysInInterval(start, end);
  const map = new Map<
    string,
    {
      date: string;
      label: string;
      leads: number;
      qualified: number;
      bookings: number;
      inboundMessages: number;
      aiReplies: number;
      agentReplies: number;
    }
  >(
    days.map((date) => [
      formatYYYYMMDD(date),
      {
        date: formatYYYYMMDD(date),
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
    const key = formatYYYYMMDD(lead.createdAt);
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
    const key = formatYYYYMMDD(message.createdAt);
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

    const key = formatYYYYMMDD(appointment.createdAt);
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

function buildStageDistributionFromCounts(counts: Map<string, number>, total: number) {
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

function buildTemperatureBreakdownFromCounts(
  counts: { HOT: number; WARM: number; COLD: number },
  total: number
) {
  return (["HOT", "WARM", "COLD"] as const).map((bucket) => ({
    bucket,
    count: counts[bucket],
    share: percent(counts[bucket], total),
  }));
}

function buildFunnelFromCounts(counts: {
  total: number;
  engaged: number;
  qualified: number;
  ready: number;
  booked: number;
}) {
  const stages = [
    { key: "leads", label: "Leads", count: counts.total },
    { key: "engaged", label: "Engaged", count: counts.engaged },
    { key: "qualified", label: "Qualified", count: counts.qualified },
    { key: "ready", label: "Ready To Buy", count: counts.ready },
    { key: "booked", label: "Booked", count: counts.booked },
  ];

  return stages.map((stage, index) => ({
    ...stage,
    conversionFromTop: percent(stage.count, counts.total),
    conversionFromPrevious:
      index === 0 ? 100 : percent(stage.count, stages[index - 1].count),
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
    const key = formatEEE(lead.createdAt);
    const bucket = map.get(key);

    if (bucket) {
      bucket.leads += 1;
    }
  }

  for (const message of messages) {
    const key = formatEEE(message.createdAt);
    const bucket = map.get(key);

    if (bucket) {
      bucket.messages += 1;
    }
  }

  for (const appointment of appointments) {
    if (!ACTIVE_BOOKING_STATUSES.has((appointment.status || "").toUpperCase())) {
      continue;
    }

    const key = formatEEE(appointment.createdAt);
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

function buildRevenueEngineMetrics(
  trackedMessages: AnalyticsTrackedMessageRecord[],
  conversionEvents: AnalyticsConversionEventRecord[],
  leads: AnalyticsLeadRecord[],
  bookedLeadIds: Set<string>
) {
  const byMessage = new Map<
    string,
    {
      tracking: AnalyticsTrackedMessageRecord;
      events: AnalyticsConversionEventRecord[];
    }
  >();

  for (const tracking of trackedMessages) {
    byMessage.set(tracking.messageId, {
      tracking,
      events: [],
    });
  }

  for (const event of conversionEvents) {
    if (!event.messageId) {
      continue;
    }

    const item = byMessage.get(event.messageId);

    if (item) {
      item.events.push(event);
    }
  }

  const outcomeCounts = conversionEvents.reduce(
    (acc, event) => {
      const outcome = event.outcome.toLowerCase();
      acc[outcome] = (acc[outcome] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const convertedMessages = Array.from(byMessage.values()).filter(
    (item) => item.events.length > 0
  ).length;
  const topPerformingMessages = Array.from(byMessage.values())
    .map(({ tracking, events }) => {
      const conversionValue = events.reduce((sum, event) => {
        if (event.outcome === "payment_completed") return sum + (event.value || 8);
        if (event.outcome === "booked_call") return sum + 5;
        if (event.outcome === "link_clicked") return sum + 2;
        if (event.outcome === "replied") return sum + 1;
        return sum + 0.25;
      }, 0);

      return {
        messageId: tracking.messageId,
        preview: tracking.message.content.slice(0, 180),
        cta: tracking.cta,
        angle: tracking.angle,
        leadState: tracking.leadState,
        variantKey: tracking.variant?.variantKey || null,
        variantLabel: tracking.variant?.label || null,
        sentAt: tracking.sentAt,
        conversions: events.length,
        conversionValue,
        outcomes: events.reduce((acc, event) => {
          acc[event.outcome] = (acc[event.outcome] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    })
    .sort((left, right) => {
      if (right.conversionValue !== left.conversionValue) {
        return right.conversionValue - left.conversionValue;
      }

      return right.conversions - left.conversions;
    })
    .slice(0, 8);
  const worstPerformingMessages = Array.from(byMessage.values())
    .map(({ tracking, events }) => ({
      messageId: tracking.messageId,
      preview: tracking.message.content.slice(0, 180),
      cta: tracking.cta,
      angle: tracking.angle,
      leadState: tracking.leadState,
      variantKey: tracking.variant?.variantKey || null,
      variantLabel: tracking.variant?.label || null,
      sentAt: tracking.sentAt,
      conversions: events.length,
      conversionValue: events.reduce((sum, event) => {
        if (event.outcome === "payment_completed") return sum + (event.value || 8);
        if (event.outcome === "booked_call") return sum + 5;
        if (event.outcome === "link_clicked") return sum + 2;
        if (event.outcome === "replied") return sum + 1;
        return sum + 0.25;
      }, 0),
    }))
    .filter((item) => item.conversions === 0 && item.conversionValue === 0)
    .sort((left, right) => left.sentAt.getTime() - right.sentAt.getTime())
    .slice(0, 8);
  const revenueByVariant = Array.from(byMessage.values())
    .reduce((acc, { tracking, events }) => {
      const key = tracking.variant?.variantKey || "no_variant";
      const current = acc.get(key) || {
        variantKey: key,
        revenue: 0,
        messages: 0,
      };
      current.messages += 1;
      current.revenue += events.reduce((sum, event) => {
        if (event.outcome === "payment_completed") return sum + (event.value || 8);
        if (event.outcome === "booked_call") return sum + 5;
        if (event.outcome === "link_clicked") return sum + 2;
        if (event.outcome === "replied") return sum + 1;
        return sum + 0.25;
      }, 0);
      acc.set(key, current);
      return acc;
    }, new Map<string, { variantKey: string; revenue: number; messages: number }>());
  const revenueByFunnelStage = Array.from(byMessage.values())
    .reduce((acc, { tracking, events }) => {
      const key = tracking.leadState || "UNKNOWN";
      const current = acc.get(key) || {
        leadState: key,
        revenue: 0,
        messages: 0,
      };
      current.messages += 1;
      current.revenue += events.reduce((sum, event) => {
        if (event.outcome === "payment_completed") return sum + (event.value || 8);
        if (event.outcome === "booked_call") return sum + 5;
        if (event.outcome === "link_clicked") return sum + 2;
        if (event.outcome === "replied") return sum + 1;
        return sum + 0.25;
      }, 0);
      acc.set(key, current);
      return acc;
    }, new Map<string, { leadState: string; revenue: number; messages: number }>());

  return {
    conversionRate: percent(convertedMessages, trackedMessages.length),
    replyRate: percent(outcomeCounts.replied || 0, trackedMessages.length),
    bookingRate: percent(outcomeCounts.booked_call || bookedLeadIds.size, leads.length),
    linkClickRate: percent(outcomeCounts.link_clicked || 0, trackedMessages.length),
    paymentRate: percent(outcomeCounts.payment_completed || 0, leads.length),
    trackedMessages: trackedMessages.length,
    conversionEvents: conversionEvents.length,
    outcomes: {
      replied: outcomeCounts.replied || 0,
      linkClicked: outcomeCounts.link_clicked || 0,
      bookedCall: outcomeCounts.booked_call || 0,
      paymentCompleted: outcomeCounts.payment_completed || 0,
    },
    topPerformingMessages,
    worstPerformingMessages,
    revenueByVariant: Array.from(revenueByVariant.values())
      .map((item) => ({
        ...item,
        revenuePerMessage:
          item.messages > 0 ? round(item.revenue / item.messages, 2) : 0,
      }))
      .sort((left, right) => right.revenuePerMessage - left.revenuePerMessage),
    revenueByFunnelStage: Array.from(revenueByFunnelStage.values())
      .map((item) => ({
        ...item,
        revenuePerMessage:
          item.messages > 0 ? round(item.revenue / item.messages, 2) : 0,
      }))
      .sort((left, right) => right.revenuePerMessage - left.revenuePerMessage),
  };
}

const REVENUE_BRAIN_TRACKING_SOURCES = new Set([
  "SALES",
  "BOOKING",
  "AUTOMATION",
  "ESCALATE",
]);

const asMetaRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asMetaString = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

const asMetaNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function buildStageFunnel(
  stages: Array<{
    key: string;
    label: string;
    count: number;
  }>
) {
  return stages.map((stage, index) => ({
    ...stage,
    conversionFromTop: percent(stage.count, stages[0]?.count || 0),
    conversionFromPrevious:
      index === 0 ? 100 : percent(stage.count, stages[index - 1]?.count || 0),
  }));
}

function buildRevenueBrainMetrics(
  analyticsEvents: AnalyticsRevenueBrainEventRecord[],
  trackedMessages: AnalyticsTrackedMessageRecord[],
  conversionEvents: AnalyticsConversionEventRecord[]
) {
  const completedEvents = analyticsEvents.filter(
    (event) => event.type === "REVENUE_BRAIN_COMPLETED"
  );
  const failedEvents = analyticsEvents.filter(
    (event) => event.type === "REVENUE_BRAIN_FAILED"
  );
  const toolEvents = analyticsEvents.filter(
    (event) => event.type === "REVENUE_BRAIN_TOOL"
  );
  const revenueBrainTrackedMessages = trackedMessages.filter((message) =>
    REVENUE_BRAIN_TRACKING_SOURCES.has(String(message.source || "").toUpperCase())
  );
  const revenueBrainMessageIds = new Set(
    revenueBrainTrackedMessages.map((message) => message.messageId)
  );
  const attributedConversions = conversionEvents.filter(
    (event) => event.messageId && revenueBrainMessageIds.has(event.messageId)
  );
  const engagedMessageIds = new Set(
    attributedConversions
      .filter((event) =>
        ["replied", "opened", "link_clicked", "booked_call", "payment_completed"].includes(
          String(event.outcome || "").toLowerCase()
        )
      )
      .map((event) => event.messageId!)
  );
  const bookedMessageIds = new Set(
    attributedConversions
      .filter((event) =>
        ["booked_call", "payment_completed"].includes(
          String(event.outcome || "").toLowerCase()
        )
      )
      .map((event) => event.messageId!)
  );
  const convertedMessageIds = new Set(
    attributedConversions
      .filter(
        (event) => String(event.outcome || "").toLowerCase() === "payment_completed"
      )
      .map((event) => event.messageId!)
  );
  const routeCounts = new Map<string, number>();
  const toolCounts = new Map<
    string,
    { applied: number; failed: number; skipped: number }
  >();
  let latencyTotal = 0;
  let knowledgeHitTotal = 0;
  let memoryHitCount = 0;

  for (const event of completedEvents) {
    const meta = asMetaRecord(event.meta);
    const route = asMetaString(meta?.route) || "UNKNOWN";
    routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
    latencyTotal += asMetaNumber(meta?.latencyMs);
    knowledgeHitTotal += asMetaNumber(meta?.knowledgeHitCount);

    if (asMetaNumber(meta?.freshMemoryFactCount) > 0) {
      memoryHitCount += 1;
    }
  }

  for (const event of toolEvents) {
    const meta = asMetaRecord(event.meta);
    const tool = asMetaString(meta?.tool) || "unknown";
    const status = asMetaString(meta?.status) || "skipped";
    const current = toolCounts.get(tool) || {
      applied: 0,
      failed: 0,
      skipped: 0,
    };

    if (status === "applied") current.applied += 1;
    else if (status === "failed") current.failed += 1;
    else current.skipped += 1;

    toolCounts.set(tool, current);
  }

  const actionableToolAttempts = Array.from(toolCounts.values()).reduce(
    (sum, item) => sum + item.applied + item.failed,
    0
  );
  const actionableToolSuccess = Array.from(toolCounts.values()).reduce(
    (sum, item) => sum + item.applied,
    0
  );

  return {
    summary: {
      runs: completedEvents.length + failedEvents.length,
      completed: completedEvents.length,
      failed: failedEvents.length,
      successRate: percent(
        completedEvents.length,
        completedEvents.length + failedEvents.length
      ),
      toolSuccessRate: percent(actionableToolSuccess, actionableToolAttempts),
      avgLatencyMs:
        completedEvents.length > 0
          ? round(latencyTotal / completedEvents.length, 1)
          : 0,
      avgKnowledgeHits:
        completedEvents.length > 0
          ? round(knowledgeHitTotal / completedEvents.length, 2)
          : 0,
      memoryHitRate: percent(memoryHitCount, completedEvents.length),
      conversionRate: percent(
        bookedMessageIds.size,
        revenueBrainTrackedMessages.length
      ),
    },
    routes: Array.from(routeCounts.entries())
      .map(([route, count]) => ({
        route,
        count,
        share: percent(count, completedEvents.length),
      }))
      .sort((left, right) => right.count - left.count),
    tools: Array.from(toolCounts.entries())
      .map(([tool, counts]) => ({
        tool,
        applied: counts.applied,
        failed: counts.failed,
        skipped: counts.skipped,
        successRate: percent(counts.applied, counts.applied + counts.failed),
      }))
      .sort((left, right) => {
        if (right.applied !== left.applied) {
          return right.applied - left.applied;
        }

        return right.failed - left.failed;
      }),
    funnel: buildStageFunnel([
      {
        key: "runs",
        label: "Runs",
        count: completedEvents.length,
      },
      {
        key: "replies",
        label: "Replies Sent",
        count: revenueBrainTrackedMessages.length,
      },
      {
        key: "engaged",
        label: "Engaged",
        count: engagedMessageIds.size,
      },
      {
        key: "booked",
        label: "Booked",
        count: bookedMessageIds.size,
      },
      {
        key: "converted",
        label: "Converted",
        count: convertedMessageIds.size,
      },
    ]),
  };
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

export function buildAnalyticsDashboardFallback(range: string, planKey: PlanKey) {
  const window = getDateWindow(range);
  const emptyLeads: AnalyticsLeadRecord[] = [];
  const emptyMessages: AnalyticsMessageRecord[] = [];
  const emptyAppointments: AnalyticsAppointmentRecord[] = [];
  const emptyTrackedMessages: AnalyticsTrackedMessageRecord[] = [];
  const emptyConversions: AnalyticsConversionEventRecord[] = [];
  const emptyRevenueEvents: AnalyticsRevenueBrainEventRecord[] = [];
  const emptyBookedLeadIds = new Set<string>();
  const emptyFunnel = buildFunnel(emptyLeads, emptyBookedLeadIds);

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
      name: "Workspace",
      industry: null,
      website: null,
      teamSize: null,
      timezone: null,
    },
    summary: {
      healthScore: buildMetric(0, 0, "number"),
      leadsCaptured: buildMetric(0, 0, "number"),
      qualifiedLeads: buildMetric(0, 0, "number"),
      bookedMeetings: buildMetric(0, 0, "number"),
      leadToBookingRate: buildMetric(0, 0, "percent"),
      avgFirstResponseMinutes: buildMetric(0, 0, "minutes", "lower"),
      avgLeadScore: buildMetric(0, 0, "number"),
      aiReplyShare: buildMetric(0, 0, "percent"),
      unreadBacklog: 0,
      hotLeadCount: 0,
      activeConversations: 0,
      humanTakeoverCount: 0,
    },
    trends: {
      series: buildDailySeries(
        window.current.start,
        window.current.end,
        emptyLeads,
        emptyMessages,
        emptyAppointments
      ),
      totals: {
        inboundMessages: 0,
        aiReplies: 0,
        agentReplies: 0,
        totalReplies: 0,
        avgMessagesPerLead: 0,
      },
    },
    funnel: emptyFunnel,
    revenueEngine: {
      ...buildRevenueEngineMetrics(
        emptyTrackedMessages,
        emptyConversions,
        emptyLeads,
        emptyBookedLeadIds
      ),
      variantPerformance: [],
      funnelBreakdown: emptyFunnel,
    },
    revenueBrain: buildRevenueBrainMetrics(
      emptyRevenueEvents,
      emptyTrackedMessages,
      emptyConversions
    ),
    sourcePerformance: [],
    deepDive: null,
  };
}

async function computeAnalyticsDashboardProjection(
  businessId: string,
  range: string,
  planKey: PlanKey
) {
  const projectionStartedAt = Date.now();
  const window = getDateWindow(range);
  const timingFields = {
    businessId,
    range,
    planKey,
    currentStart: window.current.start.toISOString(),
    currentEnd: window.current.end.toISOString(),
    previousStart: window.previous.start.toISOString(),
    previousEnd: window.previous.end.toISOString(),
  };
  logAnalyticsDashboardTiming("computeAnalyticsDashboardProjection:start", timingFields);

  const [
    business,
    allLeads,
    allAppointments,
    rangeMessages,
    currentConversionEvents,
    currentRevenueBrainEvents,
    currentTrackedMessages,
    variantPerformance,
  ] = await timeAnalyticsAwait("computeAnalyticsDashboardProjection:initialPromiseAll", timingFields, () =>
    Promise.all([
      timeAnalyticsAwait("getBusinessProfile", timingFields, () =>
        getBusinessProfile(businessId)
      ),
      timeAnalyticsAwait("getAllLeads", timingFields, () => getAllLeads(businessId)),
      timeAnalyticsAwait("getAllAppointments", timingFields, () =>
        getAllAppointments(businessId)
      ),
      timeAnalyticsAwait("getMessagesInRange", timingFields, () =>
        getMessagesInRange(businessId, window.previous.start, window.current.end)
      ),
      timeAnalyticsAwait("getConversionEventsInRange", timingFields, () =>
        getConversionEventsInRange(
          businessId,
          window.current.start,
          window.current.end
        )
      ),
      timeAnalyticsAwait("getRevenueBrainAnalyticsInRange", timingFields, () =>
        getRevenueBrainAnalyticsInRange(
          businessId,
          window.current.start,
          window.current.end
        )
      ),
      timeAnalyticsAwait("getTrackedMessagesInRange", timingFields, () =>
        getTrackedMessagesInRange(
          businessId,
          window.current.start,
          window.current.end
        )
      ),
      timeAnalyticsAwait("getVariantPerformance", timingFields, () =>
        getVariantPerformance({ businessId })
      ),
    ])
  );
  logAnalyticsDashboardTiming("computeAnalyticsDashboardProjection:initialPromiseAll:rows", {
    ...timingFields,
    allLeads: allLeads.length,
    allAppointments: allAppointments.length,
    rangeMessages: rangeMessages.length,
    currentConversionEvents: currentConversionEvents.length,
    currentRevenueBrainEvents: currentRevenueBrainEvents.length,
    currentTrackedMessages: currentTrackedMessages.length,
  });

  if (currentTrackedMessages.length >= 10) {
    logAnalyticsDashboardTiming("runSalesOptimizer:background_start", timingFields);
    void timeAnalyticsAwait("runSalesOptimizer:background", timingFields, () =>
      runSalesOptimizer({ businessId })
    ).catch(() => {});
  }

  logAnalyticsDashboardTiming("computeAnalyticsDashboardProjection:sync_build_start", timingFields);

  // Split messages
  const currentMessages = rangeMessages.filter(
    (m) =>
      m.createdAt >= window.current.start &&
      m.createdAt <= window.current.end
  );
  const previousMessages = rangeMessages.filter(
    (m) =>
      m.createdAt >= window.previous.start &&
      m.createdAt <= window.previous.end
  );

  // Split leads
  const currentLeads = allLeads.filter(
    (lead) =>
      lead.createdAt >= window.current.start &&
      lead.createdAt <= window.current.end
  );
  const previousLeads = allLeads.filter(
    (lead) =>
      lead.createdAt >= window.previous.start &&
      lead.createdAt <= window.previous.end
  );

  // Split appointments
  const allLeadAppointments = allAppointments.filter(
    (appointment) => appointment.leadId !== null
  );
  const currentAppointments = allAppointments.filter(
    (appointment) =>
      appointment.createdAt >= window.current.start &&
      appointment.createdAt <= window.current.end
  );
  const previousAppointments = allAppointments.filter(
    (appointment) =>
      appointment.createdAt >= window.previous.start &&
      appointment.createdAt <= window.previous.end
  );

  const currentLeadIdSet = new Set(currentLeads.map((lead) => lead.id));
  const previousLeadIdSet = new Set(previousLeads.map((lead) => lead.id));
  
  const currentLeadAppointments = allLeadAppointments.filter((appointment) =>
    appointment.leadId ? currentLeadIdSet.has(appointment.leadId) : false
  );
  const previousLeadAppointments = allLeadAppointments.filter((appointment) =>
    appointment.leadId ? previousLeadIdSet.has(appointment.leadId) : false
  );

  const currentLeadBookedIds = getActiveBookedLeadIds(currentLeadAppointments);
  const previousLeadBookedIds = getActiveBookedLeadIds(previousLeadAppointments);
  const allBookedLeadIds = getActiveBookedLeadIds(allLeadAppointments);

  const revenueEngine = buildRevenueEngineMetrics(
    currentTrackedMessages,
    currentConversionEvents,
    currentLeads,
    currentLeadBookedIds
  );
  const revenueBrain = buildRevenueBrainMetrics(
    currentRevenueBrainEvents,
    currentTrackedMessages,
    currentConversionEvents
  );

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

  // Single-pass computation for allLeads metrics
  let unreadBacklog = 0;
  let hotLeadCount = 0;
  let activeConversations = 0;
  let humanTakeoverCount = 0;
  let hotLeadsWithoutBooking = 0;
  let unreadQualifiedLeads = 0;
  let totalFollowups = 0;

  const stageDistributionCounts = new Map<string, number>();

  let temperatureHot = 0;
  let temperatureWarm = 0;
  let temperatureCold = 0;

  let funnelEngaged = 0;
  let funnelQualified = 0;
  let funnelReady = 0;
  let funnelBooked = 0;

  for (let i = 0; i < allLeads.length; i++) {
    const lead = allLeads[i];
    const isQualified = isQualifiedLead(lead);
    const isReady = isReadyLead(lead);
    const tempBucket = getTemperatureBucket(lead);
    const isBooked = allBookedLeadIds.has(lead.id);

    if (lead.unreadCount > 0) {
      unreadBacklog++;
      if (isQualified) {
        unreadQualifiedLeads++;
      }
    }

    if (tempBucket === "HOT") {
      hotLeadCount++;
      if (!isBooked) {
        hotLeadsWithoutBooking++;
      }
    }

    if (lead.lastMessageAt) {
      activeConversations++;
      funnelEngaged++;
    }

    if (lead.isHumanActive) {
      humanTakeoverCount++;
    }

    totalFollowups += lead.followupCount || 0;

    // stage distribution
    const stageKey = (lead.stage || "NEW").toUpperCase();
    stageDistributionCounts.set(stageKey, (stageDistributionCounts.get(stageKey) || 0) + 1);

    // temperature breakdown
    if (tempBucket === "HOT") temperatureHot++;
    else if (tempBucket === "WARM") temperatureWarm++;
    else temperatureCold++;

    // funnel
    if (isQualified) funnelQualified++;
    if (isReady) funnelReady++;
    if (isBooked) funnelBooked++;
  }

  const averageFollowups = allLeads.length > 0 ? round(totalFollowups / allLeads.length, 1) : 0;

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

  const funnel = buildFunnelFromCounts({
    total: allLeads.length,
    engaged: funnelEngaged,
    qualified: funnelQualified,
    ready: funnelReady,
    booked: funnelBooked,
  });

  const deepDive =
    planKey === "ELITE"
      ? {
          stageDistribution: buildStageDistributionFromCounts(stageDistributionCounts, allLeads.length),
          intentBreakdown: buildIntentBreakdown(currentLeads),
          temperatureBreakdown: buildTemperatureBreakdownFromCounts(
            { HOT: temperatureHot, WARM: temperatureWarm, COLD: temperatureCold },
            allLeads.length
          ),
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

  const payload = {
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
    funnel,
    revenueEngine: {
      ...revenueEngine,
      variantPerformance,
      funnelBreakdown: funnel,
    },
    revenueBrain,
    sourcePerformance,
    deepDive,
  };
  logAnalyticsDashboardTiming("computeAnalyticsDashboardProjection:end", {
    ...timingFields,
    durationMs: Date.now() - projectionStartedAt,
  });

  return payload;
}

export async function getAnalyticsDashboard(
  businessId: string,
  range: string,
  planKey: PlanKey,
  options?: {
    requestSignal?: AbortSignal | null;
  }
) {
  const cacheKey = buildAnalyticsDashboardCacheKey(businessId, range, planKey);
  const dashboardTimingFields = {
    businessId,
    range,
    planKey,
    cacheKey,
  };
  logAnalyticsDashboardTiming("getAnalyticsDashboard:start", dashboardTimingFields);

  if (planKey !== "ELITE") {
    console.info("[ANALYTICS_DASHBOARD_CACHE]", {
      mode: "NON_ELITE_FAST_FALLBACK",
      businessId,
      range,
      planKey,
    });
    logAnalyticsDashboardTiming("getAnalyticsDashboard:non_elite_fallback", dashboardTimingFields);
    return buildAnalyticsDashboardFallback(range, planKey);
  }

  const fallback = buildAnalyticsDashboardFallback(range, planKey);
  const snapshot = await timeAnalyticsAwait(
    "getAnalyticsDashboard:getIsolatedProjectionSnapshot",
    dashboardTimingFields,
    () =>
      getIsolatedProjectionSnapshot({
        cacheKey,
        label: "analytics_dashboard",
        businessId,
        cacheTtlMs: ANALYTICS_DASHBOARD_CACHE_TTL_MS,
        staleTtlMs: ANALYTICS_DASHBOARD_STALE_TTL_MS,
        computeBudgetMs: ANALYTICS_DASHBOARD_COMPUTE_BUDGET_MS,
        initialWaitMs: ANALYTICS_DASHBOARD_REFRESH_WAIT_MS,
        minRefreshIntervalMs: ANALYTICS_DASHBOARD_MIN_REFRESH_INTERVAL_MS,
        requestSignal: options?.requestSignal || null,
        fallback,
        compute: () =>
          timeAnalyticsAwait(
            "getAnalyticsDashboard:computeAnalyticsDashboardProjection",
            dashboardTimingFields,
            () => computeAnalyticsDashboardProjection(businessId, range, planKey)
          ),
      })
  );

  console.info("[ANALYTICS_DASHBOARD_CACHE]", {
    mode: snapshot.meta.source,
    businessId,
    range,
    planKey,
    stale: snapshot.meta.stale,
    deduped: snapshot.meta.deduped,
    waitMs: snapshot.meta.waitMs,
    budgetExceeded: snapshot.meta.budgetExceeded,
    cancelled: snapshot.meta.cancelled,
  });
  logAnalyticsDashboardTiming("getAnalyticsDashboard:end", {
    ...dashboardTimingFields,
    source: snapshot.meta.source,
    waitMs: snapshot.meta.waitMs,
    budgetExceeded: snapshot.meta.budgetExceeded,
  });
  return snapshot.value;
}
