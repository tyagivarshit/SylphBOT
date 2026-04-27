import assert from "node:assert/strict";
import {
  createHumanQueueService,
  type HumanQueueRepository,
  type HumanQueueAssignmentDecision,
} from "../services/humanQueue.service";
import type { InboundInteractionAuthorityRecord } from "../services/reception.shared";
import {
  createInboundInteractionFixture,
  createReceptionEventCollector,
  type TestCase,
} from "./reception.test.helpers";

const createInMemoryHumanQueueRepository = (
  interaction: InboundInteractionAuthorityRecord
) => {
  const queues = new Map<string, any>();
  let currentInteraction = {
    ...interaction,
  };

  const repository: HumanQueueRepository = {
    upsertAssignment: async ({
      interactionId,
      leadId,
      businessId,
      assignment,
      assignedHumanId,
      metadata,
    }: {
      interactionId: string;
      leadId: string;
      businessId: string;
      assignment: HumanQueueAssignmentDecision;
      assignedHumanId?: string | null;
      metadata?: Record<string, unknown> | null;
    }) => {
      const existing = queues.get(interactionId);
      const queue = existing || {
        id: `queue_${queues.size + 1}`,
        businessId,
        interactionId,
        leadId,
        queueType: assignment.queueType,
        assignedRole: assignment.assignedRole,
        assignedHumanId: assignedHumanId || assignment.assignedHumanId,
        state: assignment.state,
        priority: assignment.priority,
        slaDeadline: assignment.slaDeadline,
        escalationAt: assignment.escalationAt,
        resolutionCode: null,
        metadata: metadata || {},
        createdAt: new Date("2026-04-27T10:00:00.000Z"),
        updatedAt: new Date("2026-04-27T10:00:00.000Z"),
      };

      queue.queueType = assignment.queueType;
      queue.assignedRole = assignment.assignedRole;
      queue.assignedHumanId = assignedHumanId || assignment.assignedHumanId;
      queue.state = assignment.state;
      queue.priority = assignment.priority;
      queue.slaDeadline = assignment.slaDeadline;
      queue.escalationAt = assignment.escalationAt;
      queue.metadata = {
        ...(queue.metadata || {}),
        ...(metadata || {}),
      };
      queue.updatedAt = new Date("2026-04-27T10:01:00.000Z");
      queues.set(interactionId, queue);

      currentInteraction = {
        ...currentInteraction,
        assignedQueueId: queue.id,
        assignedHumanId: queue.assignedHumanId,
      };

      return {
        queue,
        interaction: currentInteraction,
      };
    },
  };

  return {
    repository,
    queues,
    getInteraction: () => currentInteraction,
  };
};

export const humanQueueTests: TestCase[] = [
  {
    name: "human queue service upserts a single operational assignment authority row",
    run: async () => {
      const interaction = createInboundInteractionFixture({
        externalInteractionKey: "inbound:business_1:WHATSAPP:MESSAGE:touch_1",
        lifecycleState: "ROUTED",
      });
      const memoryRepo = createInMemoryHumanQueueRepository(interaction);
      const collector = createReceptionEventCollector();
      const service = createHumanQueueService({
        repository: memoryRepo.repository,
        eventWriter: collector.writer,
      });
      const context = {
        interaction,
        classification: {
          intentClass: "COMPLAINT",
          urgencyClass: "HIGH",
          sentimentClass: "NEGATIVE",
          spamScore: 0.02,
          routeHint: "SUPPORT" as const,
          complaintSeverity: 70,
          reasons: ["intent:COMPLAINT"],
        },
        routing: {
          routeDecision: "HUMAN_QUEUE" as const,
          priorityScore: 74,
          priorityLevel: "HIGH" as const,
          slaDeadline: new Date("2026-04-27T10:30:00.000Z"),
          requiresHumanQueue: true,
          reasons: ["human_queue_required"],
        },
      };

      const first = await service.ensureAssignment(context);
      const second = await service.ensureAssignment(context);

      assert.ok(first);
      assert.ok(second);
      assert.equal(first?.queue.id, second?.queue.id);
      assert.equal(memoryRepo.queues.size, 1);
      assert.equal(first?.queue.queueType, "SUPPORT");
      assert.equal(memoryRepo.getInteraction().assignedQueueId, first?.queue.id);
      assert.equal(memoryRepo.getInteraction().lifecycleState, "ROUTED");
      assert.equal(collector.events.length, 1);
      assert.equal(collector.events[0].type, "human.assigned");
    },
  },
];
