import { ExternalCommerceResolutionState, Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { commerceProviderRegistry } from "./commerce/providers/commerceProviderRegistry.service";
import { publishCommerceEvent } from "./commerceEvent.service";
import { chargebackEngineService } from "./chargebackEngine.service";
import { invoiceEngineService } from "./invoiceEngine.service";
import { paymentIntentService } from "./paymentIntent.service";
import { refundEngineService } from "./refundEngine.service";
import { subscriptionEngineService } from "./subscriptionEngine.service";
import { settleSuccessfulCheckout } from "./billingSettlement.service";
import { invalidateBillingContextCache } from "../middleware/subscription.middleware";
import { getPlanFromPrice } from "../config/stripe.price.map";
import {
  compareProviderVersion,
  mergeMetadata,
  normalizeProviderVersion,
  toMinor,
} from "./commerce/shared";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseIsoDate = (value: unknown) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};
const parseBoolean = (value: unknown) => {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
};
const toFiniteMinor = (value: unknown) => {
  const parsed = toFiniteNumber(value);
  return parsed === null ? null : Math.max(0, Math.floor(parsed));
};
const extractLastWebhookVersion = (value: unknown) =>
  normalizeProviderVersion(String(toRecord(toRecord(value).metadata).lastWebhookProviderVersion || ""));
const pickLatestProviderVersion = (versions: string[]) =>
  versions.reduce((latest, current) => {
    if (!latest) {
      return current;
    }
    return compareProviderVersion(current, latest) > 0 ? current : latest;
  }, "");

