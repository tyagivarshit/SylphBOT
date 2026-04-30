import assert from "node:assert/strict";
import { createEscalationLadderService } from "../services/escalationLadder.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const immediateLockRunner: any = async ({
  run,
}: {
  run: (lock: { key: string; release: () => Promise<void> }) => Promise<any>;
}) =>
  run({
    key: "lock:test",
    release: async () => undefined,
  });

export const escalationLadderTests: TestCase[] = [
  {
    name: "escalation ladder advances monotonically and never oscillates backwards",
    run: async () => {
      const queue = {
        id: "queue_1",
        businessId: "business_1",
        interactionId: "interaction_1",
        leadId: "lead_1",
        queueType: "SUPPORT",
        assignedRole: "SENIOR",
        assignedHumanId: "human_1",
        priority: "HIGH",
        state: "ASSIGNED",
        metadata: {
          escalation: {
            stepIndex: 1,
          },
        },
      };
      const updates: string[] = [];
      const service = createEscalationLadderService({
        lockRunner: immediateLockRunner,
        repository: {
          getQueueById: async () => ({ ...queue }),
          getRule: async () => ({
            id: "rule_1",
            businessId: "business_1",
            queueType: "SUPPORT",
            severity: "HIGH",
            ladder: ["REP", "SENIOR", "MANAGER", "OWNER"],
            timeouts: null,
            ownerFallback: true,
            metadata: null,
          }),
          persistEscalation: async ({ nextRole, metadata }) => {
            queue.assignedRole = nextRole;
            queue.metadata = metadata;
            updates.push(nextRole);
          },
        } as any,
      });

      const first = await service.escalateQueue({
        queueId: "queue_1",
        reason: "sla_breach",
      });
      const second = await service.escalateQueue({
        queueId: "queue_1",
        reason: "sla_breach_repeat",
      });

      assert.equal(first?.nextRole, "MANAGER");
      assert.equal(first?.stepIndex, 2);
      assert.equal(second?.nextRole, "OWNER");
      assert.equal(second?.stepIndex, 3);
      assert.deepEqual(updates, ["MANAGER", "OWNER"]);
    },
  },
  {
    name: "escalation ladder remains idempotent at terminal role",
    run: async () => {
      const queue = {
        id: "queue_2",
        businessId: "business_1",
        interactionId: "interaction_2",
        leadId: "lead_2",
        queueType: "SUPPORT",
        assignedRole: "OWNER",
        assignedHumanId: null,
        priority: "CRITICAL",
        state: "ESCALATED",
        metadata: {
          escalation: {
            stepIndex: 3,
          },
        },
      };
      let persisted = 0;
      const service = createEscalationLadderService({
        lockRunner: immediateLockRunner,
        repository: {
          getQueueById: async () => ({ ...queue }),
          getRule: async () => ({
            id: "rule_1",
            businessId: "business_1",
            queueType: "SUPPORT",
            severity: "CRITICAL",
            ladder: ["REP", "SENIOR", "MANAGER", "OWNER"],
            timeouts: null,
            ownerFallback: true,
            metadata: null,
          }),
          persistEscalation: async () => {
            persisted += 1;
          },
        } as any,
      });

      const result = await service.escalateQueue({
        queueId: "queue_2",
        reason: "terminal_check",
      });

      assert.equal(result?.changed, false);
      assert.equal(result?.nextRole, "OWNER");
      assert.equal(persisted, 0);
    },
  },
];
