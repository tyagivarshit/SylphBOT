import assert from "node:assert/strict";
import { classifyReceptionInteraction } from "../services/receptionClassifier.service";
import {
  createInboundInteractionFixture,
  createReceptionMemoryFixture,
  type TestCase,
} from "./reception.test.helpers";

export const receptionClassifierTests: TestCase[] = [
  {
    name: "reception classifier fail closes revoked-consent complaints to human review",
    run: () => {
      const interaction = createInboundInteractionFixture({
        interactionType: "REVIEW",
        normalizedPayload: {
          message: "I want a refund today. This is terrible service.",
        },
      });
      const classification = classifyReceptionInteraction({
        interaction,
        receptionMemory: createReceptionMemoryFixture({
          unresolvedCount: 2,
          complaintCount: 1,
        }),
        references: {
          consent: {
            status: "REVOKED",
            scope: "MESSAGING",
          },
        },
      });

      assert.equal(classification.intentClass, "COMPLAINT");
      assert.equal(classification.sentimentClass, "NEGATIVE");
      assert.equal(classification.routeHint, "HUMAN_QUEUE");
      assert.ok(["HIGH", "CRITICAL"].includes(classification.urgencyClass));
      assert.ok(classification.reasons.includes("consent_restricted_fail_closed"));
    },
  },
  {
    name: "reception classifier routes obvious spam to spam bin",
    run: () => {
      const interaction = createInboundInteractionFixture({
        normalizedPayload: {
          message: "FREE MONEY click here https://spam.test NOW NOW NOW",
        },
      });
      const classification = classifyReceptionInteraction({
        interaction,
      });

      assert.equal(classification.intentClass, "SPAM");
      assert.equal(classification.routeHint, "SPAM_BIN");
      assert.ok(classification.spamScore >= 0.85);
    },
  },
];