export const createCommerceProjectionService = () => {
  const emitOwnerFeed = async ({
    businessId,
    title,
    message,
    payload,
  }: {
    businessId: string;
    title: string;
    message: string;
    payload?: Record<string, unknown>;
  }) => {
    const business = await prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        ownerId: true,
      },
    });

    if (!business?.ownerId) {
      return null;
    }

    const notification = await prisma.notification.create({
      data: {
        userId: business.ownerId,
        businessId,
        type: "SYSTEM",
        title,
        message,
        read: false,
      },
    });

    await publishCommerceEvent({
      event: "commerce.owner.feed",
      businessId,
      aggregateType: "commerce_flow",
      aggregateId: notification.id,
      eventKey: `${businessId}:${notification.id}`,
      payload: {
        businessId,
        notificationId: notification.id,
        title,
        message,
        payload: payload || null,
      },
    });

    return notification;
  };

  const mapStripeSubscriptionStatus = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "active") return "ACTIVE" as const;
    if (normalized === "trialing") return "TRIALING" as const;
    if (
      normalized === "past_due" ||
      normalized === "unpaid" ||
      normalized === "incomplete"
    ) {
      return "PAST_DUE" as const;
    }
    if (normalized === "canceled" || normalized === "cancelled") return "CANCELLED" as const;
    if (normalized === "incomplete_expired") return "EXPIRED" as const;
    if (normalized === "paused") return "PAUSED" as const;

    return null;
  };

  const mapStripeDisputeStatus = (value: unknown) => {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "won") return "WON" as const;
    if (normalized === "lost") return "LOST" as const;
    if (normalized === "warning_needs_response" || normalized === "needs_response") {
      return "UNDER_REVIEW" as const;
    }
    if (normalized === "warning_closed") return "ACCEPTED" as const;
    if (normalized === "charge_refunded") return "REVERSED" as const;

    return null;
  };

  const resolveWebhookContext = async ({
    event,
    strictBusinessId,
  }: {
    event: {
      providerPaymentIntentId?: string | null;
      providerSubscriptionId?: string | null;
      providerInvoiceId?: string | null;
      providerRefundId?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    strictBusinessId: string | null;
  }) => {
    const paymentIntentKey = String(event.metadata?.paymentIntentKey || "").trim();

    const paymentIntent = event.providerPaymentIntentId || paymentIntentKey
      ? await prisma.paymentIntentLedger.findFirst({
          where: {
            ...(strictBusinessId ? { businessId: strictBusinessId } : {}),
            OR: [
              event.providerPaymentIntentId
                ? { providerPaymentIntentId: event.providerPaymentIntentId }
                : undefined,
              event.providerPaymentIntentId
                ? { paymentIntentKey: event.providerPaymentIntentId }
                : undefined,
              paymentIntentKey ? { paymentIntentKey } : undefined,
            ].filter(Boolean) as any,
          },
        })
      : null;

    const invoice = event.providerInvoiceId
      ? await prisma.invoiceLedger.findFirst({
          where: {
            ...(strictBusinessId ? { businessId: strictBusinessId } : {}),
            OR: [
              { externalInvoiceId: event.providerInvoiceId },
              { invoiceKey: event.providerInvoiceId },
            ],
          },
        })
      : paymentIntent?.invoiceId
      ? await prisma.invoiceLedger.findUnique({
          where: {
            id: paymentIntent.invoiceId,
          },
        })
      : null;

    const subscription = event.providerSubscriptionId
      ? await prisma.subscriptionLedger.findFirst({
          where: {
            ...(strictBusinessId ? { businessId: strictBusinessId } : {}),
            providerSubscriptionId: event.providerSubscriptionId,
          },
        })
      : invoice?.subscriptionId
      ? await prisma.subscriptionLedger.findUnique({
          where: {
            id: invoice.subscriptionId,
          },
        })
      : paymentIntent?.subscriptionId
      ? await prisma.subscriptionLedger.findUnique({
          where: {
            id: paymentIntent.subscriptionId,
          },
        })
      : null;

    const refund = event.providerRefundId
      ? await prisma.refundLedger.findFirst({
          where: {
            ...(strictBusinessId ? { businessId: strictBusinessId } : {}),
            providerRefundId: event.providerRefundId,
          },
        })
      : null;

    const derivedBusinessId =
      strictBusinessId ||
      paymentIntent?.businessId ||
      invoice?.businessId ||
      subscription?.businessId ||
      refund?.businessId ||
      null;

    if (
      strictBusinessId &&
      derivedBusinessId &&
      strictBusinessId !== derivedBusinessId
    ) {
      return {
        businessId: null,
        paymentIntent,
        invoice,
        subscription,
        refund,
      };
    }

    return {
      businessId: derivedBusinessId,
      paymentIntent,
      invoice,
      subscription,
      refund,
    };
  };

  const reconcileProviderWebhook = async ({
    provider,
    headers,
    body,
    strictBusinessId = null,
  }: {
    provider?: string | null;
    headers?: Record<string, unknown> | null;
    body: unknown;
    strictBusinessId?: string | null;
  }) => {
    const parsed = await commerceProviderRegistry.parseWebhook({
      provider,
      headers,
      body,
    });
    const providerVersion =
      String(toRecord(parsed.metadata).providerVersion || "").trim() ||
      parsed.occurredAt.toISOString();
    const providerObjectId =
      parsed.providerPaymentIntentId ||
      parsed.providerRefundId ||
      parsed.providerSubscriptionId ||
      parsed.providerInvoiceId ||
      null;
    const claim = await commerceAuthorityService.claimExternalIdempotency({
      businessId: strictBusinessId || null,
      provider: parsed.provider,
      providerEventId: parsed.providerEventId,
      providerObjectId,
      providerVersion,
      eventType: parsed.type,
      metadata: {
        provider: parsed.provider,
        providerType: parsed.type,
        providerVersion,
        providerObjectId,
        occurredAt: parsed.occurredAt.toISOString(),
        eventSnapshot: {
          provider: parsed.provider,
          providerEventId: parsed.providerEventId,
          type: parsed.type,
          occurredAt: parsed.occurredAt.toISOString(),
          providerPaymentIntentId: parsed.providerPaymentIntentId || null,
          providerRefundId: parsed.providerRefundId || null,
          providerSubscriptionId: parsed.providerSubscriptionId || null,
          providerInvoiceId: parsed.providerInvoiceId || null,
          amountMinor:
            parsed.amountMinor === null || parsed.amountMinor === undefined
              ? null
              : Math.max(0, Math.floor(Number(parsed.amountMinor))),
          currency: parsed.currency || null,
          metadata: parsed.metadata || null,
          rawPayload: parsed.rawPayload || null,
        },
      },
    });

    if (claim.state === "REPLAYED") {
      return {
        event: parsed,
        replay: true,
        unmatched: false,
        idempotency: "replayed",
      };
    }

    if (claim.state === "INFLIGHT") {
      return {
        event: parsed,
        replay: true,
        unmatched: false,
        idempotency: "inflight",
      };
    }

    const reconciled = await paymentIntentService
      .reconcileParsedProviderWebhook({
        event: parsed,
      })
      .catch(async (error) => {
        await commerceAuthorityService
          .markExternalIdempotencyFailed({
            id: claim.row.id,
            providerVersion,
            error: String((error as any)?.message || error || "webhook_reconcile_failed"),
            metadata: {
              provider: parsed.provider,
              providerType: parsed.type,
            },
          })
          .catch(() => undefined);

        throw error;
      });

    const event = (reconciled.event || parsed) as typeof parsed;
    const context = await resolveWebhookContext({
      event,
      strictBusinessId,
    });
    const businessId = context.businessId || null;
    const paymentIntent = context.paymentIntent;
    let invoice = context.invoice;
    let subscription = context.subscription;
    const refund = context.refund;
    const contextVersion = pickLatestProviderVersion(
      [paymentIntent, invoice, subscription, refund]
        .map((row) => extractLastWebhookVersion(row))
        .filter((value) => value && value !== "0:unknown")
    );

    if ((reconciled as any).stale) {
      await commerceAuthorityService.markExternalIdempotencyProcessed({
        id: claim.row.id,
        providerVersion,
        metadata: {
          provider: parsed.provider,
          providerType: parsed.type,
          businessId: businessId || null,
          paymentIntentId: paymentIntent?.id || null,
          stale: true,
        },
      });

      return {
        ...reconciled,
        stale: true,
        idempotency: "processed",
      };
    }

    if (contextVersion && compareProviderVersion(providerVersion, contextVersion) < 0) {
      await commerceAuthorityService.markExternalIdempotencyProcessed({
        id: claim.row.id,
        providerVersion,
        metadata: {
          provider: parsed.provider,
          providerType: parsed.type,
          businessId: businessId || null,
          stale: true,
          staleByContextVersion: true,
          contextVersion,
        },
      });

      return {
        ...reconciled,
        stale: true,
        staleByContextVersion: true,
        idempotency: "processed",
      };
    }

    if ((reconciled as any).overrideLocked) {
      await commerceAuthorityService.markExternalIdempotencyProcessed({
        id: claim.row.id,
        providerVersion,
        metadata: {
          provider: parsed.provider,
          providerType: parsed.type,
          businessId: businessId || null,
          paymentIntentId: paymentIntent?.id || null,
          overrideLocked: true,
        },
      });

      return {
        ...reconciled,
        idempotency: "processed",
      };
    }

    if (!businessId) {
      await commerceAuthorityService.markExternalIdempotencyFailed({
        id: claim.row.id,
        providerVersion,
        error: "webhook_context_unresolved",
        metadata: {
          unmatched: true,
          provider: parsed.provider,
          providerType: parsed.type,
          providerObjectId,
          paymentIntentId: paymentIntent?.id || null,
        },
      });
      return {
        ...reconciled,
        unmatched: true,
        noBusinessMatch: true,
        idempotency: "failed",
      };
    }

    const eventMetadata = toRecord(event.metadata);
    const billingReason =
      String(eventMetadata.billingReason || toRecord(event.rawPayload).billing_reason || "")
        .trim()
        .toLowerCase();

    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "checkout.completed"
    ) {
      try {
        await settleSuccessfulCheckout({
          paymentIntentId: paymentIntent?.id || null,
          providerPaymentIntentId: event.providerPaymentIntentId || null,
          paymentIntentKey:
            String(event.metadata?.paymentIntentKey || "").trim() || null,
          providerSubscriptionId: event.providerSubscriptionId || null,
          occurredAt: event.occurredAt,
          source: "provider_webhook",
        });
      } catch (error) {
        await commerceAuthorityService
          .markExternalIdempotencyFailed({
            id: claim.row.id,
            providerVersion,
            error: String(
              (error as { message?: unknown })?.message ||
                error ||
                "checkout_settlement_failed"
            ),
            metadata: {
              provider: parsed.provider,
              providerType: parsed.type,
              businessId,
              paymentIntentId: paymentIntent?.id || null,
              stage: "checkout_settlement",
            },
          })
          .catch(() => undefined);

        throw error;
      }
    }

    if (event.type === "payment_intent.succeeded" && paymentIntent?.invoiceId) {
      await invoiceEngineService
        .linkPaymentToInvoice({
          businessId,
          paymentIntentId: paymentIntent.id,
        })
        .catch(() => undefined);

      await emitOwnerFeed({
        businessId,
        title: "Payment collected",
        message: "A commerce payment was collected successfully.",
        payload: {
          paymentIntentId: paymentIntent.id,
          paymentIntentKey: paymentIntent.paymentIntentKey,
        },
      }).catch(() => undefined);
    }

    if (event.type === "invoice.paid") {
      if (!invoice && event.providerInvoiceId) {
        invoice = await prisma.invoiceLedger.findFirst({
          where: {
            businessId,
            OR: [
              {
                externalInvoiceId: event.providerInvoiceId,
              },
              {
                invoiceKey: event.providerInvoiceId,
              },
            ],
          },
        });
      }

      if (invoice) {
        const reportedInvoiceSubtotalMinor = toFiniteMinor(
          eventMetadata.invoiceSubtotalMinor
        );
        const normalizedInvoiceTaxMinor = toFiniteMinor(eventMetadata.invoiceTaxMinor);
        const normalizedInvoiceTotalMinor = toFiniteMinor(eventMetadata.invoiceTotalMinor);
        const normalizedReconciledSubtotalMinor =
          reportedInvoiceSubtotalMinor === null
            ? normalizedInvoiceTotalMinor === null || normalizedInvoiceTaxMinor === null
              ? null
              : Math.max(0, normalizedInvoiceTotalMinor - normalizedInvoiceTaxMinor)
            : reportedInvoiceSubtotalMinor;
        const normalizedProrationMinor = toFiniteMinor(
          eventMetadata.invoiceProrationMinor
        );
        const reconciledCurrency = event.currency || invoice.currency;

        invoice = await prisma.invoiceLedger.update({
          where: {
            id: invoice.id,
          },
          data: {
            subtotalMinor:
              normalizedReconciledSubtotalMinor === null
                ? invoice.subtotalMinor
                : normalizedReconciledSubtotalMinor,
            taxMinor:
              normalizedInvoiceTaxMinor === null
                ? invoice.taxMinor
                : normalizedInvoiceTaxMinor,
            totalMinor:
              normalizedInvoiceTotalMinor === null
                ? invoice.totalMinor
                : normalizedInvoiceTotalMinor,
            currency: reconciledCurrency,
            metadata: mergeMetadata(invoice.metadata, {
              providerInvoiceId: event.providerInvoiceId,
              providerVersion,
              billingReason,
              invoiceProrationMinor: normalizedProrationMinor,
              lastWebhookProviderVersion: providerVersion,
              lastWebhookOccurredAt: event.occurredAt.toISOString(),
              lastWebhookOccurredAtMs: event.occurredAt.getTime(),
              lastWebhookProviderEventId: event.providerEventId,
              lastWebhookType: event.type,
            }) as any,
          },
        });

        await invoiceEngineService
          .transitionInvoiceStatus({
            businessId,
            invoiceKey: invoice.invoiceKey,
            nextStatus: "PAID",
            paidMinor:
              event.amountMinor === null || event.amountMinor === undefined
                ? invoice.totalMinor
                : Math.max(invoice.paidMinor, toMinor(Number(event.amountMinor))),
              metadata: {
                providerInvoiceId: event.providerInvoiceId,
                providerEventId: event.providerEventId,
                providerVersion,
                billingReason,
                invoiceProrationMinor: normalizedProrationMinor,
                lastWebhookProviderVersion: providerVersion,
                lastWebhookOccurredAt: event.occurredAt.toISOString(),
                lastWebhookOccurredAtMs: event.occurredAt.getTime(),
              },
            })
          .catch(() => undefined);

        if (!subscription && invoice.subscriptionId) {
          subscription = await prisma.subscriptionLedger.findUnique({
            where: {
              id: invoice.subscriptionId,
            },
          });
        }

        if (subscription) {
          await prisma.subscriptionLedger
            .update({
              where: {
                id: subscription.id,
              },
              data: {
                providerSubscriptionId:
                  event.providerSubscriptionId || subscription.providerSubscriptionId,
                metadata: mergeMetadata(subscription.metadata, {
                  billingReason,
                  providerVersion,
                  lastWebhookProviderVersion: providerVersion,
                  lastWebhookOccurredAt: event.occurredAt.toISOString(),
                  lastWebhookOccurredAtMs: event.occurredAt.getTime(),
                  lastWebhookProviderEventId: event.providerEventId,
                  lastWebhookType: event.type,
                }) as Prisma.InputJsonValue,
              },
            })
            .catch(() => undefined);

          const shouldTriggerRenewal =
            billingReason === "subscription_cycle" || billingReason === "upcoming";

          if (shouldTriggerRenewal) {
            await subscriptionEngineService
              .applyLifecycleAction({
                businessId,
                subscriptionKey: subscription.subscriptionKey,
                action: "renew",
                metadata: {
                  providerEventId: event.providerEventId,
                  source: "invoice_paid_webhook",
                  billingReason,
                  providerVersion,
                  prorationMinor: normalizedProrationMinor,
                },
              })
              .catch(() => undefined);
          }
        }
      }
    }

    if (event.type === "invoice.payment_failed" || event.type === "payment_intent.failed") {
      const overdueInvoice = invoice
        ? invoice
        : paymentIntent?.invoiceId
        ? await prisma.invoiceLedger.findUnique({
            where: {
              id: paymentIntent.invoiceId,
            },
          })
        : null;

      if (overdueInvoice) {
        await invoiceEngineService
          .transitionInvoiceStatus({
            businessId,
            invoiceKey: overdueInvoice.invoiceKey,
            nextStatus: "OVERDUE",
            metadata: {
              providerInvoiceId: event.providerInvoiceId,
              providerEventId: event.providerEventId,
              failedAt: event.occurredAt.toISOString(),
            },
          })
          .catch(() => undefined);

        if (!subscription && overdueInvoice.subscriptionId) {
          subscription = await prisma.subscriptionLedger.findUnique({
            where: {
              id: overdueInvoice.subscriptionId,
            },
          });
        }
      }

      if (subscription) {
        await subscriptionEngineService
          .transitionSubscriptionStatus({
            businessId,
            subscriptionKey: subscription.subscriptionKey,
            nextStatus: "PAST_DUE",
            metadata: {
              providerEventId: event.providerEventId,
              dunningTrigger: "payment_failed_webhook",
            },
          })
          .catch(() => undefined);
      }

      await emitOwnerFeed({
        businessId,
        title: "Payment failed",
        message: "A payment failed and subscription has entered collection workflow.",
        payload: {
          providerEventId: event.providerEventId,
          providerInvoiceId: event.providerInvoiceId || null,
          paymentIntentId: paymentIntent?.id || null,
        },
      }).catch(() => undefined);
    }

    if (event.type === "subscription.renewed" || event.type === "subscription.updated") {
      if (!subscription && event.providerSubscriptionId) {
        subscription = await prisma.subscriptionLedger.findFirst({
          where: {
            businessId,
            providerSubscriptionId: event.providerSubscriptionId,
          },
        });
      }

      if (subscription) {
        const raw = toRecord(event.rawPayload);
        const providerStatus = mapStripeSubscriptionStatus(
          raw.status || eventMetadata.subscriptionStatus
        );
        const metadataPlanCode = String(eventMetadata.subscriptionPlanCode || "")
          .trim()
          .toUpperCase();
        const metadataPriceId = String(eventMetadata.subscriptionPriceId || "").trim();
        const mappedPlan = getPlanFromPrice(metadataPriceId || null);
        const targetPlan =
          metadataPlanCode ||
          String(toRecord(raw.metadata).planCode || mappedPlan || "")
            .trim()
            .toUpperCase() ||
          null;
        const targetQuantity = Math.max(
          1,
          Math.floor(
            Number(
              eventMetadata.subscriptionQuantity ||
                raw.quantity ||
                subscription.quantity ||
                1
            )
          )
        );
        const currentPeriodStart = parseIsoDate(
          eventMetadata.subscriptionCurrentPeriodStart
        );
        const currentPeriodEnd = parseIsoDate(
          eventMetadata.subscriptionCurrentPeriodEnd
        );
        const cancelAt = parseIsoDate(eventMetadata.subscriptionCancelAt);
        const trialEndsAt = parseIsoDate(eventMetadata.subscriptionTrialEndsAt);
        const cancelAtPeriodEnd = parseBoolean(
          eventMetadata.subscriptionCancelAtPeriodEnd
        );
        const prorationMinor = toFiniteMinor(eventMetadata.invoiceProrationMinor);

        if (
          providerStatus &&
          providerStatus !== subscription.status &&
          providerStatus !== "TRIALING"
        ) {
          await subscriptionEngineService
            .transitionSubscriptionStatus({
              businessId,
              subscriptionKey: subscription.subscriptionKey,
              nextStatus: providerStatus,
              metadata: {
                providerEventId: event.providerEventId,
                providerVersion,
                lastWebhookProviderVersion: providerVersion,
                lastWebhookOccurredAt: event.occurredAt.toISOString(),
                lastWebhookOccurredAtMs: event.occurredAt.getTime(),
                lastWebhookProviderEventId: event.providerEventId,
                lastWebhookType: event.type,
              },
            })
            .catch(() => undefined);
        }

        if (targetPlan && targetPlan !== subscription.planCode) {
          const rank: Record<string, number> = {
            BASIC: 1,
            PRO: 2,
            ELITE: 3,
          };
          const currentRank = rank[String(subscription.planCode || "").toUpperCase()] || 1;
          const targetRank = rank[String(targetPlan || "").toUpperCase()] || currentRank;
          const action = targetRank < currentRank ? "downgrade" : "upgrade";

          await subscriptionEngineService
            .applyLifecycleAction({
              businessId,
              subscriptionKey: subscription.subscriptionKey,
              action,
                metadata: {
                  providerEventId: event.providerEventId,
                  planCode: targetPlan,
                  quantity: targetQuantity,
                  prorationMinor,
                  providerVersion,
                  source: "provider_webhook",
                  billingReason,
                },
              })
              .catch(() => undefined);
        } else {
          const shouldPatchSnapshot =
            targetQuantity !== subscription.quantity ||
            Boolean(event.providerSubscriptionId) ||
            Boolean(currentPeriodStart) ||
            Boolean(currentPeriodEnd) ||
            Boolean(cancelAt) ||
            Boolean(trialEndsAt) ||
            cancelAtPeriodEnd !== null ||
            metadataPriceId.length > 0;

          if (shouldPatchSnapshot) {
            const nextAmountMinor = Math.max(
              0,
              Math.floor(subscription.unitPriceMinor * targetQuantity)
            );
            const clearCancelAt = cancelAtPeriodEnd === false && !cancelAt;

            subscription = await prisma.subscriptionLedger.update({
              where: {
                id: subscription.id,
              },
              data: {
                providerSubscriptionId:
                  event.providerSubscriptionId || subscription.providerSubscriptionId,
                quantity: targetQuantity,
                amountMinor: nextAmountMinor,
                currentPeriodStart:
                  currentPeriodStart === null
                    ? subscription.currentPeriodStart
                    : currentPeriodStart,
                currentPeriodEnd:
                  currentPeriodEnd === null
                    ? subscription.currentPeriodEnd
                    : currentPeriodEnd,
                renewAt:
                  currentPeriodEnd === null ? subscription.renewAt : currentPeriodEnd,
                cancelAt: clearCancelAt
                  ? null
                  : cancelAt === null
                  ? subscription.cancelAt
                  : cancelAt,
                trialEndsAt:
                  trialEndsAt === null ? subscription.trialEndsAt : trialEndsAt,
                metadata: mergeMetadata(subscription.metadata, {
                  source: "provider_webhook",
                  billingReason,
                  providerVersion,
                  subscriptionPriceId: metadataPriceId || null,
                  subscriptionPlanCode: targetPlan,
                  prorationMinor,
                  cancelAtPeriodEnd,
                  lastWebhookProviderVersion: providerVersion,
                  lastWebhookOccurredAt: event.occurredAt.toISOString(),
                  lastWebhookOccurredAtMs: event.occurredAt.getTime(),
                  lastWebhookProviderEventId: event.providerEventId,
                  lastWebhookType: event.type,
                }) as Prisma.InputJsonValue,
                version: {
                  increment: 1,
                },
              },
            });
          }
        }

        if (event.type === "subscription.renewed") {
          await subscriptionEngineService
            .applyLifecycleAction({
              businessId,
              subscriptionKey: subscription.subscriptionKey,
              action: "renew",
              metadata: {
                providerEventId: event.providerEventId,
                providerVersion,
                source: "provider_webhook",
              },
            })
            .catch(() => undefined);
        }
      }
    }

    if (event.type === "subscription.cancelled") {
      if (!subscription && event.providerSubscriptionId) {
        subscription = await prisma.subscriptionLedger.findFirst({
          where: {
            providerSubscriptionId: event.providerSubscriptionId,
            businessId,
          },
        });
      }

      if (subscription) {
        await subscriptionEngineService
          .transitionSubscriptionStatus({
            businessId,
            subscriptionKey: subscription.subscriptionKey,
            nextStatus: "CANCELLED",
            metadata: {
              providerEventId: event.providerEventId,
            },
          })
          .catch(() => undefined);
      }
    }

    if (event.type === "refund.succeeded" || event.type === "refund.failed") {
      const webhookRefund = refund
        ? refund
        : event.providerRefundId
        ? await prisma.refundLedger.findFirst({
            where: {
              providerRefundId: event.providerRefundId,
              businessId,
            },
          })
        : null;

      if (webhookRefund) {
        await refundEngineService
          .transitionRefundStatus({
            businessId,
            refundKey: webhookRefund.refundKey,
            nextStatus: event.type === "refund.succeeded" ? "SUCCEEDED" : "FAILED",
            metadata: {
              providerEventId: event.providerEventId,
            },
          })
          .catch(() => undefined);
      }
    }

    if (event.type === "chargeback.created" || event.type === "chargeback.updated") {
      const providerCaseId =
        String(eventMetadata.providerCaseId || event.providerEventId || "").trim() || null;
      const providerChargeId =
        String(eventMetadata.providerChargeId || "").trim() || null;
      const nextStatus = mapStripeDisputeStatus(toRecord(event.rawPayload).status);
      const reasonCode =
        String(
          toRecord(event.rawPayload).reason ||
            event.metadata?.reason ||
            "chargeback_event"
        ).trim() || "chargeback_event";

      let existingChargeback =
        providerCaseId === null
          ? null
          : await prisma.chargebackLedger.findFirst({
              where: {
                businessId,
                providerCaseId,
              },
            });

      if (!existingChargeback && providerCaseId) {
        const opened = await chargebackEngineService
          .openChargeback({
            businessId,
            paymentIntentId: paymentIntent?.id || null,
            provider: event.provider,
            providerCaseId,
            amountMinor: Number(event.amountMinor || paymentIntent?.amountMinor || 0),
            currency: String(event.currency || paymentIntent?.currency || "INR"),
            reasonCode,
            idempotencyKey: `chargeback:${providerCaseId}`,
            metadata: mergeMetadata(event.rawPayload, {
              providerVersion,
              providerChargeId,
              providerCaseId,
              sourceEventType: event.type,
            }),
          })
          .catch(() => null);

        if (opened) {
          existingChargeback = opened;
        }
      }

      if (existingChargeback && nextStatus && nextStatus !== existingChargeback.status) {
        await chargebackEngineService
          .transitionChargebackStatus({
            businessId,
            chargebackKey: existingChargeback.chargebackKey,
            nextStatus,
            metadata: {
              providerEventId: event.providerEventId,
              providerVersion,
              providerCaseId,
              providerChargeId,
            },
          })
          .catch(() => undefined);
      }
    }

    if (event.type === "invoice.paid" || event.type === "payment_intent.succeeded") {
      const recoverSubscription = subscription
        ? subscription
        : invoice?.subscriptionId
        ? await prisma.subscriptionLedger.findUnique({
            where: {
              id: invoice.subscriptionId,
            },
          })
        : paymentIntent?.subscriptionId
        ? await prisma.subscriptionLedger.findUnique({
            where: {
              id: paymentIntent.subscriptionId,
            },
          })
        : null;

      if (recoverSubscription && ["PAST_DUE", "PAUSED"].includes(recoverSubscription.status)) {
        await subscriptionEngineService
          .transitionSubscriptionStatus({
            businessId,
            subscriptionKey: recoverSubscription.subscriptionKey,
            nextStatus: "ACTIVE",
            metadata: {
              providerEventId: event.providerEventId,
              restoredAt: event.occurredAt.toISOString(),
            },
          })
          .catch(() => undefined);
      }
    }

    await invalidateBillingContextCache(businessId).catch(() => undefined);

    const unresolved =
      !paymentIntent &&
      !invoice &&
      !subscription &&
      !refund;

    await commerceAuthorityService.markExternalIdempotencyProcessed({
      id: claim.row.id,
      providerVersion,
      metadata: {
        provider: parsed.provider,
        providerType: parsed.type,
        businessId,
        paymentIntentId: paymentIntent?.id || null,
        unresolved,
        overrideLocked: Boolean((reconciled as any).overrideLocked),
      },
    });

    return {
      ...reconciled,
      unmatched: unresolved,
      idempotency: "processed",
    };
  };

  const replayPendingProviderWebhooks = async ({
    provider = "STRIPE",
    businessId = null,
    limit = 100,
    includeClaimedOlderThanMinutes = 5,
  }: {
    provider?: string;
    businessId?: string | null;
    limit?: number;
    includeClaimedOlderThanMinutes?: number;
  }) => {
    const normalizedProvider = String(provider || "STRIPE").trim().toUpperCase() || "STRIPE";
    const normalizedLimit = Math.max(1, Math.min(500, Math.floor(Number(limit || 100))));
    const claimCutoff = new Date(
      Date.now() - Math.max(1, Math.floor(Number(includeClaimedOlderThanMinutes || 5))) * 60_000
    );
    const rows = await prisma.externalCommerceIdempotency.findMany({
      where: {
        provider: normalizedProvider as any,
        ...(businessId ? { businessId } : {}),
        OR: [
          {
            resolutionState: ExternalCommerceResolutionState.FAILED,
          },
          {
            resolutionState: ExternalCommerceResolutionState.CLAIMED,
            updatedAt: {
              lte: claimCutoff,
            },
          },
        ],
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: normalizedLimit,
    });

    let replayed = 0;
    let recovered = 0;
    let failed = 0;
    let skipped = 0;
    const replayErrors: Array<{ id: string; error: string }> = [];

    for (const row of rows) {
      const metadata = toRecord(row.metadata);
      const snapshot = toRecord(metadata.eventSnapshot);
      const snapshotRawPayload = toRecord(snapshot.rawPayload);
      const snapshotMetadata = toRecord(snapshot.metadata);
      const snapshotProvider =
        String(snapshot.provider || normalizedProvider).trim().toUpperCase() || normalizedProvider;
      const providerEventId =
        String(
          snapshot.providerEventId ||
            snapshotMetadata.providerEventId ||
            row.providerEventKey.split(":").slice(1).join(":")
        ).trim() || "stripe_replay_event";
      const snapshotType =
        String(snapshotMetadata.stripeType || snapshot.type || "").trim() || "unknown";
      const occurredAt = parseIsoDate(snapshot.occurredAt) || row.updatedAt || new Date();
      const rawObject = Object.keys(snapshotRawPayload).length
        ? snapshotRawPayload
        : toRecord(metadata.rawPayload);

      if (!Object.keys(rawObject).length) {
        skipped += 1;
        replayErrors.push({
          id: row.id,
          error: "replay_payload_missing",
        });
        continue;
      }

      const replayBody = {
        id: providerEventId,
        type: snapshotType,
        created: Math.floor(occurredAt.getTime() / 1000),
        data: {
          object: rawObject,
        },
      };

      replayed += 1;
      try {
        const result = await reconcileProviderWebhook({
          provider: snapshotProvider,
          headers: {
            "x-commerce-manual-reconcile": "true",
          },
          body: replayBody,
          strictBusinessId: businessId || row.businessId || null,
        });

        if ((result as any)?.idempotency === "processed" && !(result as any)?.unmatched) {
          recovered += 1;
        } else if ((result as any)?.idempotency === "failed") {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        replayErrors.push({
          id: row.id,
          error: String((error as { message?: unknown })?.message || error || "replay_failed"),
        });
      }
    }

    return {
      provider: normalizedProvider,
      businessId: businessId || null,
      scanned: rows.length,
      replayed,
      recovered,
      failed,
      skipped,
      replayErrors: replayErrors.slice(0, 20),
    };
  };

  const buildProjection = async ({
    businessId,
    from,
    to,
  }: {
    businessId: string;
    from: Date;
    to: Date;
  }) => {
    const [proposals, payments, invoices, subscriptions, refunds, chargebacks, revrec] =
      await Promise.all([
        prisma.proposalLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
        prisma.paymentIntentLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
        prisma.invoiceLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
        prisma.subscriptionLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
        prisma.refundLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
        prisma.chargebackLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
        prisma.revenueRecognitionLedger.findMany({
          where: {
            businessId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
      ]);

    const paidInvoices = invoices.filter((row) => row.status === "PAID");

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      counts: {
        proposals: proposals.length,
        proposalsAccepted: proposals.filter((row) => row.status === "ACCEPTED" || row.status === "CONTRACT_GENERATED").length,
        payments: payments.length,
        paymentsSucceeded: payments.filter((row) => row.status === "SUCCEEDED").length,
        invoices: invoices.length,
        invoicesPaid: paidInvoices.length,
        subscriptions: subscriptions.length,
        activeSubscriptions: subscriptions.filter((row) => row.status === "ACTIVE").length,
        refunds: refunds.length,
        chargebacks: chargebacks.length,
      },
      money: {
        invoicedMinor: sum(invoices.map((row) => row.totalMinor)),
        collectedMinor: sum(paidInvoices.map((row) => row.paidMinor || row.totalMinor)),
        refundedMinor: sum(refunds.filter((row) => row.status === "SUCCEEDED").map((row) => row.amountMinor)),
        chargebackMinor: sum(
          chargebacks
            .filter((row) => row.status === "LOST" || row.status === "ACCEPTED")
            .map((row) => row.amountMinor)
        ),
        recognizedMinor: sum(
          revrec
            .filter((row) => row.stage === "RECOGNIZED" || row.stage === "COLLECTED")
            .map((row) => row.amountMinor)
        ),
      },
      revenueRecognition: {
        booked: revrec.filter((row) => row.stage === "BOOKED").length,
        invoiced: revrec.filter((row) => row.stage === "INVOICED").length,
        collected: revrec.filter((row) => row.stage === "COLLECTED").length,
        recognized: revrec.filter((row) => row.stage === "RECOGNIZED").length,
        deferred: revrec.filter((row) => row.stage === "DEFERRED").length,
        refunded: revrec.filter((row) => row.stage === "REFUNDED").length,
        writtenOff: revrec.filter((row) => row.stage === "WRITTEN_OFF").length,
      },
    };
  };

  const bootstrapBookingConversion = async ({
    businessId,
    appointmentKey,
    leadId,
    metadata = null,
  }: {
    businessId: string;
    appointmentKey: string;
    leadId: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const proposalKey = `booking_${appointmentKey}`;
    const existing = await prisma.proposalLedger.findFirst({
      where: {
        businessId,
        proposalKey,
      },
    });
    const proposal =
      existing ||
      (await prisma.proposalLedger.create({
        data: {
          businessId,
          leadId,
          proposalKey,
          source: "SYSTEM",
          status: "DRAFT",
          currency: "INR",
          subtotalMinor: 0,
          taxMinor: 0,
          totalMinor: 0,
          metadata: {
            bridge: "booking_conversion",
            appointmentKey,
            ...(metadata || {}),
          },
        },
      }));

    if (!existing) {
      await publishCommerceEvent({
        event: "commerce.proposal.created",
        businessId,
        aggregateType: "proposal_ledger",
        aggregateId: proposal.id,
        eventKey: proposal.proposalKey,
        payload: {
          businessId,
          leadId,
          proposalId: proposal.id,
          proposalKey: proposal.proposalKey,
          source: "booking_conversion",
        },
      });
    }

    return proposal;
  };

  return {
    emitOwnerFeed,
    reconcileProviderWebhook,
    replayPendingProviderWebhooks,
    buildProjection,
    bootstrapBookingConversion,
  };
};

export const commerceProjectionService = createCommerceProjectionService();
