import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";
import {
  assertNoDuplicateInteractions,
  buildInstagramExternalInteractionKey,
  waitForInteractionByExternalKey,
  waitForLifecycleState,
} from "../harness/helpers";

export const workerRetryReplayE2ESuite: IntegrationSuite = {
  name: "worker.retry.replay.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const messageId = "ig_mid_worker_retry_replay_1";
    const senderId = "ig_sender_worker_retry_replay_1";
    const externalInteractionKey = buildInstagramExternalInteractionKey({
      businessId: tenant.businessId,
      messageId,
    });
    const {
      INBOUND_CLASSIFICATION_QUEUE,
      getReceptionRuntimeQueues,
    } = await import("../../../queues/receptionRuntime.queue");

    await harness.stopReceptionWorkers();
    const classificationQueue = getReceptionRuntimeQueues().find(
      (queue) => queue.name === INBOUND_CLASSIFICATION_QUEUE
    );
    await classificationQueue?.pause();

    await harness.startReceptionWorkers();

    const webhook = await harness.postInstagramMessageWebhook({
      pageId: tenant.pageId,
      senderId,
      messageId,
      messageText: "Need pricing and quote details",
    });
    assert.equal(webhook.statusCode, 200);

    const interaction = await waitForInteractionByExternalKey({
      harness,
      externalInteractionKey,
    });

    await waitForLifecycleState({
      harness,
      interactionId: interaction.id,
      lifecycleState: "NORMALIZED",
    });

    await harness.stopReceptionWorkers();
    await classificationQueue?.resume();
    await harness.startReceptionWorkers();

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
    assert.equal(routedRows, 1);
  },
};
