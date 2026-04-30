import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
} from "../harness/helpers";

export const humanTakeoverE2ESuite: IntegrationSuite = {
  name: "human.takeover.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_human_takeover_1";
    const senderId = "ig_sender_human_takeover_1";
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });

    await harness.stopReceptionWorkers();

    const webhook = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "I want to purchase this plan today",
    });
    assert.equal(webhook.statusCode, 200);

    const interaction = await waitForInteractionByExternalKey({
      harness,
      externalInteractionKey,
    });

    await harness.prisma.leadControlState.upsert({
      where: {
        leadId: interaction.leadId,
      },
      update: {
        cancelTokenVersion: {
          increment: 1,
        },
        manualSuppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastHumanTakeoverAt: new Date(),
      },
      create: {
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        cancelTokenVersion: 1,
        manualSuppressUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastHumanTakeoverAt: new Date(),
      },
    });

    await harness.startReceptionWorkers();

    const routed = await harness.waitFor("human-takeover-routed", async () => {
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
      )
    );

    const queue = await harness.prisma.humanWorkQueue.findUnique({
      where: {
        interactionId: interaction.id,
      },
    });

    assert.ok(queue, "Expected forced human assignment during takeover");
  },
};
