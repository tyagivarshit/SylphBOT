import {
  buildReceptionEventEnvelope,
  type PublishReceptionEventInput,
  type ReceptionEventEnvelope,
  type ReceptionEventName,
} from "../services/receptionEvent.service";
import type {
  HumanWorkQueueAuthorityRecord,
  InboundInteractionAuthorityRecord,
  JsonRecord,
  ReceptionMemoryAuthorityRecord,
} from "../services/reception.shared";

export type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const createInboundInteractionFixture = (
  overrides?: Partial<InboundInteractionAuthorityRecord> & {
    normalizedPayload?: Record<string, unknown>;
  }
): InboundInteractionAuthorityRecord => {
  const normalizedPayloadOverride =
    (overrides?.normalizedPayload as Record<string, unknown>) || {};
  const { normalizedPayload: _ignored, ...rest } = overrides || {};

  return {
    id: "interaction_1",
    businessId: "business_1",
    leadId: "lead_1",
    clientId: "client_1",
    channel: "WHATSAPP",
    providerMessageId: "wamid.1",
    externalInteractionKey: "inbound:business_1:WHATSAPP:MESSAGE:wamid.1",
    interactionType: "MESSAGE",
    direction: "INBOUND",
    payload: {
      messages: [
        {
          id: "wamid.1",
        },
      ],
    },
    normalizedPayload: {
      channel: "WHATSAPP",
      sender: {
        externalId: "+919999999999",
        displayName: "Aarav",
        phone: "+919999999999",
        email: null,
        handle: null,
      },
      message: "Can you help with pricing?",
      attachments: [],
      language: "en",
      rawIntentHint: null,
      receivedAt: "2026-04-27T10:00:00.000Z",
      providerMessageId: "wamid.1",
      threadId: "thread_1",
      metadata: {},
      ...normalizedPayloadOverride,
    },
    fingerprint: "fp_1",
    lifecycleState: "RECEIVED",
    intentClass: null,
    urgencyClass: null,
    sentimentClass: null,
    spamScore: 0,
    priorityScore: 0,
    priorityLevel: null,
    routeDecision: null,
    assignedQueueId: null,
    assignedHumanId: null,
    slaDeadline: null,
    correlationId: "corr_1",
    traceId: "trace_1",
    metadata: {},
    createdAt: new Date("2026-04-27T10:00:00.000Z"),
    updatedAt: new Date("2026-04-27T10:00:00.000Z"),
    ...rest,
  };
};

export const createReceptionMemoryFixture = (
  overrides?: Partial<ReceptionMemoryAuthorityRecord>
): ReceptionMemoryAuthorityRecord => ({
  id: "memory_1",
  businessId: "business_1",
  leadId: "lead_1",
  unresolvedCount: 0,
  complaintCount: 0,
  repeatIssueFingerprint: null,
  preferredAgentId: null,
  preferredChannel: "WHATSAPP",
  lastResolutionScore: null,
  escalationRisk: 0,
  abuseRisk: 0,
  vipScore: 0,
  communicationPreference: null,
  metadata: {},
  createdAt: new Date("2026-04-27T10:00:00.000Z"),
  updatedAt: new Date("2026-04-27T10:00:00.000Z"),
  ...overrides,
});

export const createHumanQueueFixture = (
  overrides?: Partial<HumanWorkQueueAuthorityRecord>
): HumanWorkQueueAuthorityRecord => ({
  id: "queue_1",
  businessId: "business_1",
  interactionId: "interaction_1",
  leadId: "lead_1",
  queueType: "SUPPORT",
  assignedRole: "CUSTOMER_SUPPORT",
  assignedHumanId: null,
  state: "PENDING",
  priority: "HIGH",
  slaDeadline: new Date("2026-04-27T10:30:00.000Z"),
  escalationAt: new Date("2026-04-27T10:20:00.000Z"),
  resolutionCode: null,
  metadata: {},
  createdAt: new Date("2026-04-27T10:00:00.000Z"),
  updatedAt: new Date("2026-04-27T10:00:00.000Z"),
  ...overrides,
});

export const createReceptionEventCollector = () => {
  const dedupe = new Map<string, ReceptionEventEnvelope>();
  const events: ReceptionEventEnvelope[] = [];

  return {
    events,
    writer: async <TEvent extends ReceptionEventName>(
      input: PublishReceptionEventInput<TEvent>
    ) => {
      const envelope = buildReceptionEventEnvelope(input);

      if (!dedupe.has(envelope.dedupeKey)) {
        dedupe.set(envelope.dedupeKey, envelope as ReceptionEventEnvelope);
        events.push(envelope as ReceptionEventEnvelope);
      }

      return envelope;
    },
  };
};

export const createJsonRecord = (input?: JsonRecord | null) => ({
  ...(input || {}),
});
