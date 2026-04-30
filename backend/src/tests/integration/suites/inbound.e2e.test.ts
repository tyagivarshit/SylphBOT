import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
  waitForLifecycleState,
  waitForOutboxEvents,
} from "../harness/helpers";

export const inboundE2ESuite: IntegrationSuite = {
  name: "inbound.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_inbound_e2e_1";
    const senderId = "ig_sender_inbound_e2e_1";
    const lead = await harness.prisma.lead.create({
      data: {
        businessId: tenant.businessId,
        clientId: tenant.clientId,
        platform: "INSTAGRAM",
        instagramId: senderId,
        stage: "NEW",
      },
    });
    await harness.prisma.consentLedger.create({
      data: {
        businessId: tenant.businessId,
        leadId: lead.id,
        channel: "INSTAGRAM",
        scope: "CONVERSATIONAL_OUTBOUND",
        source: "INTEGRATION_TEST",
        legalBasis: "CONSENT",
        grantedAt: new Date(),
      },
    });
    const webhook = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Can you share pricing and package details?",
    });

    assert.equal(webhook.statusCode, 200);

    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });
    const interaction = await waitForInteractionByExternalKey({
      harness,
      externalInteractionKey,
    });

    await waitForLifecycleState({
      harness,
      interactionId: interaction.id,
      lifecycleState: "ROUTED",
    });

    const persisted = await harness.prisma.inboundInteraction.findUnique({
      where: {
        id: interaction.id,
      },
    });
    assert.ok(persisted, "Expected persisted canonical inbound interaction");
    assert.equal(persisted!.externalInteractionKey, externalInteractionKey);
    assert.equal(persisted!.lifecycleState, "ROUTED");
    assert.ok(persisted!.intentClass, "Expected classification intent class");
    assert.ok(persisted!.routeDecision, "Expected final route decision");

    const outboxRows = await waitForOutboxEvents({
      harness,
      aggregateId: interaction.id,
      eventTypes: [
        "inbound.received",
        "inbound.normalized",
        "inbound.classified",
        "inbound.routed",
      ],
      minimumCount: 4,
    });
    const emittedEvents = outboxRows.map((row) => row.eventType);

    assert.ok(emittedEvents.includes("inbound.received"));
    assert.ok(emittedEvents.includes("inbound.normalized"));
    assert.ok(emittedEvents.includes("inbound.classified"));
    assert.ok(emittedEvents.includes("inbound.routed"));

    const { getAIQueues } = await import("../../../queues/ai.queue");
    const [aiQueue] = getAIQueues();
    const aiJobs = await aiQueue.getJobs(
      ["waiting", "delayed", "active", "completed"],
      0,
      100,
      false
    );
    const bridgeJob = aiJobs.find(
      (job) =>
        Array.isArray((job.data as any)?.messages) &&
        String((job.data as any).messages[0]?.metadata?.interactionId || "") ===
          interaction.id
    );

    assert.ok(bridgeJob, "Expected revenue bridge job enqueued in AI queue");
    assert.equal(
      Boolean((bridgeJob!.data as any).messages[0]?.skipInboundPersist),
      true
    );
  },
};
