import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  assertNoDuplicateInteractions,
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
  waitForLifecycleState,
} from "../harness/helpers";

export const inboundReplayE2ESuite: IntegrationSuite = {
  name: "inbound.replay.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_inbound_replay_1";
    const senderId = "ig_sender_inbound_replay_1";

    const first = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "I want pricing info",
    });
    const second = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "I want pricing info",
    });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);

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

    await assertNoDuplicateInteractions({
      harness,
      externalInteractionKey,
    });

    const routedRows = await harness.prisma.inboundInteraction.count({
      where: {
        id: interaction.id,
        lifecycleState: "ROUTED",
      },
    });
    assert.equal(routedRows, 1, "Expected a single routed interaction row");

    const routedEvents = await harness.prisma.eventOutbox.findMany({
      where: {
        aggregateId: interaction.id,
        eventType: "inbound.routed",
      },
    });
    assert.equal(routedEvents.length, 1, "Expected one routed outbox event");
  },
};
