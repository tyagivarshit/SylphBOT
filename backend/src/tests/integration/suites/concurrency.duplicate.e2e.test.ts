import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";

export const concurrencyDuplicateE2ESuite: IntegrationSuite = {
  name: "concurrency.duplicate.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const headers = harness.withBypassHeaders({
      userId: tenant.userId,
      businessId: tenant.businessId,
    });
    const providerMessageId = "email_dup_provider_1";
    const externalInteractionKey = `inbound:${tenant.businessId}:EMAIL:EMAIL:${providerMessageId}`;

    await Promise.all(
      Array.from({ length: 8 }).map(() =>
        harness.httpPost(
          "/api/inbox/intake/email",
          {
            clientId: tenant.clientId,
            providerMessageId,
            messageId: providerMessageId,
            from: {
              email: "buyer@automexia.test",
              name: "Duplicate Buyer",
            },
            subject: "Pricing request",
            text: "Share pricing please",
          },
          {
            headers,
          }
        )
      )
    );

    const interaction = await harness.waitFor(
      "concurrency-duplicate-interaction",
      async () =>
        harness.prisma.inboundInteraction.findUnique({
          where: {
            externalInteractionKey,
          },
        })
    );

    await harness.waitFor("concurrency-duplicate-routed", async () => {
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

    const rows = await harness.prisma.inboundInteraction.findMany({
      where: {
        externalInteractionKey,
      },
    });
    assert.equal(rows.length, 1, "External interaction key uniqueness must win");

    const queues = await harness.prisma.humanWorkQueue.findMany({
      where: {
        interactionId: interaction.id,
      },
    });
    assert.ok(queues.length <= 1, "No duplicate queue assignment is allowed");
  },
};
