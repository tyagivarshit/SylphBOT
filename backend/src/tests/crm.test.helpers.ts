import type { SalesMemoryFact } from "../services/salesAgent/types";
import type {
  CRMAppointmentRecord,
  CRMConversionRecord,
  CRMLeadSignalSnapshot,
  CRMMessageRecord,
} from "../services/crm/leadIntelligence.service";

const now = new Date("2026-04-26T12:00:00.000Z");

const buildMessageStats = (messages: CRMMessageRecord[]) => {
  const latestUser = messages.find((message) => message.sender === "USER") || null;
  const latestAI = messages.find((message) => message.sender === "AI") || null;

  return {
    total: messages.length,
    userCount: messages.filter((message) => message.sender === "USER").length,
    aiCount: messages.filter((message) => message.sender === "AI").length,
    latestUserMessage: latestUser?.content || null,
    latestAIMessage: latestAI?.content || null,
    latestUserMessageAt: latestUser?.createdAt || null,
    latestAIMessageAt: latestAI?.createdAt || null,
    recentQuestionCount: messages.slice(0, 5).reduce((count, message) => {
      return count + (message.content.includes("?") ? 1 : 0);
    }, 0),
  };
};

const buildConversionStats = (conversions: CRMConversionRecord[]) =>
  conversions.reduce(
    (stats, event) => {
      if (event.outcome === "opened") stats.openedCount += 1;
      if (event.outcome === "link_clicked") stats.clickedCount += 1;
      if (event.outcome === "booked_call") stats.bookedCount += 1;
      if (event.outcome === "payment_completed") stats.paymentCount += 1;
      if (event.outcome === "replied") stats.repliedCount += 1;

      stats.total += 1;
      stats.totalValue += Number(event.value || 0);
      if (!stats.lastConversionAt || event.occurredAt > stats.lastConversionAt) {
        stats.lastConversionAt = event.occurredAt;
      }

      return stats;
    },
    {
      total: 0,
      openedCount: 0,
      clickedCount: 0,
      bookedCount: 0,
      paymentCount: 0,
      repliedCount: 0,
      lastConversionAt: null as Date | null,
      totalValue: 0,
    }
  );

const buildAppointmentStats = (appointments: CRMAppointmentRecord[]) => {
  const upcoming = appointments.filter(
    (appointment) =>
      appointment.startTime >= now &&
      appointment.status !== "CANCELLED" &&
      appointment.status !== "COMPLETED"
  );

  return {
    total: appointments.length,
    upcomingCount: upcoming.length,
    completedCount: appointments.filter((item) => item.status === "COMPLETED").length,
    nextAppointmentAt: upcoming.sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime()
    )[0]?.startTime || null,
  };
};

