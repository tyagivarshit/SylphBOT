import assert from "node:assert/strict";
import {
  createInteractionNormalizerService,
  type InboundInteractionWriteRepository,
  type NormalizedInboundInteractionDraft,
} from "../services/interactionNormalizer.service";
import type { InboundInteractionAuthorityRecord } from "../services/reception.shared";
import {
  createReceptionEventCollector,
  type TestCase,
} from "./reception.test.helpers";

const createInMemoryInteractionRepository = () => {
  const store = new Map<string, InboundInteractionAuthorityRecord>();

  const repository: InboundInteractionWriteRepository = {
    upsertCanonicalInteraction: async (
      draft: NormalizedInboundInteractionDraft
    ): Promise<InboundInteractionAuthorityRecord> => {
      const existing = store.get(draft.externalInteractionKey);

      if (existing) {
        const updated = {
          ...existing,
          providerMessageId: draft.providerMessageId,
          payload: draft.payload,
          normalizedPayload: draft.normalizedPayload,
          fingerprint: draft.fingerprint,
          lifecycleState: "NORMALIZED" as const,
          correlationId: draft.correlationId,
          traceId: draft.traceId,
          metadata: draft.metadata,
          updatedAt: new Date("2026-04-27T10:01:00.000Z"),
        };
        store.set(draft.externalInteractionKey, updated);
        return updated;
      }

      const created: InboundInteractionAuthorityRecord = {
        id: `interaction_${store.size + 1}`,
        businessId: draft.businessId,
        leadId: draft.leadId,
        clientId: draft.clientId,
        channel: draft.channel,
        providerMessageId: draft.providerMessageId,
        externalInteractionKey: draft.externalInteractionKey,
        interactionType: draft.interactionType,
        direction: draft.direction,
        payload: draft.payload,
        normalizedPayload: draft.normalizedPayload,
        fingerprint: draft.fingerprint,
        lifecycleState: "NORMALIZED",
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
        correlationId: draft.correlationId,
        traceId: draft.traceId,
        metadata: draft.metadata,
        createdAt: new Date("2026-04-27T10:00:00.000Z"),
        updatedAt: new Date("2026-04-27T10:00:00.000Z"),
      };
      store.set(draft.externalInteractionKey, created);
      return created;
    },
  };

  return {
    repository,
    store,
  };
};

export const interactionNormalizerTests: TestCase[] = [
  {
    name: "interaction normalizer produces canonical envelopes for supported adapters",
    run: () => {
      const service = createInteractionNormalizerService({
        repository: createInMemoryInteractionRepository().repository,
        eventWriter: createReceptionEventCollector().writer,
      });

      const whatsapp = service.normalizePayload("WHATSAPP", {
        messages: [
          {
            id: "wamid.1",
            from: "+919999999999",
            timestamp: "2026-04-27T10:00:00.000Z",
            text: {
              body: "Need pricing details",
            },
          },
        ],
        contacts: [
          {
            wa_id: "+919999999999",
            profile: {
              name: "Aarav",
            },
          },
        ],
      });
      const instagram = service.normalizePayload("INSTAGRAM", {
        message: "Please check DM",
        mid: "ig_mid_1",
        from: {
          id: "ig_1",
          username: "creator_1",
        },
        threadId: "ig_thread_1",
        receivedAt: "2026-04-27T10:00:00.000Z",
      });
      const email = service.normalizePayload("EMAIL", {
        from: {
          email: "buyer@example.com",
          name: "Buyer",
        },
        subject: "Refund request",
        text: "I need a refund",
        messageId: "email_1",
        threadId: "thread_1",
        receivedAt: "2026-04-27T10:00:00.000Z",
      });
      const form = service.normalizePayload("FORM", {
        submissionId: "form_1",
        formId: "site_contact",
        name: "Visitor",
        email: "visitor@example.com",
        message: "Need a quote",
        receivedAt: "2026-04-27T10:00:00.000Z",
      });
      const voice = service.normalizePayload("VOICE", {
        callId: "call_1",
        from: "+919999999999",
        transcript: "Please call me back urgently",
        receivedAt: "2026-04-27T10:00:00.000Z",
      });

      assert.equal(whatsapp.envelope.channel, "WHATSAPP");
      assert.equal(whatsapp.interactionType, "MESSAGE");
      assert.equal(instagram.envelope.channel, "INSTAGRAM");
      assert.equal(instagram.interactionType, "DM");
      assert.equal(email.interactionType, "EMAIL");
      assert.equal(form.interactionType, "FORM");
      assert.equal(voice.interactionType, "CALL");
      assert.equal(voice.envelope.message, "Please call me back urgently");
    },
  },
  {
    name: "interaction normalizer upserts exactly one canonical row per inbound touchpoint",
    run: async () => {
      const memoryRepo = createInMemoryInteractionRepository();
      const collector = createReceptionEventCollector();
      const service = createInteractionNormalizerService({
        repository: memoryRepo.repository,
        eventWriter: collector.writer,
      });
      const command = {
        businessId: "business_1",
        leadId: "lead_1",
        clientId: "client_1",
        adapter: "WHATSAPP" as const,
        traceId: "trace_1",
        payload: {
          messages: [
            {
              id: "wamid.duplicate",
              from: "+919999999999",
              timestamp: "2026-04-27T10:00:00.000Z",
              text: {
                body: "Need pricing details",
              },
            },
          ],
          contacts: [
            {
              wa_id: "+919999999999",
              profile: {
                name: "Aarav",
              },
            },
          ],
        },
      };

      const first = await service.ingest(command);
      const second = await service.ingest({
        ...command,
        metadata: {
          replayed: true,
        },
      });

      assert.equal(first.interaction.id, second.interaction.id);
      assert.equal(memoryRepo.store.size, 1);
      assert.equal(
        first.interaction.externalInteractionKey,
        second.interaction.externalInteractionKey
      );
      assert.equal(collector.events.length, 2);
      assert.equal(collector.events[0].type, "inbound.received");
      assert.equal(collector.events[1].type, "inbound.normalized");
    },
  },
];
