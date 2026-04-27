import type { ResolvedPlanContext } from "../feature.service";
import type { CRMIntelligenceProfile } from "../crm/leadIntelligence.service";
import type { RevenueConversionDecision } from "../conversion/conversionScore.service";
import type {
  LeadRevenueState,
  SalesAgentContext,
  SalesAngle,
  SalesCTA,
  SalesDecisionAction,
  SalesDecisionStrategy,
  SalesIntent,
  SalesKnowledgeHit,
  SalesMemoryFact,
  SalesStructuredOutput,
} from "../salesAgent/types";

export type RevenueBrainSource =
  | "QUEUE"
  | "PREVIEW"
  | "API"
  | "FOLLOWUP"
  | "MANUAL"
  | "AUTONOMOUS"
  | "LEGACY_COMPAT";

export type RevenueBrainRoute =
  | "BOOKING"
  | "AUTOMATION"
  | "SALES"
  | "ESCALATE"
  | "NO_REPLY";

export type RevenueBrainToolName =
  | "booking"
  | "followup"
  | "coupon"
  | "escalate"
  | "notifyOwner"
  | "crm";

export type RevenueBrainToolPhase =
  | "before_reply"
  | "after_reply"
  | "deferred";

export type RevenueBrainFollowupAction = "schedule" | "cancel" | "skip";

export type RevenueBrainAIReservation = {
  finalize?: () => Promise<void>;
  release?: () => Promise<void>;
};

export type RevenueBrainInput = {
  businessId: string;
  leadId: string;
  message: string;
  plan?: unknown;
  traceId?: string;
  source?: RevenueBrainSource | string | null;
  preview?: boolean;
  beforeAIReply?: () => Promise<RevenueBrainAIReservation | void>;
};

export type RevenueBrainLeadMemorySnapshot = {
  leadId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  platform: string | null;
  stage: string | null;
  aiStage: string | null;
  revenueState: LeadRevenueState | string | null;
  intent: string | null;
  leadScore: number;
  isHumanActive: boolean;
  followupCount: number;
  facts: SalesMemoryFact[];
};

export type RevenueBrainConversationMemorySnapshot = {
  summary: string;
  recentConversation: Array<{
    role: "assistant" | "user";
    content: string;
  }>;
  messageCount: number;
  lastUserMessage: string | null;
  lastAssistantMessage: string | null;
};

export type RevenueBrainSemanticMemorySnapshot = {
  clientId: string | null;
  knowledgeHits: string[];
  hits: SalesKnowledgeHit[];
  optimizationGuidance: string;
  recommendedAngle: SalesAngle | null;
  recommendedCTA: SalesCTA | null;
  recommendedTone: string | null;
  recommendedMessageLength: string | null;
};

export type RevenueBrainContext = {
  traceId: string;
  businessId: string;
  leadId: string;
  inputMessage: string;
  preview: boolean;
  source: RevenueBrainSource;
  planContext: ResolvedPlanContext;
  salesContext: SalesAgentContext;
  leadMemory: RevenueBrainLeadMemorySnapshot;
  conversationMemory: RevenueBrainConversationMemorySnapshot;
  semanticMemory: RevenueBrainSemanticMemorySnapshot;
  crmIntelligence: CRMIntelligenceProfile;
};

export type RevenueBrainIntentResult = {
  intent: SalesIntent;
  confidence: number;
  decisionIntent: string;
  objection: string;
  temperature: string;
  stage: string;
  userSignal: string;
};

export type RevenueBrainStateResult = {
  currentState: LeadRevenueState;
  nextState: LeadRevenueState;
  allowedTransitions: LeadRevenueState[];
  transitionReason: string;
  stage: string;
  aiStage: string;
  directive: string;
  conversationStateName: string | null;
  shouldReply: boolean;
};

export type RevenueBrainToolPlan = {
  name: RevenueBrainToolName;
  phase: RevenueBrainToolPhase;
  reason: string;
};

