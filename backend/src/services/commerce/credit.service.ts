import prisma from "../../config/prisma";
import logger from "../../utils/logger";

export type CreditType = "MONTHLY" | "BONUS" | "PURCHASED";

export const CREDIT_COSTS = {
  AI_REPLY: 10,
  EXECUTIVE_DECISION: 50,
  SIMULATION: 100,
};

export class CreditEngine {
  /**
   * Grants credits to a business.
   * Creates a transaction log in CreditLedger and updates AddonBalance.
   */
  static async grantCredits(
    businessId: string,
    amount: number,
    type: CreditType,
    reason: string,
    ttlDays?: number
  ): Promise<boolean> {
    try {
      const now = new Date();
      const expiresAt = ttlDays ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000) : null;

      await prisma.$transaction([
        prisma.creditLedger.create({
          data: {
            businessId,
            type,
            amount,
            reason,
            expiresAt,
          },
        }),
        prisma.addonBalance.upsert({
          where: {
            businessId_type: {
              businessId,
              type: "ai_credits",
            },
          },
          create: {
            businessId,
            type: "ai_credits",
            balance: amount,
          },
          update: {
            balance: {
              increment: amount,
            },
          },
        }),
      ]);

      logger.info(
        { businessId, amount, type, reason },
        "Granted credits successfully"
      );
      return true;
    } catch (error) {
      logger.error({ err: error, businessId }, "Failed to grant credits");
      return false;
    }
  }

  /**
   * Consumes credits from a business balance.
   */
  static async consumeCredits(
    businessId: string,
    amount: number,
    reason: string
  ): Promise<{ success: boolean; remaining: number }> {
    try {
      const balanceRecord = await prisma.addonBalance.findUnique({
        where: {
          businessId_type: {
            businessId,
            type: "ai_credits",
          },
        },
      });

      const currentBalance = balanceRecord?.balance ?? 0;
      if (currentBalance < amount) {
        return { success: false, remaining: currentBalance };
      }

      const updated = await prisma.$transaction(async (tx) => {
        // Record negative ledger entry
        await tx.creditLedger.create({
          data: {
            businessId,
            type: "MONTHLY", // Consume against standard/monthly pool
            amount: -amount,
            reason,
          },
        });

        // Decrement balance
        const updatedBalance = await tx.addonBalance.update({
          where: {
            businessId_type: {
              businessId,
              type: "ai_credits",
            },
          },
          data: {
            balance: {
              decrement: amount,
            },
          },
        });

        return updatedBalance.balance;
      });

      logger.info(
        { businessId, amount, reason, remaining: updated },
        "Consumed credits successfully"
      );
      return { success: true, remaining: updated };
    } catch (error) {
      logger.error({ err: error, businessId, amount }, "Failed to consume credits");
      return { success: false, remaining: 0 };
    }
  }

  /**
   * Gets the total credit balance for a business, after excluding expired grants.
   */
  static async getCreditBalance(businessId: string): Promise<number> {
    const balanceRecord = await prisma.addonBalance.findUnique({
      where: {
        businessId_type: {
          businessId,
          type: "ai_credits",
        },
      },
    });

    return balanceRecord?.balance ?? 0;
  }
}
