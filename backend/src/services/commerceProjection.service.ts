import prisma from "../config/prisma";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { commerceProviderRegistry } from "./commerce/providers/commerceProviderRegistry.service";
import { publishCommerceEvent } from "./commerceEvent.service";
import { chargebackEngineService } from "./chargebackEngine.service";
import { invoiceEngineService } from "./invoiceEngine.service";
import { paymentIntentService } from "./paymentIntent.service";
import { refundEngineService } from "./refundEngine.service";
import { subscriptionEngineService } from "./subscriptionEngine.service";

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

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

    if (reconciled.unmatched || !reconciled.event) {
      await commerceAuthorityService.markExternalIdempotencyProcessed({
        id: claim.row.id,
        providerVersion,
        metadata: {
          unmatched: true,
          provider: parsed.provider,
          providerType: parsed.type,
        },
      });
      return reconciled;
    }

    const event = reconciled.event;
    const paymentIntent = event.providerPaymentIntentId
      ? await prisma.paymentIntentLedger.findFirst({
          where: {
            OR: [
              {
                providerPaymentIntentId: event.providerPaymentIntentId,
              },
              {
                paymentIntentKey: event.providerPaymentIntentId,
              },
            ],
          },
        })
      : null;

    const businessId = paymentIntent?.businessId || strictBusinessId || null;

    if (!businessId) {
      return {
        ...reconciled,
        noBusinessMatch: true,
      };
    }

    if (event.type === "payment_intent.succeeded" && paymentIntent?.invoiceId) {
      await invoiceEngineService.linkPaymentToInvoice({
        businessId,
        paymentIntentId: paymentIntent.id,
      }).catch(() => undefined);

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

    if (event.type === "invoice.payment_failed") {
      const invoice = event.providerInvoiceId
        ? await prisma.invoiceLedger.findFirst({
            where: {
              OR: [
                {
                  externalInvoiceId: event.providerInvoiceId,
                },
                {
                  invoiceKey: event.providerInvoiceId,
                },
              ],
              businessId,
            },
          })
        : null;

      if (invoice) {
        await invoiceEngineService.transitionInvoiceStatus({
          businessId,
          invoiceKey: invoice.invoiceKey,
          nextStatus: "OVERDUE",
          metadata: {
            providerInvoiceId: event.providerInvoiceId,
          },
        }).catch(() => undefined);
      }
    }

    if (event.type === "subscription.renewed" || event.type === "subscription.updated") {
      const subscription = event.providerSubscriptionId
        ? await prisma.subscriptionLedger.findFirst({
            where: {
              providerSubscriptionId: event.providerSubscriptionId,
              businessId,
            },
          })
        : null;

      if (subscription) {
        await subscriptionEngineService.applyLifecycleAction({
          businessId,
          subscriptionKey: subscription.subscriptionKey,
          action: "renew",
          metadata: {
            providerEventId: event.providerEventId,
          },
        }).catch(() => undefined);
      }
    }

    if (event.type === "subscription.cancelled") {
      const subscription = event.providerSubscriptionId
        ? await prisma.subscriptionLedger.findFirst({
            where: {
              providerSubscriptionId: event.providerSubscriptionId,
              businessId,
            },
          })
        : null;

      if (subscription) {
        await subscriptionEngineService.transitionSubscriptionStatus({
          businessId,
          subscriptionKey: subscription.subscriptionKey,
          nextStatus: "CANCELLED",
          metadata: {
            providerEventId: event.providerEventId,
          },
        }).catch(() => undefined);
      }
    }

    if (event.type === "refund.succeeded" || event.type === "refund.failed") {
      const refund = event.providerRefundId
        ? await prisma.refundLedger.findFirst({
            where: {
              providerRefundId: event.providerRefundId,
              businessId,
            },
          })
        : null;

      if (refund) {
        await refundEngineService.transitionRefundStatus({
          businessId,
          refundKey: refund.refundKey,
          nextStatus: event.type === "refund.succeeded" ? "SUCCEEDED" : "FAILED",
          metadata: {
            providerEventId: event.providerEventId,
          },
        }).catch(() => undefined);
      }
    }

    if (event.type === "chargeback.created" || event.type === "chargeback.updated") {
      if (event.type === "chargeback.created") {
        await chargebackEngineService
          .openChargeback({
            businessId,
            paymentIntentId: paymentIntent?.id || null,
            provider: event.provider,
            providerCaseId: event.providerEventId,
            amountMinor: Number(event.amountMinor || paymentIntent?.amountMinor || 0),
            currency: String(event.currency || paymentIntent?.currency || "INR"),
            reasonCode: String(event.metadata?.reason || "chargeback_event"),
            idempotencyKey: `chargeback:${event.providerEventId}`,
            metadata: event.rawPayload,
          })
          .catch(() => undefined);
      }
    }

    await commerceAuthorityService.markExternalIdempotencyProcessed({
      id: claim.row.id,
      providerVersion,
      metadata: {
        provider: parsed.provider,
        providerType: parsed.type,
        businessId,
        paymentIntentId: paymentIntent?.id || null,
        overrideLocked: Boolean((reconciled as any).overrideLocked),
      },
    });

    return {
      ...reconciled,
      idempotency: "processed",
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
    buildProjection,
    bootstrapBookingConversion,
  };
};

export const commerceProjectionService = createCommerceProjectionService();
