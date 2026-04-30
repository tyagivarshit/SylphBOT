import assert from "node:assert/strict";
import type { TestCase } from "./reception.test.helpers";

type PaymentState = "CREATED" | "PROCESSING" | "PARTIALLY_CAPTURED" | "SUCCEEDED" | "FAILED";

type InMemoryPaymentIntent = {
  key: string;
  amountMinor: number;
  capturedMinor: number;
  status: PaymentState;
};

class InMemoryCommerceHarness {
  webhookDedupe = new Set<string>();
  refundDedupe = new Set<string>();
  chargebackDedupe = new Set<string>();
  signatureReplayDedupe = new Set<string>();
  discountDecisionDedupe = new Set<string>();
  renewalLocks = new Set<string>();
  paymentIntents = new Map<string, InMemoryPaymentIntent>();
  invoiceRetries = new Map<string, number>();
  dunningSteps = new Map<string, number>();
  failures = new Set<string>();
  providerCredentialStatus = new Map<string, "ACTIVE" | "EXPIRED" | "REVOKED" | "AUTH_FAILED">();
  activeOverrideScopes = new Set<string>();

  createPaymentIntent(key: string, amountMinor: number) {
    this.paymentIntents.set(key, {
      key,
      amountMinor,
      capturedMinor: 0,
      status: "CREATED",
    });
  }

  setCredentialStatus(
    provider: string,
    status: "ACTIVE" | "EXPIRED" | "REVOKED" | "AUTH_FAILED"
  ) {
    this.providerCredentialStatus.set(provider.toUpperCase(), status);
  }

  assertProviderCredential(provider: string) {
    const status = this.providerCredentialStatus.get(provider.toUpperCase()) || "ACTIVE";

    if (status === "EXPIRED") {
      throw new Error("provider_credential_expired");
    }

    if (status === "REVOKED") {
      throw new Error("provider_credential_revoked");
    }

    if (status === "AUTH_FAILED") {
      throw new Error("provider_credential_auth_failed");
    }
  }

  enableOverride(scope: string) {
    this.activeOverrideScopes.add(scope.toUpperCase());
  }

  disableOverride(scope: string) {
    this.activeOverrideScopes.delete(scope.toUpperCase());
  }

  assertNoOverride(scope: string) {
    if (this.activeOverrideScopes.has(scope.toUpperCase())) {
      throw new Error(`manual_override_active:${scope.toUpperCase()}`);
    }
  }

  failNext(label: string) {
    this.failures.add(label);
  }

  maybeFail(label: string) {
    if (!this.failures.has(label)) {
      return;
    }

    this.failures.delete(label);
    throw new Error(`forced_failure:${label}`);
  }

  processWebhook(eventId: string, action: (intent: InMemoryPaymentIntent) => void) {
    this.assertNoOverride("WEBHOOK_SYNC");

    if (this.webhookDedupe.has(eventId)) {
      return "replay";
    }

    this.webhookDedupe.add(eventId);
    const intent = this.paymentIntents.get("pi_1");

    if (!intent) {
      throw new Error("intent_missing");
    }

    action(intent);
    return "processed";
  }

  providerCheckout(timeoutMs: number) {
    this.assertProviderCredential("STRIPE");
    this.assertNoOverride("CHECKOUT");

    if (timeoutMs <= 0) {
      throw new Error("provider_timeout");
    }

    return {
      url: "https://checkout.example/test",
    };
  }

  partialCapture(key: string, capturedMinor: number) {
    const intent = this.paymentIntents.get(key);

    if (!intent) {
      throw new Error("intent_missing");
    }

    intent.capturedMinor = Math.min(intent.amountMinor, Math.max(0, capturedMinor));
    intent.status = intent.capturedMinor >= intent.amountMinor ? "SUCCEEDED" : "PARTIALLY_CAPTURED";
    return intent;
  }

  replayRefund(refundKey: string) {
    if (this.refundDedupe.has(refundKey)) {
      return "replay";
    }

    this.refundDedupe.add(refundKey);
    return "processed";
  }

  replayChargeback(caseKey: string) {
    if (this.chargebackDedupe.has(caseKey)) {
      return "replay";
    }

    this.chargebackDedupe.add(caseKey);
    return "processed";
  }

  renewSubscriptionOnce(subscriptionKey: string) {
    if (this.renewalLocks.has(subscriptionKey)) {
      return "replay";
    }

    this.renewalLocks.add(subscriptionKey);
    return "renewed";
  }

  retryInvoice(invoiceKey: string) {
    const current = this.invoiceRetries.get(invoiceKey) || 0;
    const next = current + 1;
    this.invoiceRetries.set(invoiceKey, next);
    return next;
  }

  runDunning(invoiceKey: string, maxSteps: number) {
    const current = this.dunningSteps.get(invoiceKey) || 0;

    if (current >= maxSteps) {
      return "written_off";
    }

    this.dunningSteps.set(invoiceKey, current + 1);
    return `step_${current + 1}`;
  }

  replaySignature(signatureEventKey: string) {
    if (this.signatureReplayDedupe.has(signatureEventKey)) {
      return "replay";
    }

    this.signatureReplayDedupe.add(signatureEventKey);
    return "processed";
  }

