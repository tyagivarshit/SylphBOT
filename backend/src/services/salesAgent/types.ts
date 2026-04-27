import type { PlanType } from "../../config/plan.config";

export type SalesPlanKey = PlanType;

export type SalesLeadTemperature = "COLD" | "WARM" | "HOT";

export type LeadRevenueState = "COLD" | "WARM" | "HOT" | "CONVERTED";

export type SalesDecisionIntent = "buy" | "explore" | "doubt" | "ignore";

export type SalesEmotion = "curious" | "skeptical" | "urgent" | "cold";

export type SalesDecisionStrategy =
  | "ENGAGEMENT"
  | "BALANCED"
  | "CONVERSION";

export type SalesIntent =
  | "GREETING"
  | "ENGAGEMENT"
  | "PRICING"
  | "QUALIFICATION"
  | "BOOKING"
  | "PURCHASE"
  | "OBJECTION"
  | "FOLLOW_UP"
  | "GENERAL";

export type SalesObjectionType =
  | "PRICE"
  | "TRUST"
  | "TIME"
  | "LATER"
  | "NOT_INTERESTED"
  | "NONE";

export type SalesCTA =
  | "REPLY_DM"
  | "VIEW_DEMO"
  | "BOOK_CALL"
  | "BUY_NOW"
  | "CAPTURE_LEAD"
  | "NONE";

export type SalesResponseIntent =
  | "price"
  | "info"
  | "booking"
  | "support"
  | "other";

export type SalesResponseStage =
  | "DISCOVERY"
  | "QUALIFIED"
  | "PITCH"
  | "OBJECTION"
  | "BOOKING"
  | "CLOSED";

export type SalesResponseLeadType = "LOW" | "MEDIUM" | "HIGH";

export type SalesResponseCTA = "book" | "ask_more" | "none";

export type SalesAngle =
  | "curiosity"
  | "urgency"
  | "social_proof"
  | "personalization"
  | "value";

export type SalesActionType =
  | "SHOW_PRICING"
  | "SUGGEST_PLAN"
  | "PUSH_CTA"
  | "CLOSE"
  | "BOOK"
  | "HANDLE_OBJECTION"
  | "QUALIFY"
  | "ENGAGE";

export type SalesUserSignal =
  | "yes"
  | "no"
  | "hesitation"
  | "question"
  | "neutral";

export type SalesFollowupTrigger =
  | "no_reply"
  | "opened_not_responded"
  | "clicked_not_booked";

export type SalesFollowupStepKey =
  | "1h"
  | "24h"
  | "48h"
  | "NO_REPLY_1H"
  | "NO_REPLY_24H"
  | "NO_REPLY_48H"
  | "OPENED_NO_RESPONSE"
  | "CLICKED_NOT_BOOKED";

export type SalesMessageVariantContext = {
  id: string;
  variantKey: string;
  label: string;
  tone: string;
  ctaStyle: string;
  messageLength: string;
  structure?: string;
  instructions: string;
  weight: number;
  isPromoted: boolean;
};

export type SalesPerformanceStat = {
  key: string;
  messages: number;
  replies: number;
  conversions: number;
  replyRate: number;
  conversionRate: number;
  revenue: number;
  revenuePerMessage: number;
};

export type SalesVariantPerformanceStat = SalesPerformanceStat & {
  variantId?: string | null;
  variantKey: string;
  label?: string | null;
  tone?: string | null;
  ctaStyle?: string | null;
  messageLength?: string | null;
  structure?: string | null;
  isPromoted?: boolean;
  weight?: number;
};

export type SalesRevenueMessageStat = {
  messageId: string;
  preview: string;
  cta?: string | null;
  angle?: string | null;
  leadState?: string | null;
  variantId?: string | null;
  variantKey?: string | null;
  variantLabel?: string | null;
  tone?: string | null;
  structure?: string | null;
  conversions: number;
  revenue: number;
  outcomes: Record<string, number>;
  sentAt: Date;
};

export type SalesPerformanceAggregate = {
  messages: number;
  replies: number;
  conversions: number;
  replyRate: number;
  conversionRate: number;
  engagementRate: number;
  revenue: number;
  revenuePerMessage: number;
  ctaStats: SalesPerformanceStat[];
  toneStats: SalesPerformanceStat[];
  structureStats: SalesPerformanceStat[];
  variantStats: SalesVariantPerformanceStat[];
  topRevenueMessages: SalesRevenueMessageStat[];
  worstPerformingMessages: SalesRevenueMessageStat[];
};

export type SalesPerformanceSnapshot = {
  scopeApplied: "state" | "client" | "business";
  overall: SalesPerformanceAggregate;
  active: SalesPerformanceAggregate;
  byState: Record<LeadRevenueState, SalesPerformanceAggregate>;
  revenueByVariant: Array<{
    key: string;
    revenue: number;
    messages: number;
    revenuePerMessage: number;
  }>;
  revenueByFunnelStage: Array<{
    state: LeadRevenueState;
    revenue: number;
    messages: number;
    revenuePerMessage: number;
  }>;
};

export type SalesCapabilityProfile = {
  planKey: SalesPlanKey;
  label: string;
  intelligenceTier: 0 | 1 | 2 | 3;
  maxQualificationQuestions: number;
  supportBooking: boolean;
  supportPaymentLinks: boolean;
  enableFollowups: boolean;
  enableCRM: boolean;
  responseStyle: "engage" | "closer" | "autonomous";
  primaryCtas: SalesCTA[];
  systemDirective: string;
  qualificationTargets: string[];
};

