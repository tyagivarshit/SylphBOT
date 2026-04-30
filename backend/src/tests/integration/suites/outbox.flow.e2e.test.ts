import assert from "node:assert/strict";
import crypto from "crypto";
import type { IntegrationSuite } from "../harness/types";

export const outboxFlowE2ESuite: IntegrationSuite = {
  name: "outbox.flow.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const {
      subscribeRevenueBrainEvent,
    } = await import("../../../services/revenueBrain/eventBus.service");
    const eventId = `rb_evt_outbox_${crypto.randomUUID()}`;
    const traceId = `trace_${eventId}`;
    const handlerId = "integration.outbox.consumer";
    let handlerCalls = 0;

    const unsubscribe = subscribeRevenueBrainEvent(
      "revenue_brain.delivery_confirmed",
      async (_payload) => {
        handlerCalls += 1;

        if (handlerCalls === 1) {
          throw new Error("forced_outbox_consumer_failure_once");
        }
      },
      {
        handlerId,
      }
    );

    try {
      const enqueue = await harness.httpPost("/__integration__/events/revenue-brain", {
        event: "revenue_brain.delivery_confirmed",
        eventId,
        payload: {
          traceId,
          businessId: tenant.businessId,
          leadId: `lead_${traceId}`,
          messageId: `message_${traceId}`,
          providerMessageId: `provider_${traceId}`,
          deliveredAt: new Date().toISOString(),
        },
      });

      assert.equal(enqueue.statusCode, 202);

      const outbox = await harness.waitFor("outbox-published", async () => {
        const row = await harness.prisma.eventOutbox.findUnique({
          where: {
            dedupeKey: eventId,
          },
        });

        if (!row) {
          return null;
        }

        return row.publishedAt ? row : null;
      });

      assert.ok(outbox.publishedAt, "Expected published outbox row");
      assert.ok(
        Number(outbox.retries || 0) >= 1,
        "Expected at least one retry after forced failure"
      );

      const checkpoint = await harness.waitFor("outbox-checkpoint", async () =>
        harness.prisma.eventConsumerCheckpoint.findFirst({
          where: {
            eventOutboxId: outbox.id,
            consumerKey: handlerId,
          },
        })
      );
      assert.ok(checkpoint, "Expected consumer checkpoint persistence");

      const dedupeEnqueue = await harness.httpPost(
        "/__integration__/events/revenue-brain",
        {
          event: "revenue_brain.delivery_confirmed",
          eventId,
          payload: {
            traceId,
            businessId: tenant.businessId,
            leadId: `lead_${traceId}`,
            messageId: `message_${traceId}`,
            providerMessageId: `provider_${traceId}`,
            deliveredAt: new Date().toISOString(),
          },
        }
      );
      assert.equal(dedupeEnqueue.statusCode, 202);

      await harness.waitFor(
        "outbox-dedupe-stable",
        async () => {
          const rows = await harness.prisma.eventOutbox.findMany({
            where: {
              dedupeKey: eventId,
            },
          });

          return rows.length === 1 ? rows : null;
        },
        {
          timeoutMs: 8_000,
          intervalMs: 100,
        }
      );

      assert.ok(
        handlerCalls <= 2,
        `Expected idempotent consumer replay protection, got ${handlerCalls} calls`
      );
    } finally {
      unsubscribe();
    }
  },
};