export type RevenueBrainDecision = {
  route: RevenueBrainRoute;
  salesDecision: SalesDecisionAction | null;
  conversion: RevenueConversionDecision | null;
  reasoning: string[];
  couponRequested: boolean;
  toolPlan: RevenueBrainToolPlan[];
};

export type RevenueBrainFinalResolvedDecision = {
  route: RevenueBrainRoute;
  action: string | null;
  cta: SalesCTA | null;
  priority: number | null;
  tone: string | null;
  metadata: {
    source: RevenueBrainRoute | "SYSTEM";
    strategy: SalesDecisionStrategy | null;
    structure: string | null;
    ctaStyle: string | null;
    messageLength: string | null;
    variantId: string | null;
    variantKey: string | null;
    learningArmKey: string | null;
    conversionScore: number | null;
    conversionBucket: string | null;
    objectionPath: string[];
    trustLevel: string | null;
    trustInjectionType: string | null;
    urgencyLevel: string | null;
    urgencyReason: string | null;
    negotiationMode: string | null;
    offerType: string | null;
    closeMotion: string | null;
    experimentArm: string | null;
    experimentVariantId: string | null;
    experimentVariantKey: string | null;
    ethicsApproved: boolean | null;
    ethicsBlockedPatterns: string[];
    ethicsFallbackApplied: boolean | null;
    ethicsFallbackReason: string | null;
    reasoning: string[];
    toolPlan: RevenueBrainToolPlan[];
  };
};

export type RevenueBrainDeterministicPlanSnapshot = {
  version: "phase3b";
  traceId: string;
  businessId: string;
  leadId: string;
  clientId: string | null;
  source: RevenueBrainSource;
  preview: boolean;
  inputMessage: string;
  planKey: string;
  route: RevenueBrainRoute;
  action: string | null;
  cta: SalesCTA | null;
  priority: number | null;
  tone: string | null;
  reasoning: string[];
  toolPlan: RevenueBrainToolPlan[];
  state: {
    currentState: LeadRevenueState;
    nextState: LeadRevenueState;
    stage: string;
    aiStage: string;
    transitionReason: string;
    conversationStateName: string | null;
    shouldReply: boolean;
  };
  intent: {
    intent: SalesIntent;
    confidence: number;
    decisionIntent: string;
    objection: string;
    temperature: string;
    stage: string;
    userSignal: string;
  };
  reply: {
    generated: boolean;
    message: string | null;
    cta: SalesCTA | null;
    angle: SalesAngle | null;
    reason: string | null;
    confidence: number | null;
    source: RevenueBrainRoute | "SYSTEM" | null;
  };
  resolvedDecision: RevenueBrainFinalResolvedDecision;
  context: {
    leadState: LeadRevenueState;
    nextLeadState: string | null;
    actionPriority: number | null;
    funnelPosition: string | null;
    emotion: string | null;
    knowledgeHitIds: string[];
    knowledgeSources: string[];
    memoryFactCount: number;
    freshMemoryFactCount: number;
    crmCompositeScore: number | null;
    crmValueTier: string | null;
    crmChurnRisk: string | null;
    crmLifecycleStage: string | null;
    crmPrimarySegment: string | null;
  };
};

export type RevenueBrainResponsePayload = {
  message: string;
  intent: "price" | "info" | "booking" | "support" | "other";
  stage:
    | "DISCOVERY"
    | "QUALIFIED"
    | "PITCH"
    | "OBJECTION"
    | "BOOKING"
    | "CLOSED";
  leadType: "LOW" | "MEDIUM" | "HIGH";
  cta: "book" | "ask_more" | "none";
  confidence: number;
  reason: string;
};

