import crypto from "crypto";

export type JsonRecord = Record<string, unknown>;

export const CANONICAL_INBOUND_CHANNELS = [
  "WHATSAPP",
  "INSTAGRAM",
  "EMAIL",
  "FORM",
  "VOICE",
] as const;

export type CanonicalInboundChannel = (typeof CANONICAL_INBOUND_CHANNELS)[number];

export const CANONICAL_INTERACTION_TYPES = [
  "MESSAGE",
  "CALL",
  "EMAIL",
  "FORM",
  "COMMENT",
  "REVIEW",
  "DM",
] as const;

export type CanonicalInteractionType =
  (typeof CANONICAL_INTERACTION_TYPES)[number];

export const INBOX_ROUTE_TARGETS = [
  "REVENUE_BRAIN",
  "SUPPORT",
  "APPOINTMENTS",
  "BILLING",
  "OWNER",
  "HUMAN_QUEUE",
  "SPAM_BIN",
  "ESCALATION",
] as const;

export type InboxRouteTarget = (typeof INBOX_ROUTE_TARGETS)[number];

export const INBOUND_LIFECYCLE_STATES = [
  "RECEIVED",
  "NORMALIZED",
  "CLASSIFIED",
  "ROUTED",
  "IN_PROGRESS",
  "RESOLVED",
  "REOPENED",
  "CLOSED",
  "FAILED",
] as const;

export type InboundLifecycleState =
  (typeof INBOUND_LIFECYCLE_STATES)[number];

export const PRIORITY_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const HUMAN_QUEUE_STATES = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
] as const;

export type HumanWorkQueueState = (typeof HUMAN_QUEUE_STATES)[number];

export const INTERACTION_STATE_ORDER: Record<InboundLifecycleState, number> = {
  RECEIVED: 0,
  NORMALIZED: 1,
  CLASSIFIED: 2,
  ROUTED: 3,
  IN_PROGRESS: 4,
  RESOLVED: 5,
  REOPENED: 6,
  CLOSED: 7,
  FAILED: 8,
};

export const ALLOWED_INTERACTION_STATE_TRANSITIONS: Record<
  InboundLifecycleState,
  InboundLifecycleState[]
> = {
  RECEIVED: ["NORMALIZED", "FAILED"],
  NORMALIZED: ["CLASSIFIED", "FAILED"],
  CLASSIFIED: ["ROUTED", "FAILED"],
  ROUTED: ["IN_PROGRESS", "FAILED"],
  IN_PROGRESS: ["RESOLVED", "FAILED"],
  RESOLVED: ["REOPENED", "CLOSED", "FAILED"],
  REOPENED: ["IN_PROGRESS", "FAILED"],
  CLOSED: [],
  FAILED: [],
};

export type CanonicalInboundAttachment = {
  kind: string;
  url: string | null;
  mimeType: string | null;
  name: string | null;
  sizeBytes: number | null;
  metadata?: JsonRecord | null;
};

export type CanonicalSenderIdentity = {
  externalId: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  handle: string | null;
};

export type CanonicalInboundEnvelope = {
  channel: CanonicalInboundChannel;
  sender: CanonicalSenderIdentity;
  message: string | null;
  attachments: CanonicalInboundAttachment[];
  language: string | null;
  rawIntentHint: string | null;
  receivedAt: string;
  providerMessageId: string | null;
  threadId: string | null;
  metadata: JsonRecord;
};

export type CRMIntelligenceReference = {
  profileId?: string | null;
  lifecycleStage?: string | null;
  compositeScore?: number | null;
  valueScore?: number | null;
  churnRisk?: string | null;
  valueTier?: string | null;
  projectedValue?: number | null;
  vipScore?: number | null;
};

export type ConsentReference = {
  status: "GRANTED" | "REVOKED" | "UNKNOWN";
  channel?: string | null;
  scope?: string | null;
  recordId?: string | null;
  effectiveAt?: Date | null;
};

export type LeadControlReference = {
  cancelTokenVersion: number;
  isHumanControlActive: boolean;
  manualSuppressUntil?: Date | null;
};

export type RevenueTouchReference = {
  touchLedgerId?: string | null;
  channel?: string | null;
  deliveryState?: string | null;
  lastOutboundAt?: Date | null;
};

export type ReceptionContextReferences = {
  crmProfile?: CRMIntelligenceReference | null;
  consent?: ConsentReference | null;
  leadControl?: LeadControlReference | null;
  latestTouch?: RevenueTouchReference | null;
};

export type InboundInteractionAuthorityRecord = {
  id: string;
  businessId: string;
  leadId: string;
  clientId: string | null;
  channel: CanonicalInboundChannel;
  providerMessageId: string | null;
  externalInteractionKey: string;
  interactionType: CanonicalInteractionType;
  direction: "INBOUND";
  payload: unknown;
  normalizedPayload: unknown | null;
  fingerprint: string | null;
  lifecycleState: InboundLifecycleState;
  intentClass: string | null;
  urgencyClass: string | null;
  sentimentClass: string | null;
  spamScore: number;
  priorityScore: number;
  priorityLevel: PriorityLevel | null;
  routeDecision: InboxRouteTarget | null;
  assignedQueueId: string | null;
  assignedHumanId: string | null;
  slaDeadline: Date | null;
  correlationId: string | null;
  traceId: string | null;
  metadata: JsonRecord | null;
  createdAt: Date;
  updatedAt: Date;
};

