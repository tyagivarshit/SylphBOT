import assert from "node:assert/strict";
import type { IntegrationSuite } from "../harness/types";

export const malformedFailClosedE2ESuite: IntegrationSuite = {
  name: "malformed.failclosed.e2e.test",
  run: async (harness) => {
    await harness.flushAll();
    const tenant = await harness.seedTenant();
    const headers = harness.withBypassHeaders({
      userId: tenant.userId,
      businessId: tenant.businessId,
    });

    const response = await harness.httpPost(
      "/api/inbox/intake/email",
      {
        clientId: tenant.clientId,
        subject: "",
        text: "",
        message: "",
      },
      {
        headers,
      }
    );

    assert.equal(response.statusCode, 202);

    const interaction = await harness.waitFor(
      "malformed-failclosed-interaction",
      async () => {
        const row = await harness.prisma.inboundInteraction.findFirst({
          where: {
            businessId: tenant.businessId,
            channel: "EMAIL",
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        if (!row) {
          return null;
        }

        return row.lifecycleState === "FAILED" ? row : null;
      }
    );

    assert.equal(interaction.lifecycleState, "FAILED");
    assert.equal(interaction.routeDecision, "OWNER");

    const queueAssignment = await harness.prisma.humanWorkQueue.findUnique({
      where: {
        interactionId: interaction.id,
      },
    });

    assert.ok(queueAssignment, "Expected fail-closed human queue assignment");
    assert.ok(
      ["OWNER_REVIEW", "ESCALATION", "SUPPORT"].includes(
        String(queueAssignment!.queueType || "")
      ),
      "Expected escalation queue classification"
    );
  },
};