export const createLeadIntelligenceSnapshot = (
  overrides?: Partial<CRMLeadSignalSnapshot>
) => {
  const memoryFacts: SalesMemoryFact[] = [
    {
      key: "service",
      value: "website redesign",
      confidence: 0.86,
      decayedConfidence: 0.86,
      stale: false,
      source: "heuristic",
      lastObservedAt: new Date("2026-04-26T10:15:00.000Z"),
      updatedAt: new Date("2026-04-26T10:15:00.000Z"),
      createdAt: new Date("2026-04-25T10:15:00.000Z"),
      ageDays: 1,
    },
    {
      key: "budget",
      value: "5000",
      confidence: 0.81,
      decayedConfidence: 0.81,
      stale: false,
      source: "heuristic",
      lastObservedAt: new Date("2026-04-26T10:15:00.000Z"),
      updatedAt: new Date("2026-04-26T10:15:00.000Z"),
      createdAt: new Date("2026-04-25T10:15:00.000Z"),
      ageDays: 1,
    },
    {
      key: "timeline",
      value: "this week",
      confidence: 0.78,
      decayedConfidence: 0.78,
      stale: false,
      source: "heuristic",
      lastObservedAt: new Date("2026-04-26T10:15:00.000Z"),
      updatedAt: new Date("2026-04-26T10:15:00.000Z"),
      createdAt: new Date("2026-04-25T10:15:00.000Z"),
      ageDays: 1,
    },
  ];
  const messages: CRMMessageRecord[] = [
    {
      sender: "USER",
      content: "Can you share pricing and book me a demo this week?",
      createdAt: new Date("2026-04-26T11:40:00.000Z"),
      metadata: {},
    },
    {
      sender: "AI",
      content: "I can help with that. What timeline are you targeting?",
      createdAt: new Date("2026-04-26T11:20:00.000Z"),
      metadata: {},
    },
    {
      sender: "USER",
      content: "Need website redesign support.",
      createdAt: new Date("2026-04-26T11:00:00.000Z"),
      metadata: {},
    },
  ];
  const conversions: CRMConversionRecord[] = [
    {
      outcome: "replied",
      value: 1,
      occurredAt: new Date("2026-04-26T11:40:00.000Z"),
      source: "TEST",
      metadata: {},
    },
    {
      outcome: "link_clicked",
      value: 2,
      occurredAt: new Date("2026-04-26T11:45:00.000Z"),
      source: "TEST",
      metadata: {},
    },
  ];
  const appointments: CRMAppointmentRecord[] = [];

  const base: CRMLeadSignalSnapshot = {
    businessId: "business_1",
    leadId: "lead_1",
    clientId: "client_1",
    traceId: "trace_1",
    preview: false,
    now,
    inputMessage: "Can you share pricing and book me a demo this week?",
    lead: {
      name: "Aarav",
      email: null,
      phone: "+919999999999",
      instagramId: null,
      platform: "WHATSAPP",
      stage: "INTERESTED",
      aiStage: "WARM",
      revenueState: "WARM",
      intent: "BOOKING",
      leadScore: 58,
      unreadCount: 1,
      followupCount: 0,
      isHumanActive: false,
      lastFollowupAt: null,
      lastEngagedAt: new Date("2026-04-26T11:40:00.000Z"),
      lastClickedAt: new Date("2026-04-26T11:45:00.000Z"),
      lastBookedAt: null,
      lastConvertedAt: null,
      lastMessageAt: new Date("2026-04-26T11:40:00.000Z"),
      lastLifecycleAt: null,
      intelligenceUpdatedAt: null,
      createdAt: new Date("2026-04-20T08:00:00.000Z"),
    },
    business: {
      name: "Automexia",
      industry: "Agency",
      timezone: "Asia/Calcutta",
      website: "https://automexia.ai",
    },
    client: {
      id: "client_1",
      platform: "WHATSAPP",
      aiTone: "human-confident",
    },
    salesSignals: {
      intent: "BOOKING",
      intentCategory: "buy",
      emotion: "urgent",
      userSignal: "yes",
      temperature: "HOT",
      stage: "READY_TO_BUY",
      objection: "NONE",
      qualificationMissing: [],
      unansweredQuestionCount: 0,
      planKey: "PRO",
    },
    memory: {
      facts: memoryFacts,
      summary: "Lead wants website redesign and asked for pricing this week.",
    },
    conversationState: {
      name: "SALES_AGENT_ACTIVE",
      context: {
        revenueBrain: {
          followupAction: "schedule",
        },
      },
    },
    messages,
    messageStats: buildMessageStats(messages),
    conversions,
    conversionStats: buildConversionStats(conversions),
    appointments,
    appointmentStats: buildAppointmentStats(appointments),
    followups: {
      schedule: [
        {
          step: "NO_REPLY_1H",
          trigger: "no_reply",
          delayMs: 3600000,
          scheduledAt: new Date("2026-04-26T13:00:00.000Z"),
        },
      ],
      currentAction: "schedule",
    },
    analytics: {
      aiReplyCount: 4,
      followupMessageCount: 1,
      lastTrackedReplyAt: new Date("2026-04-26T11:20:00.000Z"),
    },
    relatedLeads: [],
    existingProfile: null,
  };

  return {
    ...base,
    ...(overrides || {}),
    lead: {
      ...base.lead,
      ...((overrides?.lead as any) || {}),
    },
    business: {
      ...base.business,
      ...((overrides?.business as any) || {}),
    },
    client: {
      ...base.client,
      ...((overrides?.client as any) || {}),
    },
    salesSignals: {
      ...base.salesSignals,
      ...((overrides?.salesSignals as any) || {}),
    },
    memory: {
      ...base.memory,
      ...((overrides?.memory as any) || {}),
    },
    conversationState: {
      ...base.conversationState,
      ...((overrides?.conversationState as any) || {}),
    },
    messageStats: overrides?.messageStats || base.messageStats,
    conversionStats: overrides?.conversionStats || base.conversionStats,
    appointmentStats: overrides?.appointmentStats || base.appointmentStats,
    followups: {
      ...base.followups,
      ...((overrides?.followups as any) || {}),
    },
    analytics: {
      ...base.analytics,
      ...((overrides?.analytics as any) || {}),
    },
  };
};
