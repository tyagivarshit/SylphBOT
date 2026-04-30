import {
  CommerceProvider,
  PaymentAttemptStatus,
  PaymentIntentStatus,
  Prisma,
} from "@prisma/client";
import prisma from "../config/prisma";
import { publishCommerceEvent } from "./commerceEvent.service";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { commerceProviderRegistry } from "./commerce/providers/commerceProviderRegistry.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import type { ProviderWebhookEvent } from "./commerce/providers/commerceProvider.types";
import {
  PAYMENT_ATTEMPT_TRANSITIONS,
  PAYMENT_INTENT_TRANSITIONS,
  assertTransition,
  buildDeterministicDigest,
  buildLedgerKey,
  mergeMetadata,
  normalizeActor,
  normalizeProvider,
  toMinor,
} from "./commerce/shared";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const mapProviderEventToIntentStatus = (
  event: ProviderWebhookEvent
): PaymentIntentStatus | null => {
  switch (event.type) {
    case "payment_intent.processing":
      return "PROCESSING";
    case "payment_intent.partially_captured":
      return "PARTIALLY_CAPTURED";
    case "payment_intent.succeeded":
      return "SUCCEEDED";
    case "payment_intent.failed":
      return "FAILED";
    case "checkout.completed":
      return "PROCESSING";
    default:
      return null;
  }
};

const mapProviderEventToAttemptStatus = (
  event: ProviderWebhookEvent
): PaymentAttemptStatus => {
  switch (event.type) {
    case "payment_intent.processing":
    case "checkout.completed":
      return "PROCESSING";
    case "payment_intent.partially_captured":
      return "PROCESSING";
    case "payment_intent.succeeded":
      return "SUCCEEDED";
    case "payment_intent.failed":
      return "FAILED";
    default:
      return "PROCESSING";
  }
};

