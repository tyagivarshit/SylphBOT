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

const createInMemoryNormalizationRepository = () => {
  const store = new Map<string, InboundInteractionAuthorityRecord>();

  const repository: InboundInteractionWriteRepository = {
    upsertCanonicalInteraction: async (
      draft: NormalizedInboundInteractionDraft
    ) => {
      const existing = store.get(draft.externalInteractionKey);

      if (existing) {
        const updated = {
          ...existing,
          normalizedPayload: draft.normalizedPayload,
          fingerprint: draft.fingerprint,
          lifecycleState: "NORMALIZED" as const,
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
        direction: "INBOUND",
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

export const normalizeReplayTests: TestCase[] = [
  {
    name: "normalization replay preserves one normalized canonical interaction",
    run: async () => {
      const memoryRepo = createInMemoryNormalizationRepository();
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
              id: "wamid.replay",
              from: "+919999999999",
              timestamp: "2026-04-27T10:00:00.000Z",
              text: {
                body: "Can I get pricing?",
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
      const second = await service.ingest(command);

      assert.equal(first.interaction.id, second.interaction.id);
      assert.equal(memoryRepo.store.size, 1);
      assert.equal(first.interaction.lifecycleState, "NORMALIZED");
      assert.equal(collector.events.length, 2);
      assert.equal(collector.events[0].type, "inbound.received");
      assert.equal(collector.events[1].type, "inbound.normalized");
    },
  },
];
