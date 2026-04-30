import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
} from "../harness/helpers";

export const slaLeaderE2ESuite: IntegrationSuite = {
  name: "sla.leader.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_sla_leader_1";
    const senderId = "ig_sender_sla_leader_1";
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });

    await harness.stopReceptionWorkers();
    await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Need urgent help with this issue",
    });

    const interaction = await waitForInteractionByExternalKey({
      harness,
      externalInteractionKey,
    });

    await harness.prisma.consentLedger.create({
      data: {
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        channel: "INSTAGRAM",
        scope: "CONVERSATIONAL_OUTBOUND",
        source: "INTEGRATION_TEST",
        legalBasis: "CONSENT",
        revokedAt: new Date(),
      },
    });

    await harness.startReceptionWorkers();

    const queue = await harness.waitFor("sla-human-queue", async () => {
      const row = await harness.prisma.humanWorkQueue.findUnique({
        where: {
          interactionId: interaction.id,
        },
      });

      return row || null;
    });

    const pastDeadline = new Date(Date.now() - 10 * 60 * 1000);
    await harness.prisma.humanWorkQueue.update({
      where: {
        id: queue.id,
      },
      data: {
        slaDeadline: pastDeadline,
        state: "PENDING",
      },
    });

    await harness.prisma.inboundInteraction.update({
      where: {
        id: interaction.id,
      },
      data: {
        slaDeadline: pastDeadline,
        lifecycleState: "ROUTED",
      },
    });

    const [runnerA, runnerB] = await Promise.all([
      harness.httpPost("/__integration__/sla/run", {
        now: new Date().toISOString(),
      }),
      harness.httpPost("/__integration__/sla/run", {
        now: new Date().toISOString(),
      }),
    ]);

    assert.equal(runnerA.statusCode, 200);
    assert.equal(runnerB.statusCode, 200);

    const firstResult = runnerA.body?.result || null;
    const secondResult = runnerB.body?.result || null;
    const emittedCounts = [
      Number(firstResult?.emitted || 0),
      Number(secondResult?.emitted || 0),
    ];

    assert.equal(
      emittedCounts.filter((count) => count > 0).length,
      1,
      "Expected exactly one SLA leader execution to emit events"
    );

    const slaEvents = await harness.prisma.eventOutbox.findMany({
      where: {
        aggregateId: interaction.id,
        eventType: {
          in: ["sla.warning", "sla.breached"],
        },
      },
    });

    assert.equal(slaEvents.length, 1, "Expected one SLA escalation event");
  },
};
