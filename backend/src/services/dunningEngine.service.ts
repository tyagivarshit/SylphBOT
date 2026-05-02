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
  const normalizeRetrySchedule = (input: unknown) => {
    if (!Array.isArray(input)) {
      return [] as number[];
    }

    return input
      .map((value) => Math.max(1, Math.floor(Number(value))))
      .filter((value) => Number.isFinite(value));
  };

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
    const retryScheduleHours = normalizeRetrySchedule(
      dunningRules.retryScheduleHours || runtime?.controls.commerce.dunningRetryScheduleHours
    );
    const graceWindowHours = Math.max(
      6,
      Math.floor(
        Number(
          runtime?.controls.commerce.graceWindowHours ||
            dunningRules.graceWindowHours ||
            72
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
              nextStatus: "PAUSED",
              metadata: {
                dunningEscalatedAt: now.toISOString(),
                dunningEscalation: "auto_suspension",
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

      const smartRetryHours =
        retryScheduleHours[Math.min(currentStep, Math.max(retryScheduleHours.length - 1, 0))] ||
        retryWindowHours;
      const smartNextDueAt = new Date(now.getTime() + smartRetryHours * 60 * 60 * 1000);
      const graceUntil = new Date(now.getTime() + graceWindowHours * 60 * 60 * 1000);

      await prisma.invoiceLedger.update({
        where: {
          id: invoice.id,
        },
        data: {
          status: "OVERDUE",
          retryCount: {
            increment: 1,
          },
          dueAt: smartNextDueAt,
          metadata: mergeMetadata(invoice.metadata, {
            lastDunningAttemptAt: now.toISOString(),
            nextRetryAt: smartNextDueAt.toISOString(),
            retryWindowHours: smartRetryHours,
            graceUntil: graceUntil.toISOString(),
            dunningStep: currentStep + 1,
          }) as any,
        },
      });

      if (invoice.subscriptionId) {
        const subscription = await prisma.subscriptionLedger.findUnique({
          where: {
            id: invoice.subscriptionId,
          },
        });

        if (subscription && subscription.status === "ACTIVE") {
          await subscriptionEngineService
            .transitionSubscriptionStatus({
              businessId,
              subscriptionKey: subscription.subscriptionKey,
              nextStatus: "PAST_DUE",
              metadata: {
                dunningStep: currentStep + 1,
                graceUntil: graceUntil.toISOString(),
              },
            })
            .catch(() => undefined);
        }
      }

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
          nextRetryAt: smartNextDueAt.toISOString(),
          graceUntil: graceUntil.toISOString(),
        },
      });

      const business = await prisma.business.findUnique({
        where: {
          id: businessId,
        },
        select: {
          ownerId: true,
        },
      });

      if (business?.ownerId) {
        await prisma.notification
          .create({
            data: {
              userId: business.ownerId,
              businessId,
              type: "SYSTEM",
              title: "Payment retry scheduled",
              message: `Invoice ${invoice.invoiceKey} retry #${currentStep + 1} scheduled.`,
              read: false,
            },
          })
          .catch(() => undefined);
      }

      processed += 1;
    }

    return {
      count: processed,
      paused: false,
      maxRetries,
      retryWindowHours,
      retryScheduleHours,
      graceWindowHours,
      intelligencePolicyVersion: runtime?.policyVersion || null,
    };
  };

  return {
    runFailedPaymentLadder,
  };
};

export const dunningEngineService = createDunningEngineService();