export const createPaymentIntentService = () => {
  const createCheckout = async ({
    businessId,
    proposalKey,
    provider = "INTERNAL",
    source = "SELF",
    description = "Automexia checkout",
    successUrl = null,
    cancelUrl = null,
    metadata = null,
    idempotencyKey = null,
  }: {
    businessId: string;
    proposalKey: string;
    provider?: string;
    source?: string;
    description?: string;
    successUrl?: string | null;
    cancelUrl?: string | null;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) => {
    const proposal = await prisma.proposalLedger.findFirst({
      where: {
        businessId,
        proposalKey,
      },
    });

    if (!proposal) {
      throw new Error("proposal_not_found");
    }

    if (!["APPROVED", "SENT", "ACCEPTED", "CONTRACT_GENERATED"].includes(proposal.status)) {
      throw new Error(`proposal_not_checkout_ready:${proposal.status}`);
    }
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
      leadId: proposal.leadId || null,
    }).catch(() => null);
    const chargebackRisk = Number(runtime?.predictions.chargeback_risk || 0);
    const fraudRisk = Number(runtime?.predictions.fraud_risk || 0);
    const riskGate = Math.max(
      0.1,
      Math.min(0.95, Number(runtime?.controls.commerce.chargebackRiskGate || 0.72))
    );

    if (
      chargebackRisk >= riskGate ||
      fraudRisk >= riskGate ||
      Boolean(runtime?.anomalies.critical.includes("chargeback_spike")) ||
      String(runtime?.overrideScopes.CHECKOUT_PAUSE?.action || "") === "PAUSE"
    ) {
      throw new Error("checkout_manual_review_required");
    }

    const normalizedProvider = normalizeProvider(provider);
    await commerceAuthorityService.assertNoActiveManualOverride({
      businessId,
      scope: "CHECKOUT",
      provider: normalizedProvider,
    });
    await commerceAuthorityService.resolveProviderCredential({
      businessId,
      provider: normalizedProvider,
    }).catch(() => {
      if (normalizedProvider === "INTERNAL") {
        return null;
      }

      throw new Error(`provider_credential_unavailable:${normalizedProvider}`);
    });
    const adapter = commerceProviderRegistry.resolve(normalizedProvider);
    const normalizedIdempotency =
      String(idempotencyKey || "").trim() ||
      buildDeterministicDigest({
        businessId,
        proposalKey,
        provider: normalizedProvider,
        amount: proposal.totalMinor,
      });

    const existing = await prisma.paymentIntentLedger.findUnique({
      where: {
        idempotencyKey: normalizedIdempotency,
      },
    });

    if (existing) {
      return existing;
    }

    const paymentIntent = await prisma.paymentIntentLedger.create({
      data: {
        businessId,
        proposalId: proposal.id,
        paymentIntentKey: buildLedgerKey("payment_intent"),
        provider: normalizedProvider,
        status: "CREATED",
        source: normalizeActor(source),
        amountMinor: toMinor(proposal.totalMinor),
        currency: proposal.currency,
        metadata: mergeMetadata(
          {
            proposalKey,
            description,
          },
          metadata || undefined
        ) as Prisma.InputJsonValue,
        idempotencyKey: normalizedIdempotency,
      },
    });

    await publishCommerceEvent({
      event: "commerce.payment_intent.created",
      businessId,
      aggregateType: "payment_intent_ledger",
      aggregateId: paymentIntent.id,
      eventKey: paymentIntent.paymentIntentKey,
      payload: {
        businessId,
        proposalId: proposal.id,
        proposalKey,
        paymentIntentId: paymentIntent.id,
        paymentIntentKey: paymentIntent.paymentIntentKey,
        provider: normalizedProvider,
        amountMinor: paymentIntent.amountMinor,
        currency: paymentIntent.currency,
      },
    });

    try {
      const checkout = await adapter.createCheckout({
        businessId,
        paymentIntentKey: paymentIntent.paymentIntentKey,
        amountMinor: paymentIntent.amountMinor,
        currency: paymentIntent.currency,
        description,
        successUrl,
        cancelUrl,
        metadata: {
          proposalKey,
          paymentIntentId: paymentIntent.id,
          paymentIntentKey: paymentIntent.paymentIntentKey,
          ...(metadata || {}),
        },
      });

      const updated = await prisma.paymentIntentLedger.update({
        where: {
          id: paymentIntent.id,
        },
        data: {
          providerPaymentIntentId: checkout.providerPaymentIntentId,
          checkoutUrl: checkout.checkoutUrl,
          checkoutExpiresAt: checkout.expiresAt || null,
          status: checkout.status,
          metadata: mergeMetadata(paymentIntent.metadata, {
            providerMetadata: checkout.metadata || null,
          }) as Prisma.InputJsonValue,
        },
      });

      await prisma.paymentAttemptLedger.create({
        data: {
          businessId,
          paymentIntentId: updated.id,
          attemptKey: buildLedgerKey("payment_attempt"),
          provider: updated.provider,
          providerEventId: checkout.providerPaymentIntentId,
          status: "INITIATED",
          amountMinor: updated.amountMinor,
          currency: updated.currency,
          metadata: {
            checkoutUrl: updated.checkoutUrl,
          } as Prisma.InputJsonValue,
          idempotencyKey: buildDeterministicDigest({
            paymentIntentId: updated.id,
            providerEventId: checkout.providerPaymentIntentId,
            status: "INITIATED",
          }),
        },
      });

      if (paymentIntent.status !== updated.status) {
        await publishCommerceEvent({
          event: "commerce.payment_intent.status_changed",
          businessId,
          aggregateType: "payment_intent_ledger",
          aggregateId: updated.id,
          eventKey: `${updated.paymentIntentKey}:${paymentIntent.status}:${updated.status}`,
          payload: {
            businessId,
            paymentIntentId: updated.id,
            paymentIntentKey: updated.paymentIntentKey,
            provider: updated.provider,
            from: paymentIntent.status,
            to: updated.status,
            checkoutUrl: updated.checkoutUrl,
          },
        });
      }

      return updated;
    } catch (error) {
      await prisma.paymentIntentLedger.update({
        where: {
          id: paymentIntent.id,
        },
        data: {
          status: "FAILED",
          metadata: mergeMetadata(paymentIntent.metadata, {
            providerError: String((error as any)?.message || error),
          }) as Prisma.InputJsonValue,
        },
      });

      throw error;
    }
  };

  const transitionPaymentIntentStatus = async ({
    paymentIntentId,
    nextStatus,
    capturedMinor,
    metadata,
  }: {
    paymentIntentId: string;
    nextStatus: PaymentIntentStatus;
    capturedMinor?: number | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const paymentIntent = await prisma.paymentIntentLedger.findUnique({
      where: {
        id: paymentIntentId,
      },
    });

    if (!paymentIntent) {
      throw new Error("payment_intent_not_found");
    }

    assertTransition({
      current: paymentIntent.status,
      next: nextStatus,
      transitions: PAYMENT_INTENT_TRANSITIONS,
      scope: "payment_intent",
    });

    const updated = await prisma.paymentIntentLedger.update({
      where: {
        id: paymentIntent.id,
      },
      data: {
        status: nextStatus,
        capturedMinor:
          capturedMinor !== null && capturedMinor !== undefined
            ? Math.max(0, Math.floor(capturedMinor))
            : paymentIntent.capturedMinor,
        metadata: mergeMetadata(paymentIntent.metadata, metadata || undefined) as Prisma.InputJsonValue,
      },
    });

    await publishCommerceEvent({
      event: "commerce.payment_intent.status_changed",
      businessId: updated.businessId,
      aggregateType: "payment_intent_ledger",
      aggregateId: updated.id,
      eventKey: `${updated.paymentIntentKey}:${paymentIntent.status}:${nextStatus}`,
      payload: {
        businessId: updated.businessId,
        paymentIntentId: updated.id,
        paymentIntentKey: updated.paymentIntentKey,
        from: paymentIntent.status,
        to: nextStatus,
        providerPaymentIntentId: updated.providerPaymentIntentId,
      },
    });

    return updated;
  };

  const reconcileParsedProviderWebhook = async ({
    event,
  }: {
    event: ProviderWebhookEvent;
  }) => {
    const normalized = event;
    const attemptDedupeKey = buildDeterministicDigest({
      provider: normalized.provider,
      providerEventId: normalized.providerEventId,
      type: normalized.type,
    });

    const existingAttempt = await prisma.paymentAttemptLedger.findUnique({
      where: {
        idempotencyKey: attemptDedupeKey,
      },
    });

    if (existingAttempt) {
      return {
        event: normalized,
        replay: true,
      };
    }

    let paymentIntent = null as any;

    if (normalized.providerPaymentIntentId) {
      paymentIntent = await prisma.paymentIntentLedger.findFirst({
        where: {
          OR: [
            {
              providerPaymentIntentId: normalized.providerPaymentIntentId,
            },
            {
              paymentIntentKey: normalized.providerPaymentIntentId,
            },
          ],
        },
      });
    }

    if (!paymentIntent) {
      const raw = toRecord(normalized.rawPayload);
      const metadata = toRecord(raw.metadata);
      const paymentIntentKey = String(metadata.paymentIntentKey || raw.paymentIntentKey || "").trim();

      if (paymentIntentKey) {
        paymentIntent = await prisma.paymentIntentLedger.findFirst({
          where: {
            paymentIntentKey,
          },
        });
      }
    }

    if (!paymentIntent) {
      return {
        event: normalized,
        replay: false,
        unmatched: true,
      };
    }

    await commerceAuthorityService
      .resolveProviderCredential({
        businessId: paymentIntent.businessId,
        provider: normalized.provider,
      })
      .catch(() => {
        if (normalized.provider === "INTERNAL") {
          return null;
        }

        throw new Error(`provider_credential_blocked:${normalized.provider}`);
      });

    const override = await commerceAuthorityService.getActiveManualOverride({
      businessId: paymentIntent.businessId,
      scope: "WEBHOOK_SYNC",
      provider: normalized.provider,
    });

    if (override) {
      return {
        event: normalized,
        replay: false,
        unmatched: false,
        overrideLocked: true,
        override: {
          scope: override.scope,
          reason: override.reason,
          expiresAt: override.expiresAt?.toISOString() || null,
          priority: override.priority,
        },
      };
    }

    const attemptStatus = mapProviderEventToAttemptStatus(normalized);
    await prisma.paymentAttemptLedger.create({
      data: {
        businessId: paymentIntent.businessId,
        paymentIntentId: paymentIntent.id,
        attemptKey: buildLedgerKey("payment_attempt"),
        provider: normalizeProvider(normalized.provider),
        providerEventId: normalized.providerEventId,
        status: attemptStatus,
        amountMinor:
          normalized.amountMinor === null || normalized.amountMinor === undefined
            ? paymentIntent.amountMinor
            : Math.max(0, Math.floor(Number(normalized.amountMinor))),
        currency: normalized.currency || paymentIntent.currency,
        attemptedAt: normalized.occurredAt,
        settledAt: attemptStatus === "SUCCEEDED" ? normalized.occurredAt : null,
        errorMessage:
          attemptStatus === "FAILED"
            ? String(toRecord(normalized.metadata).reason || "provider_failed")
            : null,
        metadata: normalized.rawPayload as Prisma.InputJsonValue,
        idempotencyKey: attemptDedupeKey,
      },
    });

    await publishCommerceEvent({
      event: "commerce.payment_attempt.status_changed",
      businessId: paymentIntent.businessId,
      aggregateType: "payment_attempt_ledger",
      aggregateId: paymentIntent.id,
      eventKey: normalized.providerEventId,
      payload: {
        businessId: paymentIntent.businessId,
        paymentIntentId: paymentIntent.id,
        providerEventId: normalized.providerEventId,
        attemptStatus,
        providerType: normalized.type,
      },
    });

    const nextStatus = mapProviderEventToIntentStatus(normalized);

    if (nextStatus) {
      try {
        await transitionPaymentIntentStatus({
          paymentIntentId: paymentIntent.id,
          nextStatus,
          capturedMinor:
            nextStatus === "SUCCEEDED"
              ? normalized.amountMinor || paymentIntent.amountMinor
              : undefined,
          metadata: {
            lastWebhookProviderEventId: normalized.providerEventId,
            lastWebhookType: normalized.type,
          },
        });
      } catch {
        // keep replay-safe semantics: do not throw on monotonic reject
      }
    }

    await publishCommerceEvent({
      event: "commerce.webhook.reconciled",
      businessId: paymentIntent.businessId,
      aggregateType: "payment_intent_ledger",
      aggregateId: paymentIntent.id,
      eventKey: normalized.providerEventId,
      payload: {
        businessId: paymentIntent.businessId,
        paymentIntentId: paymentIntent.id,
        provider: normalized.provider,
        providerEventId: normalized.providerEventId,
        providerType: normalized.type,
      },
    });

    return {
      event: normalized,
      replay: false,
      unmatched: false,
    };
  };

  const reconcileProviderWebhook = async ({
    provider,
    headers = null,
    body,
  }: {
    provider?: string | null;
    headers?: Record<string, unknown> | null;
    body: unknown;
  }) => {
    const normalized = await commerceProviderRegistry.parseWebhook({
      provider,
      headers,
      body,
    });

    return reconcileParsedProviderWebhook({
      event: normalized,
    });
  };

  const markTimedOutAttempts = async ({
    olderThanMinutes = 20,
  }: {
    olderThanMinutes?: number;
  } = {}) => {
    const cutoff = new Date(Date.now() - Math.max(1, olderThanMinutes) * 60_000);
    const attempts = await prisma.paymentAttemptLedger.findMany({
      where: {
        status: {
          in: ["INITIATED", "PROCESSING"],
        },
        attemptedAt: {
          lte: cutoff,
        },
      },
      take: 200,
      orderBy: {
        attemptedAt: "asc",
      },
    });

    for (const attempt of attempts) {
      try {
        assertTransition({
          current: attempt.status,
          next: "TIMEOUT",
          transitions: PAYMENT_ATTEMPT_TRANSITIONS,
          scope: "payment_attempt",
        });

        await prisma.paymentAttemptLedger.update({
          where: {
            id: attempt.id,
          },
          data: {
            status: "TIMEOUT",
            timeoutAt: new Date(),
          },
        });
      } catch {
        // no-op for already terminal
      }
    }

    return {
      count: attempts.length,
    };
  };

  return {
    createCheckout,
    transitionPaymentIntentStatus,
    reconcileParsedProviderWebhook,
    reconcileProviderWebhook,
    markTimedOutAttempts,
  };
};

export const paymentIntentService = createPaymentIntentService();
