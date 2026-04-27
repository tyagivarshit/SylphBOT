import assert from "node:assert/strict";
import prisma from "../config/prisma";
import * as aiQueue from "../queues/ai.queue";
import { __receptionRuntimeWorkerTestInternals } from "../workers/receptionRuntime.worker";
import type { TestCase } from "./reception.test.helpers";

const buildInteraction = () => ({
  id: "interaction_1",
  businessId: "business_1",
  leadId: "lead_1",
  clientId: "client_1",
  channel: "INSTAGRAM",
  providerMessageId: "ig_mid_1",
  externalInteractionKey: "inbound:business_1:INSTAGRAM:DM:ig_mid_1",
  interactionType: "DM",
  direction: "INBOUND",
  payload: {
    message: "Can you share pricing?",
  },
  normalizedPayload: {
    channel: "INSTAGRAM",
    sender: {
      externalId: "ig_user_1",
      displayName: "buyer_1",
      phone: null,
      email: null,
      handle: "buyer_1",
    },
    message: "Can you share pricing?",
    attachments: [],
    language: "en",
    rawIntentHint: null,
    receivedAt: "2026-04-27T10:00:00.000Z",
    providerMessageId: "ig_mid_1",
    threadId: "thread_1",
    metadata: {},
  },
  fingerprint: "fp_1",
  lifecycleState: "ROUTED",
  intentClass: "SALES",
  urgencyClass: "MEDIUM",
  sentimentClass: "NEUTRAL",
  spamScore: 0,
  priorityScore: 70,
  priorityLevel: "HIGH",
  routeDecision: "REVENUE_BRAIN",
  assignedQueueId: null,
  assignedHumanId: null,
  slaDeadline: new Date("2026-04-27T10:30:00.000Z"),
  correlationId: "corr_1",
  traceId: "trace_1",
  metadata: {
    consent: {
      recordId: "consent_1",
    },
    crmProfile: {
      profileId: "crm_1",
    },
    receptionMemory: {
      id: "memory_1",
    },
  },
  createdAt: new Date("2026-04-27T10:00:00.000Z"),
  updatedAt: new Date("2026-04-27T10:00:00.000Z"),
});

export const revenueBridgeTests: TestCase[] = [
  {
    name: "revenue bridge enqueues canonical context into the durable AI runtime",
    run: async () => {
      const originalInteractionFindUnique = (prisma.inboundInteraction as any).findUnique;
      const originalInteractionUpdate = (prisma.inboundInteraction as any).update;
      const originalClientFindUnique = (prisma.client as any).findUnique;
      const originalSubscriptionFindUnique = (prisma.subscription as any).findUnique;
      const originalProfileFindUnique = (prisma.leadIntelligenceProfile as any).findUnique;
      const originalConsentFindMany = (prisma.consentLedger as any).findMany;
      const originalLeadControlFindUnique = (prisma.leadControlState as any).findUnique;
      const originalTouchFindFirst = (prisma.revenueTouchLedger as any).findFirst;
      const originalMemoryFindUnique = (prisma.receptionMemory as any).findUnique;
      const originalEnqueueAIBatch = (aiQueue as any).enqueueAIBatch;
      const enqueued: any[] = [];
      const interaction = buildInteraction();

      try {
        (prisma.inboundInteraction as any).findUnique = async ({ select }: any) => {
          if (select?.metadata && Object.keys(select).length === 1) {
            return {
              metadata: interaction.metadata,
            };
          }

          return interaction;
        };
        (prisma.inboundInteraction as any).update = async ({ data }: any) => {
          interaction.metadata = {
            ...(interaction.metadata || {}),
            ...(data.metadata || {}),
          };
          return interaction;
        };
        (prisma.client as any).findUnique = async () => ({
          accessToken: "encrypted_token",
          pageId: "page_1",
          phoneNumberId: null,
        });
        (prisma.subscription as any).findUnique = async () => ({
          plan: {
            id: "plan_1",
            name: "PRO",
            type: "PRO",
          },
        });
        (prisma.leadIntelligenceProfile as any).findUnique = async () => null;
        (prisma.consentLedger as any).findMany = async () => [
          {
            id: "consent_1",
            channel: "INSTAGRAM",
            scope: "CONVERSATIONAL_OUTBOUND",
            source: "TEST",
            legalBasis: "CONSENT",
            grantedAt: new Date("2026-04-20T10:00:00.000Z"),
            revokedAt: null,
            createdAt: new Date("2026-04-20T10:00:00.000Z"),
          },
        ];
        (prisma.leadControlState as any).findUnique = async () => ({
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          cancelTokenVersion: 0,
          manualSuppressUntil: null,
          lastManualOutboundAt: null,
          lastHumanTakeoverAt: null,
        });
        (prisma.revenueTouchLedger as any).findFirst = async () => null;
        (prisma.receptionMemory as any).findUnique = async () => ({
          id: "memory_1",
          businessId: interaction.businessId,
          leadId: interaction.leadId,
          unresolvedCount: 0,
          complaintCount: 0,
          repeatIssueFingerprint: null,
          preferredAgentId: null,
          preferredChannel: "INSTAGRAM",
          lastResolutionScore: null,
          escalationRisk: 0,
          abuseRisk: 0,
          vipScore: 0,
          communicationPreference: null,
          metadata: {},
          createdAt: new Date("2026-04-20T10:00:00.000Z"),
          updatedAt: new Date("2026-04-20T10:00:00.000Z"),
        });
        (aiQueue as any).enqueueAIBatch = async (messages: any[], options: any) => {
          enqueued.push({
            messages,
            options,
          });
          return [];
        };

        await __receptionRuntimeWorkerTestInternals.processRevenueBrainBridge({
          data: {
            interactionId: interaction.id,
            businessId: interaction.businessId,
            leadId: interaction.leadId,
            channel: interaction.channel,
            priority: interaction.priorityLevel,
            priorityScore: interaction.priorityScore,
            consentSnapshotRef: "consent_1",
            crmProfileRef: "crm_1",
            receptionMemoryRef: "memory_1",
            traceId: interaction.traceId,
            externalInteractionKey: interaction.externalInteractionKey,
          },
        } as any);

        assert.equal(enqueued.length, 1);
        assert.equal(enqueued[0].messages[0].leadId, interaction.leadId);
        assert.equal(
          enqueued[0].messages[0].metadata.interactionId,
          interaction.id
        );
        assert.equal(
          enqueued[0].messages[0].metadata.consentSnapshotRef,
          "consent_1"
        );
        assert.equal(enqueued[0].options.idempotencyKey, interaction.externalInteractionKey);
      } finally {
        (prisma.inboundInteraction as any).findUnique = originalInteractionFindUnique;
        (prisma.inboundInteraction as any).update = originalInteractionUpdate;
        (prisma.client as any).findUnique = originalClientFindUnique;
        (prisma.subscription as any).findUnique = originalSubscriptionFindUnique;
        (prisma.leadIntelligenceProfile as any).findUnique = originalProfileFindUnique;
        (prisma.consentLedger as any).findMany = originalConsentFindMany;
        (prisma.leadControlState as any).findUnique = originalLeadControlFindUnique;
        (prisma.revenueTouchLedger as any).findFirst = originalTouchFindFirst;
        (prisma.receptionMemory as any).findUnique = originalMemoryFindUnique;
        (aiQueue as any).enqueueAIBatch = originalEnqueueAIBatch;
      }
    },
  },
];
