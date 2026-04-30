import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
  waitForLifecycleState,
} from "../harness/helpers";

export const revenueBridgeE2ESuite: IntegrationSuite = {
  name: "revenue.bridge.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_revenue_bridge_1";
    const senderId = "ig_sender_revenue_bridge_1";
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
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });

    const webhook = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Please share pricing and package options.",
    });

    assert.equal(webhook.statusCode, 200);

    const interaction = await waitForInteractionByExternalKey({
      harness,
      externalInteractionKey,
    });

    await waitForLifecycleState({
      harness,
      interactionId: interaction.id,
      lifecycleState: "ROUTED",
    });

    const routed = await harness.prisma.inboundInteraction.findUnique({
      where: {
        id: interaction.id,
      },
    });

    assert.ok(routed, "Expected routed interaction");
    assert.equal(routed!.routeDecision, "REVENUE_BRAIN");

    const metadata = (routed!.metadata || {}) as Record<string, unknown>;
    const revenueBridge = (metadata.revenueBridge || {}) as Record<string, unknown>;
    assert.ok(
      typeof revenueBridge.queuedAt === "string" && revenueBridge.queuedAt,
      "Expected revenue bridge metadata checkpoint"
    );

    const queueAssignment = await harness.prisma.humanWorkQueue.findUnique({
      where: {
        interactionId: interaction.id,
      },
    });
    assert.equal(queueAssignment, null, "Revenue route should avoid human queue");

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
        String((job.data as any)?.messages?.[0]?.metadata?.interactionId || "") ===
        interaction.id
    );

    assert.ok(bridgeJob, "Expected bridge queue job enqueued");
    assert.equal(
      String((bridgeJob!.data as any).source || ""),
      "router",
      "Expected bridge-only enqueue source"
    );
  },
};
