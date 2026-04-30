import prisma from "../config/prisma";
import { commerceAuthorityService } from "./commerceAuthority.service";
import { publishCommerceEvent } from "./commerceEvent.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";
import { mergeMetadata } from "./commerce/shared";
import { subscriptionEngineService } from "./subscriptionEngine.service";

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const createDunningEngineService = () => {
  const runFailedPaymentLadder = async ({
    businessId,
    now = new Date(),
  }: {
    businessId: string;
    now?: Date;
  }) => {
    const runtime = await getIntelligenceRuntimeInfluence({
      businessId,
    }).catch(() => null);
    const policy = await prisma.commercePolicy.findFirst({
      where: {
        businessId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const dunningRules = toRecord(policy?.dunningRules);
    const controlGates = toRecord(policy?.controlGates);
    const override = await commerceAuthorityService.getActiveManualOverride({
      businessId,
      scope: "DUNNING",
      provider: "ALL",
    });

    if (
      Boolean(controlGates.pauseDunning) ||
      Boolean(controlGates.stopCollections) ||
      Boolean(override) ||
      String(runtime?.overrideScopes.DUNNING_PAUSE?.action || "") === "PAUSE"
    ) {
      return {
        count: 0,
        paused: true,
        override: override
          ? {
              reason: override.reason,
              expiresAt: override.expiresAt?.toISOString() || null,
              priority: override.priority,
            }
          : null,
      };
    }

    const maxRetries = Math.max(1, Math.floor(Number(dunningRules.maxRetries || 4)));
    const retryWindowHours = Math.max(
      1,
      Math.floor(
        Number(
          runtime?.controls.commerce.dunningRetryWindowHours ||
            dunningRules.retryWindowHours ||
            24
        )
      )
    );

    const overdue = await prisma.invoiceLedger.findMany({
      where: {
        businessId,
        status: {
          in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"],
        },
        dueAt: {
          lte: now,
        },
      },
      orderBy: {
        dueAt: "asc",
      },
      take: 200,
    });

    let processed = 0;

    for (const invoice of overdue) {
      const invoiceMeta = toRecord(invoice.metadata);

      if (Boolean(invoiceMeta.stopDunning) || Boolean(invoiceMeta.customerOptOut)) {
        continue;
      }

      const currentStep = Number(invoice.retryCount || 0);
      const dedupeKey = `dunning:${invoice.id}:step:${currentStep + 1}`;

      const existingEvent = await prisma.eventOutbox.findUnique({
        where: {
          dedupeKey,
        },
      });

      if (existingEvent) {
        continue;
      }

      if (currentStep >= maxRetries) {
        await prisma.invoiceLedger.update({
          where: {
            id: invoice.id,
          },
          data: {
            status: "WRITTEN_OFF",
            writeOffAt: now,
            metadata: mergeMetadata(invoice.metadata, {
              dunningEscalatedAt: now.toISOString(),
              dunningEscalation: "owner",
            }) as any,
          },
        });

        if (invoice.subscriptionId) {
          const subscription = await prisma.subscriptionLedger.findUnique({
            where: {
              id: invoice.subscriptionId,
            },
          });

          if (subscription) {
            await subscriptionEngineService.transitionSubscriptionStatus({
              businessId,
              subscriptionKey: subscription.subscriptionKey,
              nextStatus: "PAST_DUE",
              metadata: {
                dunningEscalatedAt: now.toISOString(),
              },
            }).catch(() => undefined);
          }
        }

        const business = await prisma.business.findUnique({
          where: {
            id: businessId,
          },
          select: {
            ownerId: true,
          },
        });

        if (business?.ownerId) {
          await prisma.notification.create({
            data: {
              userId: business.ownerId,
              businessId,
              type: "SYSTEM",
              title: "Dunning escalation",
              message: `Invoice ${invoice.invoiceKey} reached dunning limit and moved to write-off.`,
              read: false,
            },
          }).catch(() => undefined);
        }

        await publishCommerceEvent({
          event: "commerce.dunning.step_executed",
          businessId,
          aggregateType: "invoice_ledger",
          aggregateId: invoice.id,
          eventKey: `${invoice.invoiceKey}:writeoff`,
          payload: {
            businessId,
            invoiceId: invoice.id,
            invoiceKey: invoice.invoiceKey,
            step: currentStep,
            action: "write_off",
            maxRetries,
          },
        });

        processed += 1;
        continue;
      }

      const nextDueAt = new Date(now.getTime() + retryWindowHours * 60 * 60 * 1000);

      await prisma.invoiceLedger.update({
        where: {
          id: invoice.id,
        },
        data: {
          status: "OVERDUE",
          retryCount: {
            increment: 1,
          },
          dueAt: nextDueAt,
          metadata: mergeMetadata(invoice.metadata, {
            lastDunningAttemptAt: now.toISOString(),
            nextRetryAt: nextDueAt.toISOString(),
            dunningStep: currentStep + 1,
          }) as any,
        },
      });

      await publishCommerceEvent({
        event: "commerce.dunning.step_executed",
        businessId,
        aggregateType: "invoice_ledger",
        aggregateId: invoice.id,
        eventKey: dedupeKey,
        payload: {
          businessId,
          invoiceId: invoice.id,
          invoiceKey: invoice.invoiceKey,
          step: currentStep + 1,
          maxRetries,
          nextRetryAt: nextDueAt.toISOString(),
        },
      });

      processed += 1;
    }

    return {
      count: processed,
      paused: false,
      maxRetries,
      retryWindowHours,
      intelligencePolicyVersion: runtime?.policyVersion || null,
    };
  };

  return {
    runFailedPaymentLadder,
  };
};

export const dunningEngineService = createDunningEngineService();