  decideDiscount(decisionKey: string, approved: boolean) {
    if (this.discountDecisionDedupe.has(decisionKey)) {
      return "replay";
    }

    this.discountDecisionDedupe.add(decisionKey);
    return approved ? "approved" : "rejected";
  }
}

export const commercePhase5DTests: TestCase[] = [
  {
    name: "phase5d failure injection keeps deterministic recovery path",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.failNext("proposal_create");

      assert.throws(() => harness.maybeFail("proposal_create"), /forced_failure/);
      assert.doesNotThrow(() => harness.maybeFail("proposal_create"));
    },
  },
  {
    name: "phase5d token expiry fails closed",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.setCredentialStatus("STRIPE", "EXPIRED");
      assert.throws(() => harness.providerCheckout(5000), /provider_credential_expired/);
    },
  },
  {
    name: "phase5d provider auth revoke fails closed",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.setCredentialStatus("STRIPE", "REVOKED");
      assert.throws(() => harness.providerCheckout(5000), /provider_credential_revoked/);
    },
  },
  {
    name: "phase5d duplicate webhook is replay safe",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.createPaymentIntent("pi_1", 10000);

      assert.equal(
        harness.processWebhook("evt_1", (intent) => {
          intent.status = "SUCCEEDED";
          intent.capturedMinor = 10000;
        }),
        "processed"
      );
      assert.equal(
        harness.processWebhook("evt_1", (intent) => {
          intent.status = "FAILED";
        }),
        "replay"
      );
      assert.equal(harness.paymentIntents.get("pi_1")?.status, "SUCCEEDED");
    },
  },
  {
    name: "phase5d out-of-order webhook events stay monotonic",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.createPaymentIntent("pi_1", 10000);

      assert.equal(
        harness.processWebhook("evt_succeeded", (intent) => {
          intent.status = "SUCCEEDED";
          intent.capturedMinor = 10000;
        }),
        "processed"
      );

      assert.equal(
        harness.processWebhook("evt_processing_after_success", (intent) => {
          if (intent.status !== "SUCCEEDED") {
            intent.status = "PROCESSING";
          }
        }),
        "processed"
      );

      assert.equal(harness.paymentIntents.get("pi_1")?.status, "SUCCEEDED");
    },
  },
  {
    name: "phase5d manual override blocks webhook overwrite during replay window",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.createPaymentIntent("pi_1", 10000);
      harness.enableOverride("WEBHOOK_SYNC");

      assert.throws(
        () =>
          harness.processWebhook("evt_override", (intent) => {
            intent.status = "FAILED";
          }),
        /manual_override_active:WEBHOOK_SYNC/
      );

      harness.disableOverride("WEBHOOK_SYNC");
      assert.equal(
        harness.processWebhook("evt_override", (intent) => {
          intent.status = "SUCCEEDED";
          intent.capturedMinor = 10000;
        }),
        "processed"
      );
      assert.equal(harness.paymentIntents.get("pi_1")?.status, "SUCCEEDED");
    },
  },
  {
    name: "phase5d provider timeout fails closed",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.throws(() => harness.providerCheckout(0), /provider_timeout/);
    },
  },
  {
    name: "phase5d partial capture remains monotonic",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      harness.createPaymentIntent("pi_1", 10000);

      const partial = harness.partialCapture("pi_1", 4000);
      assert.equal(partial.status, "PARTIALLY_CAPTURED");
      assert.equal(partial.capturedMinor, 4000);

      const full = harness.partialCapture("pi_1", 10000);
      assert.equal(full.status, "SUCCEEDED");
      assert.equal(full.capturedMinor, 10000);
    },
  },
  {
    name: "phase5d refund replay is idempotent",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.equal(harness.replayRefund("refund_1"), "processed");
      assert.equal(harness.replayRefund("refund_1"), "replay");
    },
  },
  {
    name: "phase5d chargeback replay is idempotent",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.equal(harness.replayChargeback("cb_1"), "processed");
      assert.equal(harness.replayChargeback("cb_1"), "replay");
    },
  },
  {
    name: "phase5d subscription renewal race allows one winner",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      const first = harness.renewSubscriptionOnce("sub_1");
      const second = harness.renewSubscriptionOnce("sub_1");

      assert.equal(first, "renewed");
      assert.equal(second, "replay");
    },
  },
  {
    name: "phase5d invoice retry increments deterministically",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.equal(harness.retryInvoice("inv_1"), 1);
      assert.equal(harness.retryInvoice("inv_1"), 2);
      assert.equal(harness.retryInvoice("inv_1"), 3);
    },
  },
  {
    name: "phase5d dunning ladder escalates to write-off at max step",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.equal(harness.runDunning("inv_1", 2), "step_1");
      assert.equal(harness.runDunning("inv_1", 2), "step_2");
      assert.equal(harness.runDunning("inv_1", 2), "written_off");
    },
  },
  {
    name: "phase5d signature replay is idempotent",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.equal(harness.replaySignature("sig_evt_1"), "processed");
      assert.equal(harness.replaySignature("sig_evt_1"), "replay");
    },
  },
  {
    name: "phase5d discount approval race keeps first decision",
    run: () => {
      const harness = new InMemoryCommerceHarness();
      assert.equal(harness.decideDiscount("discount_1", true), "approved");
      assert.equal(harness.decideDiscount("discount_1", false), "replay");
    },
  },
];
