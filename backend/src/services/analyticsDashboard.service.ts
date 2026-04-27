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
  getAllLeadAppointments,
  getAllLeads,
  getAppointmentsForLeadIds,
  getAppointmentsInRange,
  getBusinessProfile,
  getConversionEventsInRange,
  getLeadsInRange,
  getMessagesInRange,
  getRevenueBrainAnalyticsInRange,
  getTrackedMessagesInRange,
} from "../analytics/analyticsDashboard.repository";
import { getVariantPerformance } from "./salesAgent/abTesting.service";
import { runSalesOptimizer } from "./salesAgent/optimizer.service";

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
const ACTIVE_BOOKING_STATUSES = new Set(["RESCHEDULED", "CONFIRMED"]);

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

function getDaysInInterval(start: Date, end: Date) {
  const days: Date[] = [];
  const cursor = startOfDay(start);

  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
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
    currentConversionEvents,
    currentRevenueBrainEvents,
    currentTrackedMessages,
    variantPerformance,
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
    getConversionEventsInRange(businessId, window.current.start, window.current.end),
    getRevenueBrainAnalyticsInRange(
      businessId,
      window.current.start,
      window.current.end
    ),
    getTrackedMessagesInRange(businessId, window.current.start, window.current.end),
    getVariantPerformance({ businessId }),
  ]);

  const [currentLeadAppointments, previousLeadAppointments] = await Promise.all([
    getAppointmentsForLeadIds(currentLeads.map((lead) => lead.id)),
    getAppointmentsForLeadIds(previousLeads.map((lead) => lead.id)),
  ]);

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

  if (currentTrackedMessages.length >= 10) {
    void runSalesOptimizer({ businessId }).catch(() => {});
  }

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
    revenueEngine: {
      ...revenueEngine,
      variantPerformance,
      funnelBreakdown: buildFunnel(allLeads, allBookedLeadIds),
    },
    revenueBrain,
    sourcePerformance,
    deepDive,
  };
}
