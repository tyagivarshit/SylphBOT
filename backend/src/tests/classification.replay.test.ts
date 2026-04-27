import assert from "node:assert/strict";
import {
  createReceptionClassifierService,
  type InboundClassificationRepository,
  type ReceptionClassification,
} from "../services/receptionClassifier.service";
import type { InboundInteractionAuthorityRecord } from "../services/reception.shared";
import {
  createInboundInteractionFixture,
  createReceptionEventCollector,
  type TestCase,
} from "./reception.test.helpers";

const createInMemoryClassificationRepository = (
  interaction: InboundInteractionAuthorityRecord
) => {
  let current = {
    ...interaction,
  };

  const repository: InboundClassificationRepository = {
    applyClassification: async ({
      classification,
    }: {
      interactionId: string;
      classification: ReceptionClassification;
    }) => {
      current = {
        ...current,
        lifecycleState: "CLASSIFIED",
        intentClass: classification.intentClass,
        urgencyClass: classification.urgencyClass,
        sentimentClass: classification.sentimentClass,
        spamScore: classification.spamScore,
      };

      return current;
    },
  };

  return {
    repository,
    getCurrent: () => current,
  };
};

export const classificationReplayTests: TestCase[] = [
  {
    name: "classification replay keeps one canonical classified result",
    run: async () => {
      const interaction = createInboundInteractionFixture({
        lifecycleState: "NORMALIZED",
        normalizedPayload: {
          channel: "WHATSAPP",
          sender: {
            externalId: "+919999999999",
            displayName: "Aarav",
            phone: "+919999999999",
            email: null,
            handle: null,
          },
          message: "Need refund urgently",
          attachments: [],
          language: "en",
          rawIntentHint: null,
          receivedAt: "2026-04-27T10:00:00.000Z",
          providerMessageId: "wamid.1",
          threadId: "thread_1",
          metadata: {},
        },
      });
      const repository = createInMemoryClassificationRepository(interaction);
      const collector = createReceptionEventCollector();
      const service = createReceptionClassifierService({
        repository: repository.repository,
        eventWriter: collector.writer,
      });

      const first = await service.applyClassification({
        interaction,
      });
      const second = await service.applyClassification({
        interaction: repository.getCurrent(),
      });

      assert.equal(first.interaction.intentClass, "BILLING");
      assert.equal(second.interaction.intentClass, "BILLING");
      assert.equal(repository.getCurrent().lifecycleState, "CLASSIFIED");
      assert.equal(collector.events.length, 1);
      assert.equal(collector.events[0].type, "inbound.classified");
    },
  },
];
