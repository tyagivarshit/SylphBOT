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
  compareProviderVersion,
  getScopedAndLegacyIdempotencyCandidates,
  mergeMetadata,
  normalizeActor,
  normalizeProviderVersion,
  normalizeProvider,
  scopeIdempotencyKey,
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
    case "invoice.paid":
      return "SUCCEEDED";
    case "payment_intent.failed":
    case "invoice.payment_failed":
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
    case "invoice.payment_failed":
      return "FAILED";
    case "invoice.paid":
      return "SUCCEEDED";
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
    const rawIdempotency = String(idempotencyKey || "").trim() || null;
    const normalizedIdempotency =
      scopeIdempotencyKey({
        businessId,
        idempotencyKey: rawIdempotency,
      }) ||
      buildDeterministicDigest({
        businessId,
        proposalKey,
        provider: normalizedProvider,
        amount: proposal.totalMinor,
      });

    const existing = rawIdempotency
      ? await prisma.paymentIntentLedger.findFirst({
          where: {
            businessId,
            idempotencyKey: {
              in: getScopedAndLegacyIdempotencyCandidates({
                businessId,
                idempotencyKey: rawIdempotency,
              }),
            },
          },
        })
      : await prisma.paymentIntentLedger.findUnique({
          where: {
            idempotencyKey: normalizedIdempotency,
          },
        });

    if (existing) {
      return existing;
    }

    const paymentIntent = await prisma.$transaction(async (tx) => {
      const row = await tx.paymentIntentLedger.create({
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
              planCode:
                String(toRecord(proposal.pricingSnapshot).planCode || toRecord(proposal.metadata).planCode || "")
                  .trim()
                  .toUpperCase() || null,
              billingCycle:
                String(
                  toRecord(proposal.pricingSnapshot).billingCycle ||
                    toRecord(proposal.metadata).billingCycle ||
                    "monthly"
                )
                  .trim()
                  .toLowerCase() || "monthly",
              quantity: Math.max(1, Number(proposal.quantity || 1)),
              unitPriceMinor: Math.max(0, Number(proposal.unitPriceMinor || 0)),
              coupon:
                String(toRecord(proposal.metadata).coupon || toRecord(metadata).coupon || "")
                  .trim() || null,
              checkoutType:
                String(
                  toRecord(proposal.metadata).checkoutType ||
                    toRecord(metadata).checkoutType ||
                    "subscription"
                )
                  .trim()
                  .toLowerCase() || "subscription",
              trialDays: Math.max(
                0,
                Math.floor(
                  Number(
                    toRecord(proposal.metadata).trialDays ||
                      toRecord(metadata).trialDays ||
                      0
                  )
                )
              ),
            },
            metadata || undefined
          ) as Prisma.InputJsonValue,
          idempotencyKey: normalizedIdempotency,
        },
      });

      await publishCommerceEvent({
        tx,
        event: "commerce.payment_intent.created",
        businessId,
        aggregateType: "payment_intent_ledger",
        aggregateId: row.id,
        eventKey: row.paymentIntentKey,
        payload: {
          businessId,
          proposalId: proposal.id,
          proposalKey,
          paymentIntentId: row.id,
          paymentIntentKey: row.paymentIntentKey,
          provider: normalizedProvider,
          amountMinor: row.amountMinor,
          currency: row.currency,
        },
      });

      return row;
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
          planCode:
            String(toRecord(paymentIntent.metadata).planCode || toRecord(proposal.pricingSnapshot).planCode || "")
              .trim()
              .toUpperCase() || null,
          billingCycle:
            String(
              toRecord(paymentIntent.metadata).billingCycle ||
                toRecord(proposal.pricingSnapshot).billingCycle ||
                "monthly"
            )
              .trim()
              .toLowerCase() || "monthly",
          quantity: Math.max(1, Number(toRecord(paymentIntent.metadata).quantity || proposal.quantity || 1)),
          unitPriceMinor: Math.max(
            0,
            Number(
              toRecord(paymentIntent.metadata).unitPriceMinor ||
                proposal.unitPriceMinor ||
                paymentIntent.amountMinor
            )
          ),
          checkoutType:
            String(toRecord(paymentIntent.metadata).checkoutType || "subscription")
              .trim()
              .toLowerCase() || "subscription",
          trialDays: Math.max(0, Number(toRecord(paymentIntent.metadata).trialDays || 0)),
          coupon:
            String(toRecord(paymentIntent.metadata).coupon || "").trim() || null,
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
      const failed = await prisma.paymentIntentLedger.update({
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

      await publishCommerceEvent({
        event: "commerce.payment_intent.status_changed",
        businessId,
        aggregateType: "payment_intent_ledger",
        aggregateId: failed.id,
        eventKey: `${failed.paymentIntentKey}:${paymentIntent.status}:FAILED`,
        payload: {
          businessId,
          paymentIntentId: failed.id,
          paymentIntentKey: failed.paymentIntentKey,
          provider: failed.provider,
          from: paymentIntent.status,
          to: "FAILED",
          reason: String((error as any)?.message || "provider_checkout_failed"),
        },
      }).catch(() => undefined);

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

    const baselineCapturedMinor = Math.max(
      0,
      Math.floor(Number(paymentIntent.capturedMinor || 0))
    );
    const requestedCapturedMinor =
      capturedMinor !== null && capturedMinor !== undefined
        ? Math.max(0, Math.floor(Number(capturedMinor)))
        : baselineCapturedMinor;
    const nextCapturedMinor =
      nextStatus === "SUCCEEDED"
        ? Math.max(
            baselineCapturedMinor,
            requestedCapturedMinor,
            Math.max(0, Math.floor(Number(paymentIntent.amountMinor || 0)))
          )
        : Math.max(baselineCapturedMinor, requestedCapturedMinor);

    const updated = await prisma.paymentIntentLedger.update({
      where: {
        id: paymentIntent.id,
      },
      data: {
        status: nextStatus,
        capturedMinor: nextCapturedMinor,
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
    const metadata = toRecord(normalized.metadata);
    const providerVersion = normalizeProviderVersion(
      String(
        metadata.providerVersion ||
          `${Math.floor(normalized.occurredAt.getTime() / 1000)}:${normalized.providerEventId}`
      )
    );
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

    const normalizedProviderPaymentIntentId = String(
      normalized.providerPaymentIntentId || ""
    ).trim();
    const currentProviderPaymentIntentId = String(
      paymentIntent.providerPaymentIntentId || ""
    ).trim();

    if (
      normalized.provider === "STRIPE" &&
      normalizedProviderPaymentIntentId &&
      normalizedProviderPaymentIntentId.startsWith("pi_") &&
      normalizedProviderPaymentIntentId !== currentProviderPaymentIntentId
    ) {
      paymentIntent = await prisma.paymentIntentLedger.update({
        where: {
          id: paymentIntent.id,
        },
        data: {
          providerPaymentIntentId: normalizedProviderPaymentIntentId,
          metadata: mergeMetadata(paymentIntent.metadata, {
            stripeSessionId:
              String(metadata.stripeSessionId || currentProviderPaymentIntentId).trim() ||
              null,
          }) as Prisma.InputJsonValue,
        },
      });
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

    const paymentIntentMetadata = toRecord(paymentIntent.metadata);
    const lastProviderVersion = normalizeProviderVersion(
      String(paymentIntentMetadata.lastWebhookProviderVersion || "")
    );
    const staleByVersion = compareProviderVersion(providerVersion, lastProviderVersion) < 0;
    const lastOccurredAtMs = Number(
      paymentIntentMetadata.lastWebhookOccurredAtMs || paymentIntentMetadata.lastWebhookOccurredAt || 0
    );
    const staleByTimestamp =
      Number.isFinite(lastOccurredAtMs) &&
      lastOccurredAtMs > 0 &&
      normalized.occurredAt.getTime() < lastOccurredAtMs;
    const staleEvent = staleByVersion || staleByTimestamp;

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
        metadata: mergeMetadata(normalized.rawPayload, {
          providerVersion,
          staleEvent,
          staleByVersion,
          staleByTimestamp,
        }) as Prisma.InputJsonValue,
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

    if (staleEvent) {
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
          staleEvent: true,
          providerVersion,
          lastProviderVersion,
        },
      });

      return {
        event: normalized,
        replay: false,
        unmatched: false,
        stale: true,
      };
    }

    const nextStatus = mapProviderEventToIntentStatus(normalized);

    if (nextStatus) {
      try {
        await transitionPaymentIntentStatus({
          paymentIntentId: paymentIntent.id,
          nextStatus,
          capturedMinor:
            nextStatus === "SUCCEEDED" || nextStatus === "PARTIALLY_CAPTURED"
              ? normalized.amountMinor || paymentIntent.amountMinor
              : undefined,
          metadata: {
            lastWebhookProviderEventId: normalized.providerEventId,
            lastWebhookType: normalized.type,
            lastWebhookProviderVersion: providerVersion,
            lastWebhookOccurredAt: normalized.occurredAt.toISOString(),
            lastWebhookOccurredAtMs: normalized.occurredAt.getTime(),
            lastWebhookProviderCaseId:
              String(metadata.providerCaseId || "").trim() || null,
            lastWebhookProviderChargeId:
              String(metadata.providerChargeId || "").trim() || null,
          },
        });
      } catch {
        // keep replay-safe semantics: do not throw on monotonic reject
      }
    } else {
      await prisma.paymentIntentLedger
        .update({
          where: {
            id: paymentIntent.id,
          },
          data: {
            metadata: mergeMetadata(paymentIntent.metadata, {
              lastWebhookProviderEventId: normalized.providerEventId,
              lastWebhookType: normalized.type,
              lastWebhookProviderVersion: providerVersion,
              lastWebhookOccurredAt: normalized.occurredAt.toISOString(),
              lastWebhookOccurredAtMs: normalized.occurredAt.getTime(),
              lastWebhookProviderCaseId:
                String(metadata.providerCaseId || "").trim() || null,
              lastWebhookProviderChargeId:
                String(metadata.providerChargeId || "").trim() || null,
            }) as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
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
