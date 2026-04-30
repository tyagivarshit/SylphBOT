import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
} from "../harness/helpers";

export const dashboardProjectionE2ESuite: IntegrationSuite = {
  name: "dashboard.projection.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const headers = harness.withBypassHeaders({
      userId: tenant.userId,
      businessId: tenant.businessId,
    });
    const messageId = "ig_mid_dashboard_projection_1";
    const senderId = "ig_sender_dashboard_projection_1";
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });

    await harness.stopReceptionWorkers();
    await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Support escalation needed quickly",
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

    await harness.waitFor("dashboard-human-queue", async () => {
      const queue = await harness.prisma.humanWorkQueue.findUnique({
        where: {
          interactionId: interaction.id,
        },
      });

      return queue || null;
    });

    await harness.httpPost(`/__integration__/interaction/${interaction.id}/progress`, {
      actorId: tenant.userId,
    });
    await harness.httpPost(`/__integration__/interaction/${interaction.id}/resolve`, {
      actorId: tenant.userId,
      resolutionCode: "RESOLVED_FOR_PROJECTION",
      resolutionScore: 88,
    });
    await harness.httpPost(`/__integration__/interaction/${interaction.id}/reopen`, {
      actorId: tenant.userId,
      reason: "projection_replay_check",
    });

    const firstProjection = await harness.httpGet(
      "/api/inbox/intake/dashboard-feed",
      {
        headers,
      }
    );
    const secondProjection = await harness.httpGet(
      "/api/inbox/intake/dashboard-feed",
      {
        headers,
      }
    );

    assert.equal(firstProjection.statusCode, 200);
    assert.equal(secondProjection.statusCode, 200);
    assert.equal(firstProjection.body.success, true);
    assert.equal(secondProjection.body.success, true);
    assert.deepEqual(
      firstProjection.body.data,
      secondProjection.body.data,
      "Projection rebuild should remain deterministic under replay"
    );
  },
};
