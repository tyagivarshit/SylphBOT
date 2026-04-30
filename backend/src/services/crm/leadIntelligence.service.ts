import crypto from "crypto";
import prisma from "../../config/prisma";
import { buildMemoryContext } from "../aiMemoryEngine.service";
import { getConversationState } from "../conversationState.service";
import { getIntelligenceRuntimeInfluence } from "../intelligence/intelligenceRuntimeInfluence.service";
import { logAIEvent, logError } from "../monitoringLogger.service";
import { getSalesFollowupSchedule } from "../salesAgent/followup.service";
import type { SalesAgentContext, SalesMemoryFact } from "../salesAgent/types";
import logger from "../../utils/logger";
import { buildCustomerGraph } from "./customerGraph.service";
import { assessLeadLifecycle } from "./lifecycle.service";
import { predictLeadBehavior } from "./behavior.service";
import { predictLeadValue } from "./valuePrediction.service";
import { buildLeadSegments } from "./segmentation.service";
import { mapLeadRelationships } from "./relationship.service";
import {
  enqueueCRMRefreshRequest,
  type CRMRefreshRequestPayload,
  type CRMRefreshSignalContext,
  waitForCRMRefreshVersion,
} from "./refreshQueue.service";
import type {
  CRMCommercialState,
  CRMUnifiedStateGraph,
} from "./stateGraph.service";
import { resolveUnifiedCustomerState } from "./stateGraph.service";

type JsonRecord = Record<string, unknown>;

export type CRMMessageRecord = {
  sender: string;
  content: string;
  createdAt: Date;
  metadata?: JsonRecord | null;
};

export type CRMConversionRecord = {
  outcome: string;
  value: number | null;
  occurredAt: Date;
  source?: string | null;
  metadata?: JsonRecord | null;
};

export type CRMAppointmentRecord = {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date;
};

export type CRMFollowupStep = {
  step: string;
  trigger: string;
  delayMs: number;
  scheduledAt: Date;
};

export type CRMRelatedLead = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  instagramId: string | null;
  platform: string | null;
};

export type CRMRelationshipEdge = {
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  relationshipType: string;
  strength: number;
  score: number;
  reason: string;
  metadata?: JsonRecord;
  lastObservedAt?: Date | null;
};

export type CRMEnrichmentProfile = {
  resolvedName: string | null;
  resolvedEmail: string | null;
  resolvedPhone: string | null;
  resolvedBudget: string | null;
  resolvedTimeline: string | null;
  resolvedNeed: string | null;
  profileCompleteness: number;
  identityConfidence: number;
  memoryHighlights: string[];
  lastTouchAt: Date | null;
  firstSeenAt: Date | null;
};

export type CRMCustomerGraph = {
  nodes: Array<{
    key: string;
    type: string;
    label: string;
    weight: number;
  }>;
  edges: CRMRelationshipEdge[];
  connectedSystems: string[];
  profileCompleteness: number;
  identityConfidence: number;
  graphHealth: number;
  enrichment: CRMEnrichmentProfile;
  stats: {
    messageCount: number;
    memoryFactCount: number;
    conversionCount: number;
    followupCount: number;
    appointmentCount: number;
    relatedLeadCount: number;
  };
};

export type CRMScoreSeeds = {
  engagementScore: number;
  qualificationScore: number;
  buyingIntentScore: number;
};

export type CRMLifecycleAssessment = {
  stage: string;
  status: string;
  score: number;
  nextLeadStage: string;
  nextRevenueState: string;
  nextAIStage: string;
  reason: string;
  daysSinceLastTouch: number | null;
  stale: boolean;
  lastLifecycleAt: Date | null;
};

export type CRMBehaviorPrediction = {
  predictedBehavior: string;
  nextBestAction: string;
  behaviorScore: number;
  responseLikelihood: number;
  bookingLikelihood: number;
  purchaseLikelihood: number;
  churnLikelihood: number;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  followupIntensity: "pause" | "light" | "normal" | "fast";
  reason: string;
};

export type CRMValuePrediction = {
  valueScore: number;
  valueTier: string;
  churnScore: number;
  churnRisk: string;
  projectedValue: number;
  expansionLikelihood: number;
  reason: string;
};

export type CRMSegmentProfile = {
  primarySegment: string;
  secondarySegment: string | null;
  segmentKeys: string[];
  reason: string;
};

export type CRMRelationshipMap = {
  relationshipScore: number;
  health: string;
  summary: string;
  edges: CRMRelationshipEdge[];
  strongestEdge: CRMRelationshipEdge | null;
  edgeCount: number;
};

export type CRMIntelligenceScorecard = CRMScoreSeeds & {
  lifecycleScore: number;
  behaviorScore: number;
  valueScore: number;
  churnScore: number;
  relationshipScore: number;
  compositeScore: number;
};

export type CRMIntelligenceProfile = {
  version: string;
  businessId: string;
  leadId: string;
  clientId: string | null;
  traceId: string | null;
  preview: boolean;
  graph: CRMCustomerGraph;
  enrichment: CRMEnrichmentProfile;
  stateGraph: CRMUnifiedStateGraph;
  lifecycle: CRMLifecycleAssessment;
  behavior: CRMBehaviorPrediction;
  value: CRMValuePrediction;
  segments: CRMSegmentProfile;
  relationships: CRMRelationshipMap;
  scorecard: CRMIntelligenceScorecard;
  observability: {
    connectedSystems: string[];
    generatedAt: string;
    source: string;
    route: string | null;
    followupAction: string | null;
    decisionAction: string | null;
    compute: {
      cacheStatus: "MISS" | "HIT" | "REUSED";
      cacheSource: "NONE" | "MEMORY" | "PERSISTED";
      recomputedDimensions: string[];
      dimensionHashes: Record<string, string>;
      ttlExpiresAt: string;
    };
  };
};

export type CRMLeadSignalSnapshot = {
  businessId: string;
  leadId: string;
  clientId: string | null;
  traceId: string | null;
  preview: boolean;
  now: Date;
  inputMessage: string;
  lead: {
    name: string | null;
    email: string | null;
    phone: string | null;
    instagramId: string | null;
    platform: string | null;
    stage: string | null;
    aiStage: string | null;
    revenueState: string | null;
    intent: string | null;
    leadScore: number;
    unreadCount: number;
    followupCount: number;
    isHumanActive: boolean;
    lastFollowupAt: Date | null;
    lastEngagedAt: Date | null;
    lastClickedAt: Date | null;
    lastBookedAt: Date | null;
    lastConvertedAt: Date | null;
    lastMessageAt: Date | null;
    lastLifecycleAt: Date | null;
    intelligenceUpdatedAt: Date | null;
    createdAt: Date | null;
  };
  business: {
    name: string | null;
    industry: string | null;
    timezone: string | null;
    website: string | null;
  };
  client: {
    id: string | null;
    platform: string | null;
    aiTone: string | null;
  };
  salesSignals: {
    intent: string | null;
    intentCategory: string | null;
    emotion: string | null;
    userSignal: string | null;
    temperature: string | null;
    stage: string | null;
    objection: string | null;
    qualificationMissing: string[];
    unansweredQuestionCount: number;
    planKey: string | null;
  };
  memory: {
    facts: SalesMemoryFact[];
    summary: string;
  };
  conversationState: {
    name: string | null;
    context: JsonRecord;
  };
  messages: CRMMessageRecord[];
  messageStats: {
    total: number;
    userCount: number;
    aiCount: number;
    latestUserMessage: string | null;
    latestAIMessage: string | null;
    latestUserMessageAt: Date | null;
    latestAIMessageAt: Date | null;
    recentQuestionCount: number;
  };
  conversions: CRMConversionRecord[];
  conversionStats: {
    total: number;
    openedCount: number;
    clickedCount: number;
    bookedCount: number;
    paymentCount: number;
    repliedCount: number;
    lastConversionAt: Date | null;
    totalValue: number;
  };
  appointments: CRMAppointmentRecord[];
  appointmentStats: {
    total: number;
    upcomingCount: number;
    completedCount: number;
    nextAppointmentAt: Date | null;
  };
  followups: {
    schedule: CRMFollowupStep[];
    currentAction: string | null;
  };
  analytics: {
    aiReplyCount: number;
    followupMessageCount: number;
    lastTrackedReplyAt: Date | null;
  };
  relatedLeads: CRMRelatedLead[];
  existingProfile: {
    compositeScore: number;
    valueScore: number;
    churnScore: number;
    lifecycleStage: string | null;
    primarySegment: string | null;
    updatedAt: Date | null;
  } | null;
};

