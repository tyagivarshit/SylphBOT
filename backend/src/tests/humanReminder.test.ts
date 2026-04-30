import assert from "node:assert/strict";
import { createHumanReminderService } from "../services/humanReminder.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export const humanReminderTests: TestCase[] = [
  {
    name: "human reminder engine dedupes nudges and respects per-type caps",
    run: async () => {
      const now = new Date("2026-04-28T12:20:00.000Z");
      const stale = new Date("2026-04-28T11:50:00.000Z");
      const service = createHumanReminderService({
        repository: {
          loadQueueCandidates: async () => [
            {
              id: "queue_a",
              interactionId: "interaction_a",
              businessId: "business_1",
              leadId: "lead_a",
              state: "ASSIGNED",
              priority: "HIGH",
              assignedHumanId: "human_1",
              slaDeadline: new Date("2026-04-28T13:30:00.000Z"),
              updatedAt: stale,
              metadata: {},
            },
            {
              id: "queue_b",
              interactionId: "interaction_b",
              businessId: "business_1",
              leadId: "lead_b",
              state: "ASSIGNED",
              priority: "HIGH",
              assignedHumanId: "human_2",
              slaDeadline: new Date("2026-04-28T13:30:00.000Z"),
              updatedAt: stale,
              metadata: {},
            },
            {
              id: "queue_c",
              interactionId: "interaction_c",
              businessId: "business_1",
              leadId: "lead_c",
              state: "IN_PROGRESS",
              priority: "CRITICAL",
              assignedHumanId: "human_3",
              slaDeadline: new Date("2026-04-28T12:25:00.000Z"),
              updatedAt: new Date("2026-04-28T11:00:00.000Z"),
              metadata: {},
            },
          ],
        } as any,
      });

      const first = await service.emitDueReminders({
        businessId: "business_1",
        now,
        caps: {
          STALE_ASSIGNMENT: 1,
          UNRESOLVED_CRITICAL: 1,
        },
      });
      const second = await service.emitDueReminders({
        businessId: "business_1",
        now,
        caps: {
          STALE_ASSIGNMENT: 1,
          UNRESOLVED_CRITICAL: 1,
        },
      });

      assert.equal(first.emitted, 2);
      assert.equal(first.byType.STALE_ASSIGNMENT, 1);
      assert.equal(first.byType.UNRESOLVED_CRITICAL, 1);
      assert.equal(second.emitted, 1);
      assert.equal(second.byType.STALE_ASSIGNMENT, 1);
      assert.equal(second.byType.UNRESOLVED_CRITICAL, 0);
    },
  },
];