export type RevenueBrainReply = {
  message: string;
  cta: SalesCTA;
  angle: SalesAngle;
  reason: string;
  confidence: number;
  structured: SalesStructuredOutput;
  source: RevenueBrainRoute | "SYSTEM";
  latencyMs: number;
  traceId: string;
  meta: Record<string, unknown>;
};

export type RevenueBrainBookingToolResult = {
  handled: boolean;
  message: string | null;
  cta: SalesCTA | null;
  angle: SalesAngle | null;
  reason: string;
};

export type RevenueBrainFollowupDirective = {
  action: RevenueBrainFollowupAction;
  trigger: string | null;
  reason: string;
};

export type RevenueBrainCouponResult = {
  mentioned: boolean;
  code: string | null;
  valid: boolean | null;
  couponId: string | null;
  reason: string;
};

export type RevenueBrainEscalationResult = {
  requested: boolean;
  activated: boolean;
  reason: string;
  responseMessage: string;
};

export type RevenueBrainNotifyOwnerResult = {
  notified: boolean;
  reason: string;
};

export type RevenueBrainCRMResult = {
  synced: boolean;
  reason: string;
  lifecycleStage?: string | null;
  primarySegment?: string | null;
  compositeScore?: number | null;
};

export type RevenueBrainToolArtifacts = {
  booking?: RevenueBrainBookingToolResult;
  followup?: RevenueBrainFollowupDirective;
  coupon?: RevenueBrainCouponResult;
  escalation?: RevenueBrainEscalationResult;
  notifyOwner?: RevenueBrainNotifyOwnerResult;
  crm?: RevenueBrainCRMResult;
};

export type RevenueBrainToolExecution = {
  name: RevenueBrainToolName;
  phase: RevenueBrainToolPhase;
  status: "applied" | "skipped" | "failed";
  payload?: Record<string, unknown>;
  error?: string | null;
};

export type RevenueBrainExecutionSnapshot = {
  traceId: string;
  startedAt: number;
  completedAt: number;
  input: RevenueBrainInput;
  context: RevenueBrainContext;
  intent: RevenueBrainIntentResult;
  state: RevenueBrainStateResult;
  decision: RevenueBrainDecision;
  route: RevenueBrainRoute;
  reply: RevenueBrainReply | null;
  toolPlan: RevenueBrainToolPlan[];
  tools: RevenueBrainToolExecution[];
  artifacts: RevenueBrainToolArtifacts;
  finalResolvedDecision: RevenueBrainFinalResolvedDecision;
  deterministicPlanSnapshot: RevenueBrainDeterministicPlanSnapshot;
};

export type RevenueBrainDeliveryConfirmedEvent = {
  traceId: string;
  businessId: string;
  leadId: string;
  messageId: string;
  reply: RevenueBrainReply;
  route: RevenueBrainRoute;
  source: RevenueBrainSource;
  planSnapshot: RevenueBrainDeterministicPlanSnapshot | null;
  delivery: {
    mode: "platform" | "local_preview" | "local_only";
    platform: string | null;
    confirmedAt: number;
    deliveryJobKey: string | null;
    preview: boolean;
    simulation: boolean;
    sandbox: boolean;
    production: boolean;
  };
};

export type RevenueBrainDeliveryFailedEvent = {
  traceId: string;
  businessId: string;
  leadId: string;
  reply: RevenueBrainReply | null;
  route: RevenueBrainRoute;
  source: RevenueBrainSource;
  planSnapshot: RevenueBrainDeterministicPlanSnapshot | null;
  delivery: {
    mode: "platform" | "local_preview" | "local_only";
    platform: string | null;
    deliveryJobKey: string | null;
    failedAt: number;
    preview: boolean;
    simulation: boolean;
    sandbox: boolean;
    production: boolean;
  };
  failure: {
    stage: "generation" | "transport" | "persistence" | "tracking";
    reason: string;
    retriable: boolean;
    currentAttempt: number;
    maxAttempts: number;
    willRetry: boolean;
    terminal: boolean;
  };
};