type CRMComputeDimension =
  | "graph"
  | "engagement"
  | "qualification"
  | "buying_intent"
  | "state_graph"
  | "lifecycle"
  | "relationships"
  | "behavior"
  | "value"
  | "segments"
  | "scorecard";

type CRMRefreshRequest = {
  businessId: string;
  leadId: string;
  inputMessage?: string | null;
  salesContext?: SalesAgentContext | null;
  preview?: boolean;
  traceId?: string | null;
  source?: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
};

const CRM_INTELLIGENCE_VERSION = "phase2c";
const CRM_PROFILE_TTL_MS = 60_000;

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeText = (value?: unknown) => String(value || "").trim();

const buildSignalContextFromSalesContext = (
  salesContext?: SalesAgentContext | null
): CRMRefreshSignalContext | null => {
  if (!salesContext) {
    return null;
  }

  return {
    clientAiTone: salesContext.client.aiTone || null,
    salesSignals: {
      intent: salesContext.profile.intent || null,
      intentCategory: salesContext.profile.intentCategory || null,
      emotion: salesContext.profile.emotion || null,
      userSignal: salesContext.profile.userSignal || null,
      temperature: salesContext.profile.temperature || null,
      stage: salesContext.profile.stage || null,
      objection: salesContext.profile.objection.type || null,
      qualificationMissing:
        salesContext.profile.qualification.missingFields || [],
      unansweredQuestionCount: Number(
        salesContext.profile.unansweredQuestionCount || 0
      ),
      planKey: salesContext.planKey || null,
    },
  };
};

const buildQueuedRefreshPayload = ({
  businessId,
  leadId,
  inputMessage,
  traceId,
  source,
  route,
  followupAction,
  decisionAction,
  salesContext,
}: CRMRefreshRequest): CRMRefreshRequestPayload => ({
  businessId,
  leadId,
  inputMessage: inputMessage || null,
  traceId,
  source,
  route,
  followupAction,
  decisionAction,
  signalContext: buildSignalContextFromSalesContext(salesContext),
});

const toJsonRecord = (value: unknown): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
};

const toJsonSafe = (value: unknown) => {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const hoursBetween = (from?: Date | null, to?: Date | null) => {
  if (!from || !to) {
    return null;
  }

  return Math.max(0, (to.getTime() - from.getTime()) / (60 * 60 * 1000));
};

const latestDate = (...values: Array<Date | null | undefined>) =>
  values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const normalizeForHash = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = normalizeForHash((value as Record<string, unknown>)[key]);
      return result;
    }, {});
};

const hashValue = (value: unknown) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(normalizeForHash(value)))
    .digest("hex");

const getRefreshQueueKey = (businessId: string, leadId: string) =>
  `${businessId}:${leadId}`;

const getComputeMeta = (profile?: CRMIntelligenceProfile | null) =>
  profile?.observability?.compute || {
    cacheStatus: "MISS" as const,
    cacheSource: "NONE" as const,
    recomputedDimensions: [] as string[],
    dimensionHashes: {} as Record<string, string>,
    ttlExpiresAt: new Date(Date.now() + CRM_PROFILE_TTL_MS).toISOString(),
  };

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
      const normalizedOutcome = normalizeText(event.outcome).toLowerCase();

      if (normalizedOutcome === "opened") stats.openedCount += 1;
      if (normalizedOutcome === "link_clicked") stats.clickedCount += 1;
      if (normalizedOutcome === "booked_call") stats.bookedCount += 1;
      if (normalizedOutcome === "payment_completed") stats.paymentCount += 1;
      if (normalizedOutcome === "replied") stats.repliedCount += 1;

      stats.total += 1;
      stats.totalValue += Number(event.value || 0);
      stats.lastConversionAt = latestDate(stats.lastConversionAt, event.occurredAt);

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

const buildAppointmentStats = (appointments: CRMAppointmentRecord[], now: Date) => {
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
    nextAppointmentAt: upcoming
      .sort((left, right) => left.startTime.getTime() - right.startTime.getTime())[0]
      ?.startTime || null,
  };
};

const buildRelatedLeadWhere = (lead: {
  businessId: string;
  id: string;
  email?: string | null;
  phone?: string | null;
  instagramId?: string | null;
}) => {
  const or: JsonRecord[] = [];

  if (lead.email) {
    or.push({ email: lead.email });
  }

  if (lead.phone) {
    or.push({ phone: lead.phone });
  }

  if (lead.instagramId) {
    or.push({ instagramId: lead.instagramId });
  }

  if (!or.length) {
    return null;
  }

  return {
    businessId: lead.businessId,
    id: {
      not: lead.id,
    },
    OR: or,
  };
};

const computeEngagementScore = ({
  snapshot,
  graph,
}: {
  snapshot: CRMLeadSignalSnapshot;
  graph: CRMCustomerGraph;
}) => {
  let score = 0;
  const lastTouchHours = hoursBetween(graph.enrichment.lastTouchAt, snapshot.now);

  score += Math.min(snapshot.messageStats.total * 5, 20);
  score += Math.min(snapshot.conversionStats.repliedCount * 6, 12);
  score += snapshot.messageStats.recentQuestionCount > 0 ? 8 : 0;
  score += snapshot.conversionStats.clickedCount > 0 ? 14 : 0;
  score += snapshot.conversionStats.openedCount > 0 ? 6 : 0;
  score += snapshot.appointmentStats.upcomingCount > 0 ? 12 : 0;
  score += snapshot.lead.unreadCount > 0 ? 6 : 0;

  if (lastTouchHours !== null) {
    if (lastTouchHours <= 1) score += 24;
    else if (lastTouchHours <= 24) score += 18;
    else if (lastTouchHours <= 72) score += 12;
    else if (lastTouchHours <= 168) score += 6;
  }

  if (
    snapshot.lead.followupCount >= 2 &&
    lastTouchHours !== null &&
    lastTouchHours > 72
  ) {
    score -= 10;
  }

  if (snapshot.lead.isHumanActive) {
    score -= 4;
  }

  return clampScore(score);
};

const computeQualificationScore = ({
  snapshot,
  graph,
}: {
  snapshot: CRMLeadSignalSnapshot;
  graph: CRMCustomerGraph;
}) => {
  let score = 0;

  if (graph.enrichment.resolvedName) score += 12;
  if (
    graph.enrichment.resolvedEmail ||
    graph.enrichment.resolvedPhone ||
    snapshot.lead.instagramId
  ) {
    score += 18;
  }

  if (graph.enrichment.resolvedNeed) score += 22;
  if (graph.enrichment.resolvedBudget) score += 18;
  if (graph.enrichment.resolvedTimeline) score += 18;
  if (snapshot.memory.facts.filter((fact) => !fact.stale).length >= 3) score += 12;

  const missingCount = snapshot.salesSignals.qualificationMissing.length;
  score += Math.max(0, 12 - missingCount * 4);

  if (snapshot.salesSignals.intentCategory === "buy") {
    score += 8;
  }

  return clampScore(score);
};

const computeBuyingIntentScore = ({
  snapshot,
  graph,
}: {
  snapshot: CRMLeadSignalSnapshot;
  graph: CRMCustomerGraph;
}) => {
  let score = Math.round(Number(snapshot.lead.leadScore || 0) * 0.55);
  const latestMessage = normalizeText(snapshot.inputMessage || snapshot.messageStats.latestUserMessage).toLowerCase();
  const objection = normalizeText(snapshot.salesSignals.objection).toUpperCase();
  const intent = normalizeText(snapshot.salesSignals.intent).toUpperCase();
  const temperature = normalizeText(snapshot.salesSignals.temperature).toUpperCase();

  if (intent === "BOOKING" || intent === "PURCHASE") score += 24;
  else if (intent === "PRICING") score += 16;
  else if (intent === "QUALIFICATION") score += 10;

  if (temperature === "HOT") score += 12;
  if (temperature === "WARM") score += 6;

  if (snapshot.conversionStats.clickedCount > 0) score += 14;
  if (snapshot.conversionStats.bookedCount > 0) score += 22;
  if (snapshot.appointmentStats.upcomingCount > 0) score += 24;
  if (graph.enrichment.resolvedBudget) score += 6;

  if (/today|tomorrow|asap|urgent|immediately|this week/.test(
    normalizeText(graph.enrichment.resolvedTimeline).toLowerCase()
  )) {
    score += 8;
  }

  if (/book|schedule|demo|call|pay|buy|start/.test(latestMessage)) score += 10;
  if (/not interested|later|stop|maybe later|no thanks/.test(latestMessage)) score -= 18;

  if (objection === "PRICE") score += 4;
  if (objection === "TRUST") score += 2;
  if (objection === "LATER") score -= 8;
  if (objection === "NOT_INTERESTED") score -= 25;

  return clampScore(score);
};

