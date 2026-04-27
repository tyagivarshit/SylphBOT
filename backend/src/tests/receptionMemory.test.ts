import assert from "node:assert/strict";
import {
  createReceptionMemoryService,
  type ReceptionMemoryRepository,
} from "../services/receptionMemory.service";
import type { ReceptionMemoryAuthorityRecord } from "../services/reception.shared";
import {
  createInboundInteractionFixture,
  createReceptionEventCollector,
  createReceptionMemoryFixture,
  type TestCase,
} from "./reception.test.helpers";

const createInMemoryReceptionMemoryRepository = () => {
  const store = new Map<string, ReceptionMemoryAuthorityRecord>();

  const repository: ReceptionMemoryRepository = {
    getByLeadId: async (leadId) => store.get(leadId) || null,
    upsertMemory: async ({ businessId, leadId, memory }) => {
      const existing = store.get(leadId);
      const next: ReceptionMemoryAuthorityRecord = {
        id: existing?.id || `memory_${store.size + 1}`,
        createdAt: existing?.createdAt || new Date("2026-04-27T10:00:00.000Z"),
        updatedAt: new Date("2026-04-27T10:01:00.000Z"),
        businessId,
        leadId,
        ...memory,
      };
      store.set(leadId, next);
      return next;
    },
  };

  return {
    repository,
    store,
  };
};

export const receptionMemoryTests: TestCase[] = [
  {
    name: "reception memory records unresolved complaint continuity deterministically",
    run: async () => {
      const repo = createInMemoryReceptionMemoryRepository();
      repo.store.set(
        "lead_1",
        createReceptionMemoryFixture({
          unresolvedCount: 1,
          complaintCount: 0,
        })
      );
      const service = createReceptionMemoryService({
        repository: repo.repository,
        eventWriter: createReceptionEventCollector().writer,
      });
      const memory = await service.recordInbound({
        interaction: createInboundInteractionFixture({
          fingerprint: "fp_repeat_1",
          normalizedPayload: {
            message: "This issue is still not fixed and I need help today",
            language: "en",
          },
        }),
        classification: {
          intentClass: "COMPLAINT",
          urgencyClass: "HIGH",
          sentimentClass: "NEGATIVE",
          spamScore: 0.05,
          routeHint: "SUPPORT",
          complaintSeverity: 72,
          reasons: ["intent:COMPLAINT"],
        },
        references: {
          crmProfile: {
            valueScore: 82,
            vipScore: 76,
          },
        },
      });

      assert.equal(memory.unresolvedCount, 2);
      assert.equal(memory.complaintCount, 1);
      assert.equal(memory.repeatIssueFingerprint, "fp_repeat_1");
      assert.equal(memory.preferredChannel, "WHATSAPP");
      assert.ok(memory.vipScore >= 76);
      assert.ok(memory.escalationRisk > 0);
    },
  },
  {
    name: "reception memory resolution and reopen emit deterministic lifecycle events",
    run: async () => {
      const repo = createInMemoryReceptionMemoryRepository();
      repo.store.set(
        "lead_1",
        createReceptionMemoryFixture({
          unresolvedCount: 2,
          complaintCount: 1,
          repeatIssueFingerprint: "fp_repeat_1",
          vipScore: 70,
        })
      );
      const collector = createReceptionEventCollector();
      const service = createReceptionMemoryService({
        repository: repo.repository,
        eventWriter: collector.writer,
      });
      const interaction = createInboundInteractionFixture({
        assignedQueueId: "queue_1",
      });

      const resolved = await service.recordResolution({
        interaction,
        resolutionCode: "RESOLVED_ON_FIRST_REPLY",
        resolutionScore: 88,
        now: new Date("2026-04-27T10:20:00.000Z"),
      });
      const reopened = await service.recordReopen({
        interaction,
        reopenReason: "customer_followed_up_again",
        now: new Date("2026-04-27T11:00:00.000Z"),
      });

      assert.equal(resolved.unresolvedCount, 1);
      assert.equal(resolved.lastResolutionScore, 88);
      assert.equal(reopened.unresolvedCount, 2);
      assert.equal(collector.events.length, 2);
      assert.equal(collector.events[0].type, "interaction.resolved");
      assert.equal(collector.events[1].type, "interaction.reopened");
    },
  },
];
