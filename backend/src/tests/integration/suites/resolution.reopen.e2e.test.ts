import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
} from "../harness/helpers";

export const resolutionReopenE2ESuite: IntegrationSuite = {
  name: "resolution.reopen.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_resolution_reopen_1";
    const senderId = "ig_sender_resolution_reopen_1";
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });

    await harness.stopReceptionWorkers();
    await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Need help with a support issue",
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

    await harness.waitFor("resolution-human-queue", async () => {
      const queue = await harness.prisma.humanWorkQueue.findUnique({
        where: {
          interactionId: interaction.id,
        },
      });

      return queue || null;
    });

    const progress = await harness.httpPost(
      `/__integration__/interaction/${interaction.id}/progress`,
      {
        actorId: tenant.userId,
      }
    );
    assert.equal(progress.statusCode, 200);
    assert.equal(progress.body.lifecycleState, "IN_PROGRESS");

    const firstResolve = await harness.httpPost(
      `/__integration__/interaction/${interaction.id}/resolve`,
      {
        actorId: tenant.userId,
        resolutionCode: "RESOLVED_FIRST_PASS",
        resolutionScore: 91,
      }
    );
    assert.equal(firstResolve.statusCode, 200);
    assert.equal(firstResolve.body.lifecycleState, "RESOLVED");

    const reopen = await harness.httpPost(
      `/__integration__/interaction/${interaction.id}/reopen`,
      {
        actorId: tenant.userId,
        reason: "customer_follow_up",
      }
    );
    assert.equal(reopen.statusCode, 200);
    assert.equal(reopen.body.lifecycleState, "REOPENED");

    const secondResolve = await harness.httpPost(
      `/__integration__/interaction/${interaction.id}/resolve`,
      {
        actorId: tenant.userId,
        resolutionCode: "RESOLVED_SECOND_PASS",
        resolutionScore: 93,
      }
    );
    assert.equal(secondResolve.statusCode, 200);
    assert.equal(secondResolve.body.lifecycleState, "RESOLVED");

    const outboxRows = await harness.prisma.eventOutbox.findMany({
      where: {
        aggregateId: interaction.id,
        eventType: {
          in: ["interaction.resolved", "interaction.reopened"],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const events = outboxRows.map((row) => row.eventType);
    assert.ok(events.includes("interaction.resolved"));
    assert.ok(events.includes("interaction.reopened"));

    const persisted = await harness.prisma.inboundInteraction.findUnique({
      where: {
        id: interaction.id,
      },
    });
    assert.equal(persisted?.lifecycleState, "RESOLVED");
  },
};