const computeCompositeScore = ({
  seeds,
  lifecycle,
  behavior,
  value,
  relationships,
}: {
  seeds: CRMScoreSeeds;
  lifecycle: CRMLifecycleAssessment;
  behavior: CRMBehaviorPrediction;
  value: CRMValuePrediction;
  relationships: CRMRelationshipMap;
}) =>
  clampScore(
    seeds.engagementScore * 0.16 +
      seeds.qualificationScore * 0.16 +
      seeds.buyingIntentScore * 0.18 +
      lifecycle.score * 0.14 +
      behavior.behaviorScore * 0.12 +
      value.valueScore * 0.14 +
      relationships.relationshipScore * 0.1 +
      (100 - value.churnScore) * 0.1
  );

const buildIntelligenceObservability = ({
  profile,
  source = "CRM_INTELLIGENCE",
  route = null,
  followupAction = null,
  decisionAction = null,
}: {
  profile: CRMIntelligenceProfile;
  source?: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
}) => ({
  ...profile,
  observability: {
    ...profile.observability,
    source,
    route,
    followupAction,
    decisionAction,
  },
});

const buildLeadLifecyclePatch = ({
  snapshot,
  profile,
  runtimeInfluence = null,
}: {
  snapshot: CRMLeadSignalSnapshot;
  profile: CRMIntelligenceProfile;
  runtimeInfluence?: Awaited<ReturnType<typeof getIntelligenceRuntimeInfluence>> | null;
}) => {
  const data: Record<string, unknown> = {
    intelligenceUpdatedAt: snapshot.now,
    lastLifecycleAt: snapshot.now,
  };
  const intelligenceLeadScoreDelta = Number(
    runtimeInfluence?.controls.crm.leadScoreDelta || 0
  );

  if (intelligenceLeadScoreDelta !== 0) {
    data.leadScore = clampScore(
      Number(snapshot.lead.leadScore || 0) + intelligenceLeadScoreDelta
    );
  }

  if (!snapshot.lead.name && profile.enrichment.resolvedName) {
    data.name = profile.enrichment.resolvedName;
  }

  if (!snapshot.lead.email && profile.enrichment.resolvedEmail) {
    data.email = profile.enrichment.resolvedEmail;
  }

  if (!snapshot.lead.phone && profile.enrichment.resolvedPhone) {
    data.phone = profile.enrichment.resolvedPhone;
  }

  if (
    profile.graph.enrichment.lastTouchAt &&
    (!snapshot.lead.lastEngagedAt ||
      profile.graph.enrichment.lastTouchAt > snapshot.lead.lastEngagedAt)
  ) {
    data.lastEngagedAt = profile.graph.enrichment.lastTouchAt;
  }

  if (
    profile.stateGraph.booking.lastBookedAt &&
    (!snapshot.lead.lastBookedAt ||
      profile.stateGraph.booking.lastBookedAt > snapshot.lead.lastBookedAt)
  ) {
    data.lastBookedAt = profile.stateGraph.booking.lastBookedAt;
  }

  if (
    profile.stateGraph.conversion.lastConvertedAt &&
    (!snapshot.lead.lastConvertedAt ||
      profile.stateGraph.conversion.lastConvertedAt > snapshot.lead.lastConvertedAt)
  ) {
    data.lastConvertedAt = profile.stateGraph.conversion.lastConvertedAt;
  }

  if (
    profile.stateGraph.conversion.state === "WON" &&
    snapshot.lead.stage !== "WON"
  ) {
    data.stage = "WON";
    data.aiStage = "HOT";
    data.revenueState = "CONVERTED";
  } else if (
    profile.stateGraph.booking.state === "SCHEDULED" &&
    snapshot.lead.stage !== "BOOKED_CALL"
  ) {
    data.stage = "BOOKED_CALL";
    data.aiStage = "HOT";
    data.revenueState = "HOT";
  } else if (
    profile.lifecycle.stage === "OPPORTUNITY" &&
    !["WON", "CLOSED"].includes(normalizeText(snapshot.lead.stage).toUpperCase())
  ) {
    data.stage = "READY_TO_BUY";
    data.aiStage = "HOT";
    data.revenueState = "HOT";
  } else if (
    ["ENGAGED", "QUALIFIED", "NURTURING"].includes(profile.lifecycle.stage) &&
    normalizeText(snapshot.lead.stage).toUpperCase() === "NEW"
  ) {
    data.stage = "INTERESTED";
    data.aiStage = snapshot.lead.aiStage === "HOT" ? "HOT" : "WARM";
    data.revenueState =
      snapshot.lead.revenueState === "HOT" ? "HOT" : "WARM";
  }

  if (
    normalizeText(snapshot.lead.stage).toUpperCase() === "BOOKED_CALL" &&
    profile.stateGraph.booking.state !== "SCHEDULED" &&
    profile.stateGraph.conversion.state !== "WON"
  ) {
    data.stage = profile.lifecycle.nextLeadStage;
    data.aiStage = profile.lifecycle.nextAIStage;
    data.revenueState = profile.lifecycle.nextRevenueState;
  }

  if (runtimeInfluence?.controls.crm.segmentShift === "hot_conversion") {
    data.stage = "READY_TO_BUY";
    data.aiStage = "HOT";
    data.revenueState = "HOT";
  }

  if (
    runtimeInfluence?.controls.crm.segmentShift === "at_risk_recovery" &&
    String(data.stage || snapshot.lead.stage || "").toUpperCase() !== "WON"
  ) {
    data.stage = "INTERESTED";
    data.aiStage = "WARM";
    data.revenueState = "WARM";
  }

  return data;
};

const buildRelationshipRecords = (
  profile: CRMIntelligenceProfile
) =>
  Array.from(
    new Map(
      profile.relationships.edges.map((edge) => [
        `${edge.targetType}:${edge.targetId}`,
        edge,
      ])
    ).values()
  );

const observeLeadIntelligence = async ({
  snapshot,
  profile,
  source,
  route,
  followupAction,
  decisionAction,
}: {
  snapshot: CRMLeadSignalSnapshot;
  profile: CRMIntelligenceProfile;
  source: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
}) => {
  const eventMeta = {
    leadId: snapshot.leadId,
    traceId: snapshot.traceId,
    lifecycleStage: profile.lifecycle.stage,
    lifecycleStatus: profile.lifecycle.status,
    commercialState: profile.stateGraph.commercial.state,
    bookingState: profile.stateGraph.booking.state,
    conversationMode: profile.stateGraph.conversation.mode,
    primarySegment: profile.segments.primarySegment,
    secondarySegment: profile.segments.secondarySegment,
    compositeScore: profile.scorecard.compositeScore,
    engagementScore: profile.scorecard.engagementScore,
    qualificationScore: profile.scorecard.qualificationScore,
    buyingIntentScore: profile.scorecard.buyingIntentScore,
    valueScore: profile.scorecard.valueScore,
    churnScore: profile.scorecard.churnScore,
    churnRisk: profile.value.churnRisk,
    valueTier: profile.value.valueTier,
    predictedBehavior: profile.behavior.predictedBehavior,
    nextBestAction: profile.behavior.nextBestAction,
    relationshipScore: profile.relationships.relationshipScore,
    relationshipHealth: profile.relationships.health,
    relationshipEdges: profile.relationships.edgeCount,
    connectedSystems: profile.graph.connectedSystems,
    source,
    route: route || null,
    followupAction: followupAction || null,
    decisionAction: decisionAction || null,
    preview: snapshot.preview,
  };

  logAIEvent({
    businessId: snapshot.businessId,
    leadId: snapshot.leadId,
    event: "CRM_INTELLIGENCE_PROFILE",
    data: eventMeta,
  });

  logger.info(
    {
      businessId: snapshot.businessId,
      leadId: snapshot.leadId,
      traceId: snapshot.traceId,
      lifecycleStage: profile.lifecycle.stage,
      compositeScore: profile.scorecard.compositeScore,
      nextBestAction: profile.behavior.nextBestAction,
      primarySegment: profile.segments.primarySegment,
    },
    "CRM intelligence profile synced"
  );

  if (snapshot.preview) {
    return;
  }

  await prisma.analytics
    .create({
      data: {
        businessId: snapshot.businessId,
        type: "CRM_INTELLIGENCE_PROFILE",
        meta: toJsonSafe(eventMeta) as any,
      },
    })
    .catch(() => undefined);
};

