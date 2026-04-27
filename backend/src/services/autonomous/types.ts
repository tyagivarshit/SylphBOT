import type { CRMIntelligenceProfile } from "../crm/leadIntelligence.service";

export type AutonomousEngine =
  | "lead_revival"
  | "winback"
  | "expansion"
  | "retention"
  | "referral";

export type AutonomousOpportunityStatus =
  | "PENDING"
  | "BLOCKED"
  | "QUEUED"
  | "DISPATCHED"
  | "FAILED";

export type AutonomousCampaignStatus =
  | "QUEUED"
  | "DISPATCHED"
  | "BLOCKED"
  | "FAILED";

export type AutonomousPriority = "low" | "medium" | "high";

export type AutonomousRecentMessage = {
  id?: string;
  sender: string;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown> | null;
};

export type AutonomousConversionRecord = {
  outcome: string;
  value: number | null;
  occurredAt: Date;
};

export type AutonomousAppointmentRecord = {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date;
};

export type AutonomousCampaignHistory = {
  id?: string;
  engine: AutonomousEngine | string;
  status: AutonomousCampaignStatus | string;
  createdAt: Date;
  queuedAt?: Date | null;
  dispatchedAt?: Date | null;
  blockedAt?: Date | null;
  failedAt?: Date | null;
};

export type AutonomousLeadSnapshot = {
  businessId: string;
  leadId: string;
  now: Date;
  business: {
    name: string | null;
    timezone: string | null;
    industry: string | null;
  };
  lead: {
    id: string;
    name: string | null;
    platform: string | null;
    phone: string | null;
    instagramId: string | null;
    email: string | null;
    stage: string | null;
    aiStage: string | null;
    revenueState: string | null;
    isHumanActive: boolean;
    followupCount: number;
    lastFollowupAt: Date | null;
    lastEngagedAt: Date | null;
    lastClickedAt: Date | null;
    lastBookedAt: Date | null;
    lastConvertedAt: Date | null;
    lastMessageAt: Date | null;
    createdAt: Date | null;
  };
  client: {
    id: string | null;
    platform: string | null;
    aiTone: string | null;
    phoneNumberId: string | null;
    pageId: string | null;
    accessTokenEncrypted: string | null;
  } | null;
  profile: CRMIntelligenceProfile;
  recentMessages: AutonomousRecentMessage[];
  conversions: AutonomousConversionRecord[];
  appointments: AutonomousAppointmentRecord[];
  recentCampaigns: AutonomousCampaignHistory[];
};

export type AutonomousOpportunityCandidate = {
  engine: AutonomousEngine;
  title: string;
  objective: string;
  summary: string;
  reason: string;
  score: number;
  priority: AutonomousPriority;
  prompt: string;
  tags: string[];
  metadata?: Record<string, unknown>;
};

export type AutonomousGuardrailDecision = {
  allowed: boolean;
  blockedReasons: string[];
  nextEligibleAt: string | null;
  quietHoursActive: boolean;
  recentAutonomousContacts: number;
  recentOutboundMessages: number;
  lastAutonomousAt: string | null;
  lastOutboundAt: string | null;
};

export type AutonomousOpportunityEvaluation = {
  candidate: AutonomousOpportunityCandidate;
  guardrail: AutonomousGuardrailDecision;
};

export type AutonomousSchedulerLeadResult = {
  leadId: string;
  engine: AutonomousEngine | null;
  status: AutonomousOpportunityStatus | "SKIPPED";
  score: number;
  blockedReasons: string[];
};

export type AutonomousDashboardData = {
  generatedAt: string;
  summary: {
    pending: number;
    queued: number;
    dispatchedToday: number;
    blocked: number;
    avgScore: number;
  };
  engines: Array<{
    engine: AutonomousEngine;
    pending: number;
    queued: number;
    blocked: number;
    dispatchedToday: number;
  }>;
  opportunities: Array<{
    leadId: string;
    leadName: string | null;
    engine: AutonomousEngine | string;
    status: string;
    score: number;
    priority: string;
    title: string;
    objective: string;
    summary: string;
    blockedReasons: string[];
    recommendedAt: string;
    nextEligibleAt: string | null;
    updatedAt: string;
  }>;
  campaigns: Array<{
    id: string;
    leadId: string;
    leadName: string | null;
    engine: AutonomousEngine | string;
    status: string;
    title: string;
    objective: string;
    queuedAt: string | null;
    dispatchedAt: string | null;
    failedAt: string | null;
    createdAt: string;
  }>;
  observability: {
    lastSchedulerRunAt: string | null;
    recentEvents: Array<{
      id: string;
      type: string;
      leadId: string | null;
      createdAt: string;
      meta: Record<string, unknown>;
    }>;
    blockedReasons: Array<{
      reason: string;
      count: number;
    }>;
  };
};