export type HumanWorkQueueAuthorityRecord = {
  id: string;
  businessId: string;
  interactionId: string;
  leadId: string;
  queueType: string;
  assignedRole: string;
  assignedHumanId: string | null;
  state: HumanWorkQueueState;
  priority: PriorityLevel;
  slaDeadline: Date | null;
  escalationAt: Date | null;
  resolutionCode: string | null;
  metadata: JsonRecord | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ReceptionMemoryAuthorityRecord = {
  id: string;
  businessId: string;
  leadId: string;
  unresolvedCount: number;
  complaintCount: number;
  repeatIssueFingerprint: string | null;
  preferredAgentId: string | null;
  preferredChannel: CanonicalInboundChannel | null;
  lastResolutionScore: number | null;
  escalationRisk: number;
  abuseRisk: number;
  vipScore: number;
  communicationPreference: JsonRecord | null;
  metadata: JsonRecord | null;
  createdAt: Date;
  updatedAt: Date;
};

export const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const toRecord = (value: unknown): JsonRecord => (isRecord(value) ? value : {});

export const coerceOptionalString = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

export const coerceDate = (value: unknown, fallback?: Date) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback || new Date();
};

export const normalizeToken = (value: unknown, fallback: string) =>
  String(value || fallback)
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

export const clampNumber = (
  value: number,
  minimum = 0,
  maximum = 100
) => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

const stableSerialize = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return JSON.stringify(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (!isRecord(value)) {
    return JSON.stringify(String(value));
  }

  const keys = Object.keys(value).sort();
  const serialized = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
  return `{${serialized.join(",")}}`;
};

export const stableStringify = (value: unknown) => stableSerialize(value);

export const hashDeterministicValue = (value: unknown) =>
  crypto.createHash("sha256").update(stableStringify(value)).digest("hex");

export const mergeJsonRecords = (
  ...inputs: Array<JsonRecord | null | undefined>
): JsonRecord | null => {
  const merged = inputs.reduce<JsonRecord>((state, current) => {
    if (!current) {
      return state;
    }

    return {
      ...state,
      ...current,
    };
  }, {});

  return Object.keys(merged).length ? merged : null;
};

export const minutesFrom = (anchor: Date, minutes: number) =>
  new Date(anchor.getTime() + Math.max(0, minutes) * 60_000);

export const minDate = (...inputs: Array<Date | null | undefined>) => {
  const values = inputs.filter((value): value is Date => value instanceof Date);

  if (!values.length) {
    return null;
  }

  return new Date(
    Math.min(...values.map((value) => value.getTime()))
  );
};

export const maxDate = (...inputs: Array<Date | null | undefined>) => {
  const values = inputs.filter((value): value is Date => value instanceof Date);

  if (!values.length) {
    return null;
  }

  return new Date(
    Math.max(...values.map((value) => value.getTime()))
  );
};

export const toIsoString = (value: Date | string | number) =>
  coerceDate(value).toISOString();

export const isInteractionStateTerminal = (state: InboundLifecycleState) =>
  state === "CLOSED" || state === "FAILED";

export const isInteractionStateAtLeast = (
  current: InboundLifecycleState,
  target: InboundLifecycleState
) => INTERACTION_STATE_ORDER[current] >= INTERACTION_STATE_ORDER[target];

export const canTransitionInteractionState = (
  current: InboundLifecycleState,
  next: InboundLifecycleState
) =>
  current === next ||
  (ALLOWED_INTERACTION_STATE_TRANSITIONS[current] || []).includes(next);

export const buildReferenceMetadata = (
  references: ReceptionContextReferences | null | undefined
) => {
  if (!references) {
    return null;
  }

  const payload: JsonRecord = {};

  if (references.crmProfile) {
    payload.crmProfile = {
      ...references.crmProfile,
    };
  }

  if (references.consent) {
    payload.consent = {
      ...references.consent,
      effectiveAt: references.consent.effectiveAt
        ? references.consent.effectiveAt.toISOString()
        : null,
    };
  }

  if (references.leadControl) {
    payload.leadControl = {
      ...references.leadControl,
      manualSuppressUntil: references.leadControl.manualSuppressUntil
        ? references.leadControl.manualSuppressUntil.toISOString()
        : null,
    };
  }

  if (references.latestTouch) {
    payload.latestTouch = {
      ...references.latestTouch,
      lastOutboundAt: references.latestTouch.lastOutboundAt
        ? references.latestTouch.lastOutboundAt.toISOString()
        : null,
    };
  }

  return Object.keys(payload).length ? payload : null;
};