export const buildLeadIntelligenceSummary = (profile: CRMIntelligenceProfile) => {
  const facts = [
    profile.enrichment.resolvedNeed
      ? `need=${profile.enrichment.resolvedNeed}`
      : null,
    profile.enrichment.resolvedBudget
      ? `budget=${profile.enrichment.resolvedBudget}`
      : null,
    profile.enrichment.resolvedTimeline
      ? `timeline=${profile.enrichment.resolvedTimeline}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  const relationshipAnchors = profile.relationships.edges
    .slice(0, 3)
    .map((edge) => `${edge.targetType}:${edge.relationshipType}`)
    .join(", ");

  return [
    `Lifecycle ${profile.lifecycle.stage}/${profile.lifecycle.status}.`,
    `State ${profile.stateGraph.commercial.state} with ${profile.stateGraph.conversation.mode.toLowerCase()} conversation mode.`,
    `Scores composite ${profile.scorecard.compositeScore}, value ${profile.value.valueScore}, churn ${profile.value.churnScore}.`,
    `Prediction ${profile.behavior.predictedBehavior} -> ${profile.behavior.nextBestAction}.`,
    `Segment ${profile.segments.primarySegment}${profile.segments.secondarySegment ? ` / ${profile.segments.secondarySegment}` : ""}.`,
    relationshipAnchors ? `Relationships ${relationshipAnchors}.` : null,
    facts ? `Enrichment ${facts}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
};

const withComputeMeta = ({
  profile,
  cacheStatus,
  cacheSource,
  recomputedDimensions,
  dimensionHashes,
}: {
  profile: CRMIntelligenceProfile;
  cacheStatus: "MISS" | "HIT" | "REUSED";
  cacheSource: "NONE" | "MEMORY" | "PERSISTED";
  recomputedDimensions: CRMComputeDimension[];
  dimensionHashes: Record<string, string>;
}) => ({
  ...profile,
  observability: {
    ...profile.observability,
    compute: {
      cacheStatus,
      cacheSource,
      recomputedDimensions,
      dimensionHashes,
      ttlExpiresAt: new Date(Date.now() + CRM_PROFILE_TTL_MS).toISOString(),
    },
  },
});

export const buildLeadIntelligenceFromSnapshot = (
  snapshot: CRMLeadSignalSnapshot,
  options?: {
    source?: string;
    previousProfile?: CRMIntelligenceProfile | null;
    cacheStatus?: "MISS" | "HIT" | "REUSED";
    cacheSource?: "NONE" | "MEMORY" | "PERSISTED";
  }
): CRMIntelligenceProfile => {
  void options;

  const recomputedDimensions: CRMComputeDimension[] = [
    "graph",
    "engagement",
    "qualification",
    "buying_intent",
    "state_graph",
    "lifecycle",
    "relationships",
    "behavior",
    "value",
    "segments",
    "scorecard",
  ];

  const graph = buildCustomerGraph(snapshot);
  const seeds: CRMScoreSeeds = {
    engagementScore: computeEngagementScore({
      snapshot,
      graph,
    }),
    qualificationScore: computeQualificationScore({
      snapshot,
      graph,
    }),
    buyingIntentScore: computeBuyingIntentScore({
      snapshot,
      graph,
    }),
  };
  const stateGraph = resolveUnifiedCustomerState({
    snapshot,
    graph,
    seeds,
  });
  const lifecycle = assessLeadLifecycle(snapshot, graph, seeds);
  const relationships = mapLeadRelationships(snapshot, graph, lifecycle, seeds);
  const behavior = predictLeadBehavior(
    snapshot,
    graph,
    lifecycle,
    relationships,
    seeds
  );
  const value = predictLeadValue(
    snapshot,
    graph,
    lifecycle,
    behavior,
    relationships,
    seeds
  );
  const segments = buildLeadSegments(
    snapshot,
    graph,
    lifecycle,
    behavior,
    value,
    relationships,
    seeds
  );
  const scorecard = {
    ...seeds,
    lifecycleScore: lifecycle.score,
    behaviorScore: behavior.behaviorScore,
    valueScore: value.valueScore,
    churnScore: value.churnScore,
    relationshipScore: relationships.relationshipScore,
    compositeScore: computeCompositeScore({
      seeds,
      lifecycle,
      behavior,
      value,
      relationships,
    }),
  } satisfies CRMIntelligenceScorecard;

  return withComputeMeta({
    profile: {
      version: CRM_INTELLIGENCE_VERSION,
      businessId: snapshot.businessId,
      leadId: snapshot.leadId,
      clientId: snapshot.clientId,
      traceId: snapshot.traceId,
      preview: snapshot.preview,
      graph,
      enrichment: graph.enrichment,
      stateGraph,
      lifecycle,
      behavior,
      value,
      segments,
      relationships,
      scorecard,
      observability: {
        connectedSystems: graph.connectedSystems,
        generatedAt: snapshot.now.toISOString(),
        source: options?.source || "CRM_INTELLIGENCE",
        route: null,
        followupAction: null,
        decisionAction: null,
        compute: {
          cacheStatus: "MISS",
          cacheSource: "NONE",
          recomputedDimensions,
          dimensionHashes: {},
          ttlExpiresAt: snapshot.now.toISOString(),
        },
      },
    },
    cacheStatus: "MISS",
    cacheSource: "NONE",
    recomputedDimensions,
    dimensionHashes: {},
  });
};

const toDateOrNull = (value: unknown) => {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hydrateRelationshipEdges = (rows: Array<Record<string, unknown>>) =>
  rows.map((row) => ({
    targetType: String(row.targetType || ""),
    targetId: String(row.targetId || ""),
    targetLabel: typeof row.targetLabel === "string" ? row.targetLabel : null,
    relationshipType: String(row.relationshipType || ""),
    strength: Number(row.strength || 0),
    score: Number(row.score || 0),
    reason:
      typeof row.reason === "string"
        ? row.reason
        : typeof row.relationshipType === "string"
          ? String(row.relationshipType).toLowerCase()
          : "persisted_relationship_edge",
    metadata: toJsonRecord(row.metadata),
    lastObservedAt: toDateOrNull(row.lastObservedAt),
  }));

const hydratePersistedLeadIntelligenceProfile = ({
  leadId,
  businessId,
  profileRecord,
  relationshipRows,
}: {
  leadId: string;
  businessId: string;
  profileRecord: Record<string, any>;
  relationshipRows?: Array<Record<string, unknown>>;
}): CRMIntelligenceProfile | null => {
  const enrichment = toJsonRecord(profileRecord.enrichment);
  const metrics = toJsonRecord(profileRecord.metrics);
  const behavior = toJsonRecord(profileRecord.behavior);
  const valueModel = toJsonRecord(profileRecord.valueModel);
  const lifecycle = toJsonRecord(profileRecord.lifecycle);
  const relationshipMap = toJsonRecord(profileRecord.relationshipMap);
  const graphRecord = toJsonRecord(metrics.graph);
  const stateGraphRecord = toJsonRecord(metrics.stateGraph);
  const computeRecord = toJsonRecord(metrics.compute);

  if (!graphRecord.enrichment || !stateGraphRecord.lifecycle) {
    return null;
  }

  const relationshipEdges =
    Array.isArray(relationshipRows) && relationshipRows.length > 0
      ? hydrateRelationshipEdges(relationshipRows)
      : Array.isArray(relationshipMap.edges)
        ? hydrateRelationshipEdges(
            relationshipMap.edges.filter(
              (edge): edge is Record<string, unknown> =>
                Boolean(edge) && typeof edge === "object" && !Array.isArray(edge)
            )
          )
        : Array.isArray(graphRecord.edges)
          ? hydrateRelationshipEdges(
              graphRecord.edges.filter(
                (edge): edge is Record<string, unknown> =>
                  Boolean(edge) && typeof edge === "object" && !Array.isArray(edge)
              )
            )
        : [];
  const strongestEdge =
    relationshipEdges.sort((left, right) => right.score - left.score)[0] || null;

  return {
    version:
      typeof profileRecord.intelligenceVersion === "string"
        ? profileRecord.intelligenceVersion
        : CRM_INTELLIGENCE_VERSION,
    businessId,
    leadId,
    clientId: typeof profileRecord.clientId === "string" ? profileRecord.clientId : null,
    traceId: null,
    preview: false,
    graph: {
      nodes: Array.isArray(graphRecord.nodes)
        ? graphRecord.nodes.map((node: any) => ({
            key: String(node?.key || ""),
            type: String(node?.type || ""),
            label: String(node?.label || ""),
            weight: Number(node?.weight || 0),
          }))
        : [],
      edges: relationshipEdges,
      connectedSystems: Array.isArray(graphRecord.connectedSystems)
        ? graphRecord.connectedSystems.map((item) => String(item || ""))
        : [],
      profileCompleteness: Number(profileRecord.profileCompleteness || 0),
      identityConfidence: Number(profileRecord.identityConfidence || 0),
      graphHealth: Number(graphRecord.graphHealth || 0),
      enrichment: {
        resolvedName:
          typeof enrichment.resolvedName === "string" ? enrichment.resolvedName : null,
        resolvedEmail:
          typeof enrichment.resolvedEmail === "string" ? enrichment.resolvedEmail : null,
        resolvedPhone:
          typeof enrichment.resolvedPhone === "string" ? enrichment.resolvedPhone : null,
        resolvedBudget:
          typeof enrichment.resolvedBudget === "string" ? enrichment.resolvedBudget : null,
        resolvedTimeline:
          typeof enrichment.resolvedTimeline === "string"
            ? enrichment.resolvedTimeline
            : null,
        resolvedNeed:
          typeof enrichment.resolvedNeed === "string" ? enrichment.resolvedNeed : null,
        profileCompleteness: Number(profileRecord.profileCompleteness || 0),
        identityConfidence: Number(profileRecord.identityConfidence || 0),
        memoryHighlights: Array.isArray(enrichment.memoryHighlights)
          ? enrichment.memoryHighlights.map((item) => String(item || ""))
          : [],
        lastTouchAt: toDateOrNull(enrichment.lastTouchAt),
        firstSeenAt: toDateOrNull(enrichment.firstSeenAt),
      },
      stats: {
        messageCount: Number(toJsonRecord(graphRecord.stats).messageCount || 0),
        memoryFactCount: Number(toJsonRecord(graphRecord.stats).memoryFactCount || 0),
        conversionCount: Number(toJsonRecord(graphRecord.stats).conversionCount || 0),
        followupCount: Number(toJsonRecord(graphRecord.stats).followupCount || 0),
        appointmentCount: Number(toJsonRecord(graphRecord.stats).appointmentCount || 0),
        relatedLeadCount: Number(toJsonRecord(graphRecord.stats).relatedLeadCount || 0),
      },
    },
    enrichment: {
      resolvedName:
        typeof enrichment.resolvedName === "string" ? enrichment.resolvedName : null,
      resolvedEmail:
        typeof enrichment.resolvedEmail === "string" ? enrichment.resolvedEmail : null,
      resolvedPhone:
        typeof enrichment.resolvedPhone === "string" ? enrichment.resolvedPhone : null,
      resolvedBudget:
        typeof enrichment.resolvedBudget === "string" ? enrichment.resolvedBudget : null,
      resolvedTimeline:
        typeof enrichment.resolvedTimeline === "string" ? enrichment.resolvedTimeline : null,
      resolvedNeed:
        typeof enrichment.resolvedNeed === "string" ? enrichment.resolvedNeed : null,
      profileCompleteness: Number(profileRecord.profileCompleteness || 0),
      identityConfidence: Number(profileRecord.identityConfidence || 0),
      memoryHighlights: Array.isArray(enrichment.memoryHighlights)
        ? enrichment.memoryHighlights.map((item) => String(item || ""))
        : [],
      lastTouchAt: toDateOrNull(enrichment.lastTouchAt),
      firstSeenAt: toDateOrNull(enrichment.firstSeenAt),
    },
    stateGraph: {
      conversation: {
        mode: String(toJsonRecord(stateGraphRecord.conversation).mode || "NEW") as any,
        stateName:
          typeof toJsonRecord(stateGraphRecord.conversation).stateName === "string"
            ? String(toJsonRecord(stateGraphRecord.conversation).stateName)
            : null,
        reason: String(toJsonRecord(stateGraphRecord.conversation).reason || "persisted"),
      },
      commercial: {
        state: String(toJsonRecord(stateGraphRecord.commercial).state || "COLD") as CRMCommercialState,
        reason: String(toJsonRecord(stateGraphRecord.commercial).reason || "persisted"),
      },
      booking: {
        state: String(toJsonRecord(stateGraphRecord.booking).state || "UNBOOKED") as any,
        reason: String(toJsonRecord(stateGraphRecord.booking).reason || "persisted"),
        lastBookedAt: toDateOrNull(toJsonRecord(stateGraphRecord.booking).lastBookedAt),
        nextAppointmentAt: toDateOrNull(
          toJsonRecord(stateGraphRecord.booking).nextAppointmentAt
        ),
        hasBookingHistory: Boolean(
          toJsonRecord(stateGraphRecord.booking).hasBookingHistory
        ),
      },
      conversion: {
        state: String(toJsonRecord(stateGraphRecord.conversion).state || "OPEN") as any,
        reason: String(toJsonRecord(stateGraphRecord.conversion).reason || "persisted"),
        lastConvertedAt: toDateOrNull(
          toJsonRecord(stateGraphRecord.conversion).lastConvertedAt
        ),
      },
      lifecycle: {
        stage: String(toJsonRecord(stateGraphRecord.lifecycle).stage || profileRecord.lifecycleStage || "NEW"),
        status: String(
          toJsonRecord(stateGraphRecord.lifecycle).status ||
            profileRecord.lifecycleStatus ||
            "ACTIVE"
        ),
        reason: String(toJsonRecord(stateGraphRecord.lifecycle).reason || "persisted"),
        stale: Boolean(toJsonRecord(stateGraphRecord.lifecycle).stale),
        daysSinceLastTouch:
          typeof toJsonRecord(stateGraphRecord.lifecycle).daysSinceLastTouch === "number"
            ? Number(toJsonRecord(stateGraphRecord.lifecycle).daysSinceLastTouch)
            : null,
      },
      consistency: {
        isConsistent:
          toJsonRecord(stateGraphRecord.consistency).isConsistent !== false,
        issues: Array.isArray(toJsonRecord(stateGraphRecord.consistency).issues)
          ? (toJsonRecord(stateGraphRecord.consistency).issues as unknown[]).map((item) =>
              String(item || "")
            )
          : [],
      },
    },
    lifecycle: {
      stage: String(lifecycle.stage || profileRecord.lifecycleStage || "NEW"),
      status: String(lifecycle.status || profileRecord.lifecycleStatus || "ACTIVE"),
      score: Number(profileRecord.lifecycleScore || 0),
      nextLeadStage: String(lifecycle.nextLeadStage || "NEW"),
      nextRevenueState: String(lifecycle.nextRevenueState || "COLD"),
      nextAIStage: String(lifecycle.nextAIStage || "COLD"),
      reason: String(lifecycle.reason || "persisted"),
      daysSinceLastTouch:
        typeof lifecycle.daysSinceLastTouch === "number"
          ? Number(lifecycle.daysSinceLastTouch)
          : null,
      stale: Boolean(lifecycle.stale),
      lastLifecycleAt: toDateOrNull(profileRecord.lastLifecycleAt || lifecycle.lastLifecycleAt),
    },
    behavior: {
      predictedBehavior: String(behavior.predictedBehavior || profileRecord.predictedBehavior || "NEEDS_NURTURE"),
      nextBestAction: String(behavior.nextBestAction || profileRecord.nextBestAction || "SHARE_VALUE_AND_QUALIFY"),
      behaviorScore: Number(profileRecord.behaviorScore || 0),
      responseLikelihood: Number(behavior.responseLikelihood || 0),
      bookingLikelihood: Number(behavior.bookingLikelihood || 0),
      purchaseLikelihood: Number(behavior.purchaseLikelihood || 0),
      churnLikelihood: Number(behavior.churnLikelihood || 0),
      urgency: String(behavior.urgency || "LOW") as any,
      followupIntensity: String(behavior.followupIntensity || "light") as any,
      reason: String(behavior.reason || "persisted"),
    },
    value: {
      valueScore: Number(profileRecord.valueScore || 0),
      valueTier: String(profileRecord.valueTier || "LOW"),
      churnScore: Number(profileRecord.churnScore || 0),
      churnRisk: String(profileRecord.churnRisk || "LOW"),
      projectedValue: Number(valueModel.projectedValue || 0),
      expansionLikelihood: Number(valueModel.expansionLikelihood || 0),
      reason: String(valueModel.reason || "persisted"),
    },
    segments: {
      primarySegment: String(profileRecord.primarySegment || "early_stage"),
      secondarySegment:
        typeof metrics.secondarySegment === "string" ? String(metrics.secondarySegment) : null,
      segmentKeys: Array.isArray(profileRecord.segmentKeys)
        ? profileRecord.segmentKeys.map((item: unknown) => String(item || ""))
        : [],
      reason: String(metrics.segmentReason || `segment:${profileRecord.primarySegment || "early_stage"}`),
    },
    relationships: {
      relationshipScore: Number(profileRecord.relationshipScore || 0),
      health: String(relationshipMap.health || "FRAGILE"),
      summary: String(profileRecord.relationshipSummary || relationshipMap.summary || "persisted relationship map"),
      edges: relationshipEdges,
      strongestEdge,
      edgeCount: relationshipEdges.length,
    },
    scorecard: {
      engagementScore: Number(profileRecord.engagementScore || 0),
      qualificationScore: Number(profileRecord.qualificationScore || 0),
      buyingIntentScore: Number(profileRecord.buyingIntentScore || 0),
      lifecycleScore: Number(profileRecord.lifecycleScore || 0),
      behaviorScore: Number(profileRecord.behaviorScore || 0),
      valueScore: Number(profileRecord.valueScore || 0),
      churnScore: Number(profileRecord.churnScore || 0),
      relationshipScore: Number(profileRecord.relationshipScore || 0),
      compositeScore: Number(profileRecord.compositeScore || 0),
    },
    observability: {
      connectedSystems: Array.isArray(graphRecord.connectedSystems)
        ? graphRecord.connectedSystems.map((item) => String(item || ""))
        : [],
      generatedAt: toDateOrNull(profileRecord.updatedAt)?.toISOString() || new Date().toISOString(),
      source: "CRM_INTELLIGENCE_PERSISTED",
      route: null,
      followupAction: null,
      decisionAction: null,
      compute: {
        cacheStatus:
          String(computeRecord.cacheStatus || "HIT").toUpperCase() === "REUSED"
            ? "REUSED"
            : String(computeRecord.cacheStatus || "HIT").toUpperCase() === "MISS"
              ? "MISS"
              : "HIT",
        cacheSource:
          String(computeRecord.cacheSource || "PERSISTED").toUpperCase() === "MEMORY"
            ? "MEMORY"
            : String(computeRecord.cacheSource || "PERSISTED").toUpperCase() === "NONE"
              ? "NONE"
              : "PERSISTED",
        recomputedDimensions: Array.isArray(computeRecord.recomputedDimensions)
          ? (computeRecord.recomputedDimensions as unknown[]).map((item) => String(item || ""))
          : [],
        dimensionHashes:
          typeof computeRecord.dimensionHashes === "object" &&
          computeRecord.dimensionHashes &&
          !Array.isArray(computeRecord.dimensionHashes)
            ? Object.fromEntries(
                Object.entries(computeRecord.dimensionHashes as Record<string, unknown>).map(
                  ([key, value]) => [key, String(value || "")]
                )
              )
            : {},
        ttlExpiresAt:
          typeof computeRecord.ttlExpiresAt === "string"
            ? String(computeRecord.ttlExpiresAt)
            : new Date(Date.now() + CRM_PROFILE_TTL_MS).toISOString(),
      },
    },
  };
};

const loadPersistedLeadIntelligenceProfile = async ({
  businessId,
  leadId,
}: {
  businessId: string;
  leadId: string;
}) => {
  const profileRecord = await prisma.leadIntelligenceProfile.findUnique({
    where: {
      leadId,
    },
  });

  if (!profileRecord || profileRecord.businessId !== businessId) {
    return null;
  }

  const relationshipMap = toJsonRecord(profileRecord.relationshipMap);
  const metrics = toJsonRecord(profileRecord.metrics);
  const graphRecord = toJsonRecord(metrics.graph);
  const hasEmbeddedEdges =
    Array.isArray(relationshipMap.edges) || Array.isArray(graphRecord.edges);
  const relationshipRows = hasEmbeddedEdges
    ? []
    : await prisma.customerRelationship.findMany({
        where: {
          businessId,
          leadId,
        },
        orderBy: {
          score: "desc",
        },
      });

  return hydratePersistedLeadIntelligenceProfile({
    businessId,
    leadId,
    profileRecord: profileRecord as any,
    relationshipRows: relationshipRows as any,
  });
};

export const buildLeadIntelligenceSnapshot = async ({
  businessId,
  leadId,
  inputMessage,
  salesContext,
  signalContext,
  preview = false,
  traceId = null,
}: {
  businessId: string;
  leadId: string;
  inputMessage?: string | null;
  salesContext?: SalesAgentContext | null;
  signalContext?: CRMRefreshSignalContext | null;
  preview?: boolean;
  traceId?: string | null;
}): Promise<CRMLeadSignalSnapshot> => {
  const leadRecord = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          industry: true,
          timezone: true,
          website: true,
        },
      },
      client: {
        select: {
          id: true,
          platform: true,
          aiTone: true,
        },
      },
      intelligenceProfile: {
        select: {
          compositeScore: true,
          valueScore: true,
          churnScore: true,
          lifecycleStage: true,
          primarySegment: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!leadRecord || leadRecord.businessId !== businessId) {
    throw new Error("Lead not found for CRM intelligence");
  }

  const now = new Date();
  const resolvedSignalContext =
    signalContext || buildSignalContextFromSalesContext(salesContext);
  const relatedLeadWhere = buildRelatedLeadWhere({
    businessId,
    id: leadRecord.id,
    email: leadRecord.email,
    phone: leadRecord.phone,
    instagramId: leadRecord.instagramId,
  });

  const memoryPromise = salesContext
    ? Promise.resolve({
        facts: salesContext.memory.facts || [],
        summary: salesContext.memory.summary || "",
      })
    : buildMemoryContext(leadId, {
        message: inputMessage || undefined,
        limit: 8,
      }).then((memory) => ({
        facts: memory.facts || [],
        summary: memory.summary || "",
      }));

  const [
    messageRows,
    conversionRows,
    appointmentRows,
    conversationState,
    followupRows,
    relatedLeadRows,
    aiReplyCount,
    followupMessageCount,
    lastTrackedReply,
    memory,
  ] = await Promise.all([
    prisma.message.findMany({
      where: {
        leadId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      select: {
        sender: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    }),
    prisma.conversionEvent.findMany({
      where: {
        leadId,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 12,
      select: {
        outcome: true,
        value: true,
        occurredAt: true,
        source: true,
        metadata: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        leadId,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 6,
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
      },
    }),
    getConversationState(leadId).catch(() => null),
    getSalesFollowupSchedule(leadId).catch(() => []),
    relatedLeadWhere
      ? prisma.lead.findMany({
          where: relatedLeadWhere as any,
          take: 5,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            instagramId: true,
            platform: true,
          },
        })
      : Promise.resolve([]),
    prisma.revenueTouchLedger.count({
      where: {
        leadId,
        messageType: "AI_REPLY",
        deliveryState: {
          in: ["CONFIRMED", "DELIVERED"],
        },
      },
    }),
    prisma.revenueTouchLedger.count({
      where: {
        leadId,
        messageType: "FOLLOWUP",
        deliveryState: {
          in: ["CONFIRMED", "DELIVERED"],
        },
      },
    }),
    prisma.revenueTouchLedger.findFirst({
      where: {
        leadId,
        deliveryState: {
          in: ["CONFIRMED", "DELIVERED"],
        },
      },
      orderBy: [
        {
          confirmedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      select: {
        confirmedAt: true,
        createdAt: true,
      },
    }),
    memoryPromise,
  ]);

  const messages = messageRows.map((message) => ({
    sender: message.sender,
    content: message.content,
    createdAt: message.createdAt,
    metadata: toJsonRecord(message.metadata),
  }));
  const conversions = conversionRows.map((event) => ({
    outcome: event.outcome,
    value: typeof event.value === "number" ? event.value : null,
    occurredAt: event.occurredAt,
    source: event.source || null,
    metadata: toJsonRecord(event.metadata),
  }));
  const appointments = appointmentRows.map((appointment) => ({
    id: appointment.id,
    status: appointment.status,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
  }));
  const followupSchedule = followupRows.map((item) => ({
    step: item.step,
    trigger: item.trigger,
    delayMs: item.delayMs,
    scheduledAt: new Date(now.getTime() + item.delayMs),
  }));

  const messageStats = buildMessageStats(messages);
  const conversionStats = buildConversionStats(conversions);
  const appointmentStats = buildAppointmentStats(appointments, now);
  const normalizedInputMessage =
    normalizeText(inputMessage) || messageStats.latestUserMessage || "";
  const revenueBrainContext = toJsonRecord(conversationState?.context?.revenueBrain);

  return {
    businessId,
    leadId,
    clientId: leadRecord.clientId || null,
    traceId,
    preview,
    now,
    inputMessage: normalizedInputMessage,
    lead: {
      name: leadRecord.name || null,
      email: leadRecord.email || null,
      phone: leadRecord.phone || null,
      instagramId: leadRecord.instagramId || null,
      platform: leadRecord.platform || null,
      stage: leadRecord.stage || null,
      aiStage: leadRecord.aiStage || null,
      revenueState: leadRecord.revenueState || null,
      intent: leadRecord.intent || null,
      leadScore: Number(leadRecord.leadScore || 0),
      unreadCount: Number(leadRecord.unreadCount || 0),
      followupCount: Number(leadRecord.followupCount || 0),
      isHumanActive: Boolean(leadRecord.isHumanActive),
      lastFollowupAt: leadRecord.lastFollowupAt || null,
      lastEngagedAt: leadRecord.lastEngagedAt || null,
      lastClickedAt: leadRecord.lastClickedAt || null,
      lastBookedAt: leadRecord.lastBookedAt || null,
      lastConvertedAt: leadRecord.lastConvertedAt || null,
      lastMessageAt: leadRecord.lastMessageAt || null,
      lastLifecycleAt: leadRecord.lastLifecycleAt || null,
      intelligenceUpdatedAt: leadRecord.intelligenceUpdatedAt || null,
      createdAt: leadRecord.createdAt || null,
    },
    business: {
      name: leadRecord.business?.name || null,
      industry: leadRecord.business?.industry || null,
      timezone: leadRecord.business?.timezone || null,
      website: leadRecord.business?.website || null,
    },
    client: {
      id: leadRecord.client?.id || null,
      platform: leadRecord.client?.platform || null,
      aiTone:
        leadRecord.client?.aiTone ||
        resolvedSignalContext?.clientAiTone ||
        salesContext?.client?.aiTone ||
        null,
    },
    salesSignals: {
      intent:
        resolvedSignalContext?.salesSignals?.intent ||
        salesContext?.profile.intent ||
        leadRecord.intent ||
        null,
      intentCategory:
        resolvedSignalContext?.salesSignals?.intentCategory ||
        salesContext?.profile.intentCategory ||
        null,
      emotion:
        resolvedSignalContext?.salesSignals?.emotion ||
        salesContext?.profile.emotion ||
        null,
      userSignal:
        resolvedSignalContext?.salesSignals?.userSignal ||
        salesContext?.profile.userSignal ||
        null,
      temperature:
        resolvedSignalContext?.salesSignals?.temperature ||
        salesContext?.profile.temperature ||
        leadRecord.aiStage ||
        null,
      stage:
        resolvedSignalContext?.salesSignals?.stage ||
        salesContext?.profile.stage ||
        leadRecord.stage ||
        null,
      objection:
        resolvedSignalContext?.salesSignals?.objection ||
        salesContext?.profile.objection?.type ||
        null,
      qualificationMissing:
        resolvedSignalContext?.salesSignals?.qualificationMissing ||
        salesContext?.profile.qualification?.missingFields ||
        [],
      unansweredQuestionCount:
        Number(
          resolvedSignalContext?.salesSignals?.unansweredQuestionCount ||
            salesContext?.profile.unansweredQuestionCount ||
            0
        ),
      planKey:
        resolvedSignalContext?.salesSignals?.planKey ||
        salesContext?.planKey ||
        null,
    },
    memory: {
      facts: memory.facts,
      summary: memory.summary,
    },
    conversationState: {
      name: conversationState?.state || null,
      context: toJsonRecord(conversationState?.context),
    },
    messages,
    messageStats,
    conversions,
    conversionStats,
    appointments,
    appointmentStats,
    followups: {
      schedule: followupSchedule,
      currentAction:
        typeof revenueBrainContext.followupAction === "string"
          ? revenueBrainContext.followupAction
          : null,
    },
    analytics: {
      aiReplyCount,
      followupMessageCount,
      lastTrackedReplyAt:
        lastTrackedReply?.confirmedAt || lastTrackedReply?.createdAt || null,
    },
    relatedLeads: relatedLeadRows.map((lead) => ({
      id: lead.id,
      name: lead.name || null,
      email: lead.email || null,
      phone: lead.phone || null,
      instagramId: lead.instagramId || null,
      platform: lead.platform || null,
    })),
    existingProfile: leadRecord.intelligenceProfile
      ? {
          compositeScore: leadRecord.intelligenceProfile.compositeScore || 0,
          valueScore: leadRecord.intelligenceProfile.valueScore || 0,
          churnScore: leadRecord.intelligenceProfile.churnScore || 0,
          lifecycleStage:
            leadRecord.intelligenceProfile.lifecycleStage || null,
          primarySegment:
            leadRecord.intelligenceProfile.primarySegment || null,
          updatedAt: leadRecord.intelligenceProfile.updatedAt || null,
        }
      : null,
  };
};

const executeLeadIntelligenceRefresh = async ({
  businessId,
  leadId,
  inputMessage,
  salesContext,
  signalContext,
  preview = false,
  traceId = null,
  source = "CRM_INTELLIGENCE_REFRESH",
  route = null,
  followupAction = null,
  decisionAction = null,
}: CRMRefreshRequest & {
  signalContext?: CRMRefreshSignalContext | null;
}) => {
  const snapshot = await buildLeadIntelligenceSnapshot({
    businessId,
    leadId,
    inputMessage,
    salesContext,
    signalContext,
    preview,
    traceId,
  });
  const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
    source,
  });

  return syncLeadIntelligenceProfile({
    snapshot,
    profile,
    source,
    route,
    followupAction,
    decisionAction,
  });
};

export const processQueuedLeadIntelligenceRefresh = async (
  request: CRMRefreshRequestPayload,
  _version?: number
) => {
  await executeLeadIntelligenceRefresh({
    businessId: request.businessId,
    leadId: request.leadId,
    inputMessage: request.inputMessage || null,
    signalContext: request.signalContext || null,
    preview: false,
    traceId: request.traceId || null,
    source: request.source || "CRM_INTELLIGENCE_REFRESH",
    route: request.route || null,
    followupAction: request.followupAction || null,
    decisionAction: request.decisionAction || null,
  });
};

export const buildLeadIntelligenceProfile = async ({
  businessId,
  leadId,
  inputMessage,
  salesContext,
  preview = false,
  traceId = null,
  source = "CRM_INTELLIGENCE",
}: {
  businessId: string;
  leadId: string;
  inputMessage?: string | null;
  salesContext?: SalesAgentContext | null;
  preview?: boolean;
  traceId?: string | null;
  source?: string;
}) => {
  const snapshot = await buildLeadIntelligenceSnapshot({
    businessId,
    leadId,
    inputMessage,
    salesContext,
    signalContext: buildSignalContextFromSalesContext(salesContext),
    preview,
    traceId,
  });
  const profile = buildLeadIntelligenceFromSnapshot(snapshot, {
    source,
  });

  return profile;
};

export const syncLeadIntelligenceProfile = async ({
  snapshot,
  profile,
  source = "CRM_INTELLIGENCE",
  route = null,
  followupAction = null,
  decisionAction = null,
}: {
  snapshot: CRMLeadSignalSnapshot;
  profile: CRMIntelligenceProfile;
  source?: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
}) => {
  const observedProfile = buildIntelligenceObservability({
    profile,
    source,
    route,
    followupAction,
    decisionAction,
  });

  if (!snapshot.preview) {
    const runtimeInfluence = await getIntelligenceRuntimeInfluence({
      businessId: snapshot.businessId,
      leadId: snapshot.leadId,
      asOf: snapshot.now,
    }).catch(() => null);
    const relationshipEdges = buildRelationshipRecords(observedProfile);
    const leadPatch = buildLeadLifecyclePatch({
      snapshot,
      profile: observedProfile,
      runtimeInfluence,
    });
    const persistedMetrics = toJsonSafe({
      scorecard: observedProfile.scorecard,
      connectedSystems: observedProfile.graph.connectedSystems,
      graphHealth: observedProfile.graph.graphHealth,
      followupIntensity: observedProfile.behavior.followupIntensity,
      expansionLikelihood: observedProfile.value.expansionLikelihood,
      graph: observedProfile.graph,
      stateGraph: observedProfile.stateGraph,
      secondarySegment: observedProfile.segments.secondarySegment,
      segmentReason: observedProfile.segments.reason,
      compute: observedProfile.observability.compute,
    }) as any;
    const relationshipMapData = toJsonSafe({
      health: observedProfile.relationships.health,
      summary: observedProfile.relationships.summary,
      strongestEdge: observedProfile.relationships.strongestEdge,
      edges: observedProfile.relationships.edges,
    }) as any;
    await prisma.$transaction(async (tx) => {
      await tx.leadIntelligenceProfile.upsert({
        where: {
          leadId: snapshot.leadId,
        },
        update: {
          clientId: observedProfile.clientId || null,
          intelligenceVersion: observedProfile.version,
          profileCompleteness: observedProfile.graph.profileCompleteness,
          identityConfidence: observedProfile.graph.identityConfidence,
          relationshipHealth: observedProfile.relationships.relationshipScore,
          engagementScore: observedProfile.scorecard.engagementScore,
          qualificationScore: observedProfile.scorecard.qualificationScore,
          buyingIntentScore: observedProfile.scorecard.buyingIntentScore,
          lifecycleScore: observedProfile.scorecard.lifecycleScore,
          behaviorScore: observedProfile.scorecard.behaviorScore,
          valueScore: observedProfile.scorecard.valueScore,
          churnScore: observedProfile.scorecard.churnScore,
          relationshipScore: observedProfile.scorecard.relationshipScore,
          compositeScore: observedProfile.scorecard.compositeScore,
          lifecycleStage: observedProfile.lifecycle.stage,
          lifecycleStatus: observedProfile.lifecycle.status,
          predictedBehavior: observedProfile.behavior.predictedBehavior,
          nextBestAction: observedProfile.behavior.nextBestAction,
          valueTier: observedProfile.value.valueTier,
          churnRisk: observedProfile.value.churnRisk,
          segmentKeys: observedProfile.segments.segmentKeys,
          primarySegment: observedProfile.segments.primarySegment,
          relationshipSummary: observedProfile.relationships.summary,
          enrichment: toJsonSafe(observedProfile.enrichment) as any,
          metrics: persistedMetrics,
          behavior: toJsonSafe(observedProfile.behavior) as any,
          valueModel: toJsonSafe(observedProfile.value) as any,
          lifecycle: toJsonSafe(observedProfile.lifecycle) as any,
          relationshipMap: relationshipMapData,
          lastLifecycleAt: observedProfile.lifecycle.lastLifecycleAt,
          lastActivityAt: observedProfile.graph.enrichment.lastTouchAt,
          lastSyncedAt: snapshot.now,
        },
        create: {
          businessId: snapshot.businessId,
          leadId: snapshot.leadId,
          clientId: observedProfile.clientId || null,
          intelligenceVersion: observedProfile.version,
          profileCompleteness: observedProfile.graph.profileCompleteness,
          identityConfidence: observedProfile.graph.identityConfidence,
          relationshipHealth: observedProfile.relationships.relationshipScore,
          engagementScore: observedProfile.scorecard.engagementScore,
          qualificationScore: observedProfile.scorecard.qualificationScore,
          buyingIntentScore: observedProfile.scorecard.buyingIntentScore,
          lifecycleScore: observedProfile.scorecard.lifecycleScore,
          behaviorScore: observedProfile.scorecard.behaviorScore,
          valueScore: observedProfile.scorecard.valueScore,
          churnScore: observedProfile.scorecard.churnScore,
          relationshipScore: observedProfile.scorecard.relationshipScore,
          compositeScore: observedProfile.scorecard.compositeScore,
          lifecycleStage: observedProfile.lifecycle.stage,
          lifecycleStatus: observedProfile.lifecycle.status,
          predictedBehavior: observedProfile.behavior.predictedBehavior,
          nextBestAction: observedProfile.behavior.nextBestAction,
          valueTier: observedProfile.value.valueTier,
          churnRisk: observedProfile.value.churnRisk,
          segmentKeys: observedProfile.segments.segmentKeys,
          primarySegment: observedProfile.segments.primarySegment,
          relationshipSummary: observedProfile.relationships.summary,
          enrichment: toJsonSafe(observedProfile.enrichment) as any,
          metrics: persistedMetrics,
          behavior: toJsonSafe(observedProfile.behavior) as any,
          valueModel: toJsonSafe(observedProfile.value) as any,
          lifecycle: toJsonSafe(observedProfile.lifecycle) as any,
          relationshipMap: relationshipMapData,
          lastLifecycleAt: observedProfile.lifecycle.lastLifecycleAt,
          lastActivityAt: observedProfile.graph.enrichment.lastTouchAt,
          lastSyncedAt: snapshot.now,
        },
      });

      await tx.customerRelationship.deleteMany({
        where: {
          leadId: snapshot.leadId,
        },
      });

      if (relationshipEdges.length > 0) {
        await tx.customerRelationship.createMany({
          data: relationshipEdges.map((edge) => ({
            businessId: snapshot.businessId,
            leadId: snapshot.leadId,
            targetType: edge.targetType,
            targetId: edge.targetId,
            targetLabel: edge.targetLabel || null,
            relationshipType: edge.relationshipType,
            strength: edge.strength,
            score: edge.score,
            lifecycleStage: observedProfile.lifecycle.stage,
            metadata: toJsonSafe(edge.metadata || {}) as any,
            lastObservedAt: edge.lastObservedAt || snapshot.now,
          })),
        });
      }

      await tx.lead.update({
        where: {
          id: snapshot.leadId,
        },
        data: leadPatch as any,
      });
    });
  }

  await observeLeadIntelligence({
    snapshot,
    profile: observedProfile,
    source,
    route,
    followupAction,
    decisionAction,
  });

  return observedProfile;
};

export const refreshLeadIntelligenceProfile = async ({
  businessId,
  leadId,
  inputMessage,
  salesContext,
  preview = false,
  traceId = null,
  source = "CRM_INTELLIGENCE_REFRESH",
  route = null,
  followupAction = null,
  decisionAction = null,
}: {
  businessId: string;
  leadId: string;
  inputMessage?: string | null;
  salesContext?: SalesAgentContext | null;
  preview?: boolean;
  traceId?: string | null;
  source?: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
}) => {
  try {
    const signalContext = buildSignalContextFromSalesContext(salesContext);

    if (preview) {
      return await executeLeadIntelligenceRefresh({
        businessId,
        leadId,
        inputMessage,
        salesContext,
        signalContext,
        preview,
        traceId,
        source,
        route,
        followupAction,
        decisionAction,
      });
    }

    const { key, version } = await enqueueCRMRefreshRequest(
      buildQueuedRefreshPayload({
        businessId,
        leadId,
        inputMessage,
        salesContext,
        preview,
        traceId,
        source,
        route,
        followupAction,
        decisionAction,
      })
    );

    await waitForCRMRefreshVersion({
      key,
      version,
    });

    const persistedProfile = await loadPersistedLeadIntelligenceProfile({
      businessId,
      leadId,
    });

    if (!persistedProfile) {
      throw new Error(
        `CRM refresh completed without persisted profile for ${businessId}:${leadId}`
      );
    }

    return persistedProfile;
  } catch (error) {
    logError("CRM intelligence refresh failed", {
      businessId,
      leadId,
      event: "CRM_INTELLIGENCE_FAILED",
      error,
      data: {
        source,
        traceId,
      },
    });

    logger.error(
      {
        businessId,
        leadId,
        traceId,
        error,
      },
      "CRM intelligence refresh failed"
    );

    throw error;
  }
};

export const enqueueLeadIntelligenceRefresh = async ({
  businessId,
  leadId,
  inputMessage,
  salesContext,
  traceId = null,
  source = "CRM_INTELLIGENCE_REFRESH",
  route = null,
  followupAction = null,
  decisionAction = null,
}: {
  businessId: string;
  leadId: string;
  inputMessage?: string | null;
  salesContext?: SalesAgentContext | null;
  traceId?: string | null;
  source?: string;
  route?: string | null;
  followupAction?: string | null;
  decisionAction?: string | null;
}) =>
  enqueueCRMRefreshRequest(
    buildQueuedRefreshPayload({
      businessId,
      leadId,
      inputMessage,
      salesContext,
      traceId,
      source,
      route,
      followupAction,
      decisionAction,
    })
  );

export const __crmIntelligenceTestInternals = {
  hydratePersistedLeadIntelligenceProfile,
};
