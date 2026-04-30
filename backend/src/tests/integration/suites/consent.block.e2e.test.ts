import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
} from "../harness/helpers";

export const consentBlockE2ESuite: IntegrationSuite = {
  name: "consent.block.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_consent_block_1";
    const senderId = "ig_sender_consent_block_1";
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });

    await harness.stopReceptionWorkers();

    const webhook = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Can you share pricing now?",
    });
    assert.equal(webhook.statusCode, 200);

    const interaction = await waitForInteractionByExternalKey({
      harness,
      externalInteractionKey,
    });
    assert.equal(interaction.lifecycleState, "RECEIVED");

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

    const routed = await harness.waitFor("consent-block-routed", async () => {
      const row = await harness.prisma.inboundInteraction.findUnique({
        where: {
          id: interaction.id,
        },
      });

      if (!row) {
        return null;
      }

      return row.lifecycleState === "ROUTED" ? row : null;
    });

    assert.notEqual(routed.routeDecision, "REVENUE_BRAIN");
    assert.ok(
      ["HUMAN_QUEUE", "OWNER", "ESCALATION"].includes(
        String(routed.routeDecision || "")
      ),
      "Expected consent gate to force a human route"
    );

    const queue = await harness.prisma.humanWorkQueue.findUnique({
      where: {
        interactionId: interaction.id,
      },
    });
    assert.ok(queue, "Expected human queue assignment when consent is revoked");

    const { getAIQueues } = await import("../../../queues/ai.queue");
    const [aiQueue] = getAIQueues();
    const aiJobs = await aiQueue.getJobs(
      ["waiting", "delayed", "active", "completed"],
      0,
      100,
      false
    );
    const aiBridgeJob = aiJobs.find(
      (job) =>
        String((job.data as any)?.messages?.[0]?.metadata?.interactionId || "") ===
        interaction.id
    );
    assert.equal(aiBridgeJob, undefined, "Revenue Brain queue should stay blocked");
  },
};
