import assert from "node:assert/strict";
import crypto from "crypto";
import type { IntegrationSuite } from "../harness/types";

export const failureInjectionE2ESuite: IntegrationSuite = {
  name: "failure.injection.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const headers = harness.withBypassHeaders({
      userId: tenant.userId,
      businessId: tenant.businessId,
    });
    const redisModule = await import("../../../config/redis");
    const lifecycleModule = await import("../../../runtime/lifecycle");
    const lockModule = await import("../../../services/distributedLock.service");

    await redisModule.closeRedisConnection();
    const degraded = await harness.httpPost(
      "/api/inbox/intake/email",
      {
        clientId: tenant.clientId,
        providerMessageId: "redis_outage_case_1",
        messageId: "redis_outage_case_1",
        from: {
          email: "outage@automexia.test",
        },
        subject: "Outage test",
        text: "This should fail while Redis is unavailable",
      },
      {
        headers,
      }
    );
    assert.ok(
      degraded.statusCode >= 500,
      `Expected fail-closed behavior during redis outage, got ${degraded.statusCode}`
    );

    lifecycleModule.initRedis();
    lifecycleModule.initQueues();
    await harness.startReceptionWorkers();

    const replayEventId = `rb_evt_retry_${crypto.randomUUID()}`;
    const replayCalls = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        harness.httpPost("/__integration__/events/revenue-brain", {
          event: "revenue_brain.delivery_confirmed",
          eventId: replayEventId,
          payload: {
            traceId: `trace_${replayEventId}`,
            businessId: tenant.businessId,
            leadId: `lead_${replayEventId}`,
            messageId: `message_${replayEventId}`,
            providerMessageId: `provider_${replayEventId}`,
            deliveredAt: new Date().toISOString(),
          },
        })
      )
    );

    replayCalls.forEach((response) => {
      assert.equal(response.statusCode, 202);
    });

    const dedupedOutboxRows = await harness.waitFor(
      "outbox-retryable-dedupe",
      async () => {
        const rows = await harness.prisma.eventOutbox.findMany({
          where: {
            dedupeKey: replayEventId,
          },
        });

        return rows.length === 1 ? rows : null;
      }
    );
    assert.equal(dedupedOutboxRows.length, 1);

    const firstLock = await lockModule.acquireDistributedLock({
      key: "integration:leader:lease",
      ttlMs: 250,
      waitMs: 0,
      refreshIntervalMs: 0,
    });
    assert.ok(firstLock, "Expected initial lease acquisition");

    await new Promise((resolve) => setTimeout(resolve, 400));

    const secondLock = await lockModule.acquireDistributedLock({
      key: "integration:leader:lease",
      ttlMs: 250,
      waitMs: 200,
      refreshIntervalMs: 0,
    });
    assert.ok(
      secondLock,
      "Expected a new leader lock after previous lease expiry window"
    );

    await firstLock?.release().catch(() => undefined);
    await secondLock?.release().catch(() => undefined);
  },
};