export type SalesQualificationState = {
  need?: string | null;
  budget?: string | null;
  timeline?: string | null;
  intentSignal?: string | null;
  missingFields: string[];
};

export type SalesMemoryFact = {
  id?: string | null;
  key: string;
  value: string;
  confidence: number;
  decayedConfidence: number;
  stale: boolean;
  source?: string | null;
  lastObservedAt?: Date | null;
  updatedAt?: Date | null;
  createdAt?: Date | null;
  ageDays: number;
};

export type SalesKnowledgeHit = {
  id: string;
  content: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
  sourceType: string;
  priority: string;
  clientId?: string | null;
  reinforcementScore: number;
  retrievalCount: number;
  successCount: number;
  lastRetrievedAt?: Date | null;
  lastReinforcedAt?: Date | null;
  createdAt?: Date | null;
};

export type SalesIntentDirective = {
  primaryGoal: string;
  responseRule: string;
  cta: SalesCTA;
  angle: SalesAngle;
  proofCue?: string | null;
  qualificationCue?: string | null;
};

export type SalesProgressionState = {
  funnelPosition: string;
  currentAction: SalesActionType;
  actionPriority: number;
  pricingStep: 0 | 1 | 2 | 3 | 4;
  hasShownPricing: boolean;
  hasSuggestedPlan: boolean;
  hasPushedCTA: boolean;
  hasClosed: boolean;
  loopDetected: boolean;
  repeatedIntentCount: number;
  repeatedReplyCount: number;
  previousIntent?: SalesIntent | null;
  previousCTA?: SalesCTA | null;
  lastAction?: SalesActionType | null;
  lastReply?: string | null;
  lastReplyNormalized?: string | null;
  lastConversationSummary?: string | null;
  userSignal: SalesUserSignal;
  shouldAdvance: boolean;
};

export type SalesObjectionProfile = {
  type: SalesObjectionType;
  label: string;
  strategy: string;
};

export type SalesOptimizationInsights = {
  recommendedAngle: SalesAngle;
  recommendedCTA: SalesCTA;
  recommendedTone?: string | null;
  recommendedCTAStyle?: string | null;
  recommendedMessageLength?: string | null;
  topPatterns?: string[];
  bestMessages?: SalesRevenueMessageStat[];
  worstMessages?: SalesRevenueMessageStat[];
  confidence?: number;
  bestAngles: Array<{ angle: SalesAngle; usage: number; conversions: number }>;
  bestCtas: Array<{ cta: SalesCTA; usage: number; conversions: number }>;
  guidance: string;
};

export type SalesLeadProfile = {
  leadScore: number;
  scoreDelta: number;
  temperature: SalesLeadTemperature;
  leadType: "cold" | "warm" | "hot";
  stage: string;
  intent: SalesIntent;
  intentCategory: SalesDecisionIntent;
  emotion: SalesEmotion;
  userSignal: SalesUserSignal;
  objection: SalesObjectionProfile;
  qualification: SalesQualificationState;
  intentDirective: SalesIntentDirective;
  unansweredQuestionCount: number;
};

export type SalesDecisionAction = {
  action: SalesActionType;
  priority: number;
  strategy: SalesDecisionStrategy;
  leadState: LeadRevenueState;
  intent: SalesDecisionIntent;
  emotion: SalesEmotion;
  variant: SalesMessageVariantContext | null;
  cta: SalesCTA;
  tone: string;
  structure: string;
  ctaStyle: string;
  messageLength: string;
  replyRate: number;
  conversionRate: number;
  revenuePerMessage: number;
  topPatterns: string[];
  guidance: string;
  reasoning: string[];
};

export type SalesAgentContext = {
  businessId: string;
  leadId: string;
  inboundMessage: string;
  planKey: SalesPlanKey;
  capabilities: SalesCapabilityProfile;
  business: {
    name?: string | null;
    industry?: string | null;
    website?: string | null;
    timezone?: string | null;
  };
  client: {
    id?: string | null;
    aiTone?: string | null;
    businessInfo?: string | null;
    pricingInfo?: string | null;
    faqKnowledge?: string | null;
    salesInstructions?: string | null;
  };
  lead: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    platform?: string | null;
    stage?: string | null;
    aiStage?: string | null;
    revenueState?: LeadRevenueState | string | null;
    leadScore?: number | null;
    intent?: string | null;
    lastMessageAt?: Date | null;
    followupCount?: number | null;
  };
  memory: {
    summary: string;
    memory: string;
    conversation: Array<{ role: "assistant" | "user"; content: string }>;
    facts: SalesMemoryFact[];
  };
  knowledge: string[];
  knowledgeHits: SalesKnowledgeHit[];
  profile: SalesLeadProfile;
  progression: SalesProgressionState;
  optimization: SalesOptimizationInsights;
  leadState: {
    state: LeadRevenueState;
    directive: string;
    reason?: string | null;
  };
  decision?: SalesDecisionAction | null;
  variant?: SalesMessageVariantContext | null;
};

export type SalesStructuredOutput = {
  message: string;
  intent: SalesResponseIntent;
  stage: SalesResponseStage;
  leadType: SalesResponseLeadType;
  cta: SalesResponseCTA;
  confidence: number;
  reason: string;
};

export type SalesAgentReply = {
  message: string;
  cta: SalesCTA;
  angle: SalesAngle;
  reason?: string | null;
  confidence?: number;
  structured?: SalesStructuredOutput;
  meta?: Record<string, unknown>;
};
