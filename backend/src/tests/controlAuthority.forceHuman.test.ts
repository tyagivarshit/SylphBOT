import assert from "node:assert/strict";
import { resolveReceptionControlGate } from "../services/receptionContext.service";
import { createReceptionMemoryFixture, type TestCase } from "./reception.test.helpers";

export const controlAuthorityForceHumanTests: TestCase[] = [
  {
    name: "control authority forces human queue when consent is revoked",
    run: () => {
      const result = resolveReceptionControlGate({
        references: {
          consent: {
            status: "REVOKED",
            recordId: "consent_1",
          },
        },
      } as any);

      assert.equal(result.overrideRoute, "HUMAN_QUEUE");
      assert.deepEqual(result.reasons, ["consent_revoked"]);
    },
  },
  {
    name: "control authority forces owner or spam fail-closed on suppression and abuse",
    run: () => {
      const ownerResult = resolveReceptionControlGate({
        references: {
          consent: {
            status: "GRANTED",
            recordId: "consent_1",
          },
          leadControl: {
            cancelTokenVersion: 1,
            isHumanControlActive: false,
            manualSuppressUntil: new Date("2099-01-01T00:00:00.000Z"),
          },
        },
      } as any);
      const spamResult = resolveReceptionControlGate({
        references: {
          consent: {
            status: "GRANTED",
            recordId: "consent_1",
          },
        },
        receptionMemory: createReceptionMemoryFixture({
          abuseRisk: 99,
        }),
      } as any);

      assert.equal(ownerResult.overrideRoute, "OWNER");
      assert.equal(spamResult.overrideRoute, "SPAM_BIN");
    },
  },
];
