import assert from "node:assert/strict";
import {
  queueRevenueBrainEventDurably,
  revenueBrainEventBus,
  subscribeRevenueBrainEvent,
  waitForRevenueBrainBackgroundTasks,
} from "../services/revenueBrain/eventBus.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const buildDeliveryConfirmedPayload = () =>
  ({
    traceId: "trace_phase3c_delivery",
    businessId: "business_1",
    leadId: "lead_1",
    messageId: "message_1",
    reply: {
      message: "Confirmed follow-up",
      cta: "REPLY_DM",
      angle: "value",
      reason: "phase3c_test",
      confidence: 0.91,
      structured: {
        message: "Confirmed follow-up",
        intent: "followup",
        stage: "DISCOVERY",
        leadType: "HIGH",
        cta: "reply_dm",
        confidence: 0.91,
        reason: "phase3c_test",
      },
      source: "SALES",
      latencyMs: 10,
      traceId: "trace_phase3c_delivery",
      meta: {},
    },
    route: "SALES",
    source: "QUEUE",
    planSnapshot: {
      route: "SALES",
      preview: false,
      source: "QUEUE",
    },
    delivery: {
      mode: "platform",
      platform: "INSTAGRAM",
      confirmedAt: Date.now(),
      deliveryJobKey: "job_phase3c",
      preview: false,
      simulation: false,
      sandbox: false,
      production: true,
    },
  }) as any;

export const revenueBrainPhase3CTests: TestCase[] = [
  {
    name: "revenue brain event bus export exposes the durable queue surface",
    run: () => {
      assert.ok(revenueBrainEventBus);
      assert.equal(typeof revenueBrainEventBus.publish, "function");
      assert.equal(typeof revenueBrainEventBus.queue, "function");
      assert.equal(typeof revenueBrainEventBus.queueDurably, "function");
      assert.equal(typeof revenueBrainEventBus.subscribe, "function");
    },
  },
  {
    name: "durable delivery_confirmed enqueue deduplicates retries through a stable event id",
    run: async () => {
      let handlerCalls = 0;
      const eventId = "rb_evt_delivery_confirmed:phase3c:stable";
      const unsubscribe = subscribeRevenueBrainEvent(
        "revenue_brain.delivery_confirmed",
        () => {
          handlerCalls += 1;
        },
        {
          handlerId: "phase3c.delivery_confirmed",
        }
      );

      await queueRevenueBrainEventDurably(
        "revenue_brain.delivery_confirmed",
        buildDeliveryConfirmedPayload(),
        {
          eventId,
        }
      );
      await queueRevenueBrainEventDurably(
        "revenue_brain.delivery_confirmed",
        buildDeliveryConfirmedPayload(),
        {
          eventId,
        }
      );

      await waitForRevenueBrainBackgroundTasks();
      unsubscribe();

      assert.equal(handlerCalls, 1);
    },
  },
];
