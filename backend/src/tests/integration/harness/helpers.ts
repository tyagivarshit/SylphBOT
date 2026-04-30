import assert from "node:assert/strict";
import type { InboundLifecycleState } from "../../../services/reception.shared";
import type { IntegrationHarness } from "./types";

export const buildInstagramExternalInteractionKey = ({
  businessId,
  messageId,
}: {
  businessId: string;
  messageId: string;
}) => `inbound:${businessId}:INSTAGRAM:DM:${messageId}`;

export const waitForInteractionByExternalKey = async ({
  harness,
  externalInteractionKey,
}: {
  harness: IntegrationHarness;
  externalInteractionKey: string;
}) =>
  harness.waitFor(
    `interaction:${externalInteractionKey}`,
    async () =>
      harness.prisma.inboundInteraction.findUnique({
        where: {
          externalInteractionKey,
        },
      })
  );

export const waitForLifecycleState = async ({
  harness,
  interactionId,
  lifecycleState,
}: {
  harness: IntegrationHarness;
  interactionId: string;
  lifecycleState: InboundLifecycleState;
}) =>
  harness.waitFor(
    `lifecycle:${interactionId}:${lifecycleState}`,
    async () => {
      const interaction = await harness.prisma.inboundInteraction.findUnique({
        where: {
          id: interactionId,
        },
      });

      if (!interaction) {
        return null;
      }

      return interaction.lifecycleState === lifecycleState ? interaction : null;
    }
  );

export const waitForOutboxEvents = async ({
  harness,
  aggregateId,
  eventTypes,
  minimumCount,
}: {
  harness: IntegrationHarness;
  aggregateId: string;
  eventTypes: string[];
  minimumCount: number;
}) =>
  harness.waitFor(
    `outbox:${aggregateId}:${eventTypes.join(",")}`,
    async () => {
      const rows = await harness.prisma.eventOutbox.findMany({
        where: {
          aggregateId,
          eventType: {
            in: eventTypes,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return rows.length >= minimumCount ? rows : null;
    }
  );

export const assertNoDuplicateInteractions = async ({
  harness,
  externalInteractionKey,
}: {
  harness: IntegrationHarness;
  externalInteractionKey: string;
}) => {
  const rows = await harness.prisma.inboundInteraction.findMany({
    where: {
      externalInteractionKey,
    },
  });

  assert.equal(rows.length, 1, "Expected exactly one canonical interaction row");
};
