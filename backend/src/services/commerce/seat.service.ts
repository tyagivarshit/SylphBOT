import prisma from "../../config/prisma";
import { PricingCatalogService } from "./catalog.service";

export class SeatBillingService {
  /**
   * Gets the current number of user seats in a business workspace.
   */
  static async getSeatCount(businessId: string): Promise<number> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        _count: {
          select: { users: true },
        },
      },
    }).catch(() => null);

    return business?._count?.users ?? 0;
  }

  /**
   * Resolves the default seat limit based on the business's active plan.
   */
  static async getSeatLimit(businessId: string): Promise<number> {
    // Default base limits if not specified
    const DEFAULT_PLAN_SEATS: Record<string, number> = {
      LOCKED: 1,
      FREE_LOCKED: 1,
      BASIC: 5,
      PRO: 15,
      ELITE: 100, // virtually unlimited for self-serve elite
    };

    const subscription = await prisma.subscriptionLedger.findFirst({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
    }).catch(() => null);

    if (!subscription) {
      return 1;
    }

    const planConfig = await PricingCatalogService.getPlanConfig(subscription.planCode, businessId);
    if (!planConfig) {
      return 1;
    }

    // Check if there is a custom seat override in subscription metadata
    const meta = subscription.metadata && typeof subscription.metadata === "object"
      ? (subscription.metadata as Record<string, any>)
      : {};
    if (typeof meta.customSeatLimit === "number") {
      return meta.customSeatLimit;
    }

    return DEFAULT_PLAN_SEATS[planConfig.type.toUpperCase()] ?? 5;
  }

  /**
   * Checks if a business can add more seats to their workspace.
   */
  static async checkSeatAvailability(businessId: string, additionalSeatsDelta: number = 1): Promise<{ allowed: boolean; current: number; limit: number }> {
    const current = await this.getSeatCount(businessId);
    const limit = await this.getSeatLimit(businessId);

    return {
      allowed: current + additionalSeatsDelta <= limit,
      current,
      limit,
    };
  }

  /**
   * Calculates overage charges for extra seats.
   * e.g., $10 / 750 INR per extra seat per month.
   */
  static async calculateSeatOverageCharges(
    businessId: string,
    currency: "INR" | "USD" = "USD"
  ): Promise<{ extraSeats: number; chargeMinor: number }> {
    const current = await this.getSeatCount(businessId);
    const limit = await this.getSeatLimit(businessId);

    const extraSeats = Math.max(0, current - limit);
    if (extraSeats === 0) {
      return { extraSeats: 0, chargeMinor: 0 };
    }

    const rate = currency === "INR" ? 75000 : 1000; // 750 INR or 10 USD per extra seat
    return {
      extraSeats,
      chargeMinor: rate * extraSeats,
    };
  }
}
