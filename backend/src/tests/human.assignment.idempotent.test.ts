import assert from "node:assert/strict";
import {
  createHumanQueueService,
  type HumanQueueAssignmentDecision,
  type HumanQueueRepository,
} from "../services/humanQueue.service";
import {
  createInboundInteractionFixture,
  createReceptionEventCollector,
  type TestCase,
} from "./reception.test.helpers";

const createRepository = () => {
  const queues = new Map<string, any>();

  const repository: HumanQueueRepository = {
    upsertAssignment: async ({
      interactionId,
      leadId,
      businessId,
      assignment,
    }: {
      interactionId: string;
      leadId: string;
      businessId: string;
      assignment: HumanQueueAssignmentDecision;
    }) => {
      const existing = queues.get(interactionId);
      const queue = existing || {
        id: "queue_1",
        businessId,
        interactionId,
        leadId,
        queueType: assignment.queueType,
        assignedRole: assignment.assignedRole,
        assignedHumanId: assignment.assignedHumanId,
        state: assignment.state,
        priority: assignment.priority,
        slaDeadline: assignment.slaDeadline,
        escalationAt: assignment.escalationAt,
        resolutionCode: null,
        metadata: {},
        createdAt: new Date("2026-04-27T10:00:00.000Z"),
        updatedAt: new Date("2026-04-27T10:00:00.000Z"),
      };
      queues.set(interactionId, queue);
      return {
        queue,
        interaction: createInboundInteractionFixture({
          id: interactionId,
          leadId,
          businessId,
          lifecycleState: "ROUTED",
          assignedQueueId: queue.id,
        }),
      };
    },
  };

  return {
    repository,
    queues,
  };
};

export const humanAssignmentIdempotentTests: TestCase[] = [
  {
    name: "human assignment remains idempotent for the same canonical interaction",
    run: async () => {
      const interaction = createInboundInteractionFixture({
        lifecycleState: "ROUTED",
      });
      const repository = createRepository();
      const collector = createReceptionEventCollector();
      const service = createHumanQueueService({
        repository: repository.repository,
        eventWriter: collector.writer,
      });

      const first = await service.ensureAssignment({
        interaction,
        classification: {
          intentClass: "SUPPORT",
          urgencyClass: "HIGH",
          sentimentClass: "NEGATIVE",
          spamScore: 0,
          routeHint: "SUPPORT",
          complaintSeverity: 0,
          reasons: ["intent:SUPPORT"],
        },
        routing: {
          routeDecision: "SUPPORT",
          priorityScore: 74,
          priorityLevel: "HIGH",
          slaDeadline: new Date("2026-04-27T10:30:00.000Z"),
          requiresHumanQueue: true,
          reasons: ["human_queue_required"],
        },
      });
      const second = await service.ensureAssignment({
        interaction,
        classification: {
          intentClass: "SUPPORT",
          urgencyClass: "HIGH",
          sentimentClass: "NEGATIVE",
          spamScore: 0,
          routeHint: "SUPPORT",
          complaintSeverity: 0,
          reasons: ["intent:SUPPORT"],
        },
        routing: {
          routeDecision: "SUPPORT",
          priorityScore: 74,
          priorityLevel: "HIGH",
          slaDeadline: new Date("2026-04-27T10:30:00.000Z"),
          requiresHumanQueue: true,
          reasons: ["human_queue_required"],
        },
      });

      assert.ok(first);
      assert.ok(second);
      assert.equal(first?.queue.id, second?.queue.id);
      assert.equal(repository.queues.size, 1);
      assert.equal(collector.events.length, 1);
      assert.equal(collector.events[0].type, "human.assigned");
    },
  },
];
