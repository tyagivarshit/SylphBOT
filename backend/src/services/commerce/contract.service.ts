import prisma from "../../config/prisma";
import logger from "../../utils/logger";
import { buildLedgerKey } from "./shared";

export interface CustomContractConfig {
  businessId: string;
  name: string;
  priceMinor: number;
  currency: "INR" | "USD";
  durationMonths: number;
  maxAiCalls: number;
  maxMessages: number;
  maxFollowups: number;
  maxSeats: number;
  allowBeta: boolean;
  manualInvoice: boolean;
}

export class EnterpriseContractService {
  /**
   * Provisions a custom enterprise contract for a business.
   * Modifies the SubscriptionLedger record directly to bind custom limits and overrides.
   */
  static async provisionContract(config: CustomContractConfig): Promise<boolean> {
    try {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + config.durationMonths * 30 * 24 * 60 * 60 * 1000);

      // Create or update a custom plan in the Plan catalog table
      const planCode = `ENTERPRISE_CUSTOM_${config.businessId.slice(-6).toUpperCase()}`;
      await prisma.plan.upsert({
        where: { type: planCode },
        create: {
          name: config.name,
          type: planCode,
          priceIdINR: config.currency === "INR" ? "custom" : null,
          priceIdUSD: config.currency === "USD" ? "custom" : null,
          maxAiCalls: config.maxAiCalls,
          maxMessages: config.maxMessages,
          maxFollowups: config.maxFollowups,
          earlyLimit: config.maxSeats,
        },
        update: {
          name: config.name,
          maxAiCalls: config.maxAiCalls,
          maxMessages: config.maxMessages,
          maxFollowups: config.maxFollowups,
          earlyLimit: config.maxSeats,
        },
      });

      // Insert or update subscription ledger to tie to this custom plan
      const existing = await prisma.subscriptionLedger.findFirst({
        where: { businessId: config.businessId },
        orderBy: { updatedAt: "desc" },
      });

      const metadata = {
        source: "enterprise_contract",
        contractProvisionedAt: now.toISOString(),
        manualInvoice: config.manualInvoice,
        customSeatLimit: config.maxSeats,
        allowBeta: config.allowBeta,
      };

      if (existing) {
        await prisma.subscriptionLedger.update({
          where: { id: existing.id },
          data: {
            planCode,
            status: "ACTIVE",
            amountMinor: config.priceMinor,
            currency: config.currency,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            renewAt: periodEnd,
            metadata,
          },
        });
      } else {
        await prisma.subscriptionLedger.create({
          data: {
            businessId: config.businessId,
            proposalId: "manual_enterprise",
            subscriptionKey: buildLedgerKey("subscription"),
            status: "ACTIVE",
            provider: "INTERNAL",
            planCode,
            billingCycle: "monthly",
            currency: config.currency,
            quantity: 1,
            unitPriceMinor: config.priceMinor,
            amountMinor: config.priceMinor,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            renewAt: periodEnd,
            metadata,
          },
        });
      }

      logger.info(
        { businessId: config.businessId, planCode, priceMinor: config.priceMinor },
        "Enterprise contract provisioned successfully"
      );
      return true;
    } catch (error) {
      logger.error({ err: error, config }, "Failed to provision enterprise contract");
      return false;
    }
  }
}
