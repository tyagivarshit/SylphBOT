import assert from "node:assert/strict";
import { createAssignmentEngineService } from "../services/assignmentEngine.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const baseQueue = {
  id: "queue_1",
  businessId: "business_1",
  interactionId: "interaction_1",
  leadId: "lead_1",
  queueType: "BILLING",
  assignedRole: "REP",
  assignedHumanId: null,
  state: "PENDING",
  priority: "HIGH",
  slaDeadline: new Date("2026-04-28T10:30:00.000Z"),
  metadata: null,
  createdAt: new Date("2026-04-28T10:00:00.000Z"),
};

const baseInteraction = {
  id: "interaction_1",
  channel: "WHATSAPP",
  priorityLevel: "HIGH",
  intentClass: "BILLING",
  urgencyClass: "HIGH",
  normalizedPayload: {
    language: "en",
  },
  metadata: null,
  createdAt: new Date("2026-04-28T10:00:00.000Z"),
};

export const assignmentEngineTests: TestCase[] = [
  {
    name: "assignment engine picks deterministic best-fit human by score",
    run: async () => {
      const persisted: Array<{ queueId: string; assignedHumanId: string }> = [];
      const service = createAssignmentEngineService({
        repository: {
          getQueueById: async () => ({
            ...baseQueue,
          }),
          getInteractionById: async () => ({
            ...baseInteraction,
          }),
          getReceptionMemory: async () => ({
            preferredAgentId: "human_2",
            vipScore: 75,
          }),
          listRoleCapabilities: async () => [
            {
              roleKey: "REP",
              permissions: ["reply"],
              channels: ["WHATSAPP"],
              expertiseTags: ["BILLING", "SUPPORT"],
              escalationAuthority: 1,
              maxConcurrency: 2,
              priorityWeight: 120,
              metadata: null,
            },
          ],
          listAvailability: async () => [
            {
              id: "availability_1",
              businessId: "business_1",
              humanId: "human_1",
              state: "AVAILABLE",
              activeLoad: 0,
              maxLoad: 2,
              timezone: "Asia/Kolkata",
              language: "en",
              skillScore: 90,
              responseScore: 70,
              lastSeenAt: new Date(),
              metadata: null,
              updatedAt: new Date(),
            },
            {
              id: "availability_2",
              businessId: "business_1",
              humanId: "human_2",
              state: "AVAILABLE",
              activeLoad: 0,
              maxLoad: 2,
              timezone: "Asia/Kolkata",
              language: "en",
              skillScore: 88,
              responseScore: 72,
              lastSeenAt: new Date(),
              metadata: null,
              updatedAt: new Date(),
            },
          ],
          persistAssignment: async (input) => {
            persisted.push({
              queueId: input.queueId,
              assignedHumanId: input.assignedHumanId,
            });
          },
        } as any,
      });

      const result = await service.assignQueue({
        queueId: "queue_1",
      });

      assert.equal(result.assigned, true);
      assert.equal((result as any).assignedHumanId, "human_2");
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0].assignedHumanId, "human_2");
    },
  },
  {
    name: "assignment engine fails closed and escalates when no candidate matches",
    run: async () => {
      const escalations: string[] = [];
      const service = createAssignmentEngineService({
        repository: {
          getQueueById: async () => ({
            ...baseQueue,
          }),
          getInteractionById: async () => ({
            ...baseInteraction,
          }),
          getReceptionMemory: async () => null,
          listRoleCapabilities: async () => [
            {
              roleKey: "REP",
              permissions: ["reply"],
              channels: ["EMAIL"],
              expertiseTags: ["BILLING"],
              escalationAuthority: 1,
              maxConcurrency: 1,
              priorityWeight: 100,
              metadata: null,
            },
          ],
          listAvailability: async () => [
            {
              id: "availability_1",
              businessId: "business_1",
              humanId: "human_1",
              state: "OFFLINE",
              activeLoad: 1,
              maxLoad: 1,
              timezone: null,
              language: "en",
              skillScore: 50,
              responseScore: 50,
              lastSeenAt: null,
              metadata: null,
              updatedAt: new Date(),
            },
          ],
          persistAssignment: async () => {
            throw new Error("should_not_persist");
          },
        } as any,
        escalationAdapter: {
          escalateForNoMatch: async ({ queueId, reason }) => {
            escalations.push(`${queueId}:${reason}`);
          },
        },
      });

      const result = await service.assignQueue({
        queueId: "queue_1",
      });

      assert.equal(result.assigned, false);
      assert.equal(result.reason, "no_eligible_human_candidate");
      assert.deepEqual(escalations, ["queue_1:no_eligible_human_candidate"]);
    },
  },
];
