import prisma from "../../config/prisma";

export interface SaaSMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  ltv: number;
  churnRate: number;
  retentionRate: number;
  trialConversionRate: number;
  expansionRevenue: number;
  contractionRevenue: number;
}

export class RevenueAnalyticsService {
  /**
   * Dynamically aggregates key SaaS metrics from the ledger database.
   */
  static async getSummaryMetrics(): Promise<SaaSMetrics> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Calculate active MRR and ARR
    const activeSubscriptions = await prisma.subscriptionLedger.findMany({
      where: {
        status: { in: ["ACTIVE", "TRIALING", "GRACE"] },
      },
      select: {
        amountMinor: true,
        billingCycle: true,
      },
    }).catch(() => []);

    let totalMonthlyRevenueMinor = 0;
    for (const sub of activeSubscriptions) {
      if (sub.billingCycle === "yearly") {
        totalMonthlyRevenueMinor += sub.amountMinor / 12;
      } else {
        totalMonthlyRevenueMinor += sub.amountMinor;
      }
    }

    const mrr = totalMonthlyRevenueMinor / 100; // Convert to currency unit
    const arr = mrr * 12;

    // 2. Count active accounts
    const activeCount = activeSubscriptions.length;
    const arpu = activeCount > 0 ? mrr / activeCount : 0;

    // 3. Churn and Retention rates (last 30 days)
    const churnCount = await prisma.subscriptionLedger.count({
      where: {
        status: { in: ["CANCELLED", "EXPIRED"] },
        updatedAt: { gte: thirtyDaysAgo },
      },
    }).catch(() => 0);

    const totalAccountsAtStart = activeCount + churnCount;
    const churnRate = totalAccountsAtStart > 0 ? churnCount / totalAccountsAtStart : 0;
    const retentionRate = 1 - churnRate;

    // LTV = ARPU / Churn Rate
    const ltv = churnRate > 0 ? arpu / churnRate : arpu * 12; // fallback to 12 months if 0 churn

    // 4. Expansion & Contraction Revenues
    const revenueChanges = await prisma.revenueRecognitionLedger.findMany({
      where: {
        occurredAt: { gte: thirtyDaysAgo },
      },
      select: {
        amountMinor: true,
        sourceEvent: true,
      },
    }).catch(() => []);

    let expansionRevenue = 0;
    let contractionRevenue = 0;

    for (const item of revenueChanges) {
      if (item.sourceEvent.toLowerCase().includes("upgrade") || item.sourceEvent.toLowerCase().includes("addon")) {
        expansionRevenue += Math.max(0, item.amountMinor) / 100;
      } else if (item.sourceEvent.toLowerCase().includes("downgrade")) {
        contractionRevenue += Math.abs(item.amountMinor) / 100;
      }
    }

    // 5. Trial Conversion Rate
    const trialEndedCount = await prisma.subscriptionLedger.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        planCode: { not: "FREE_LOCKED" },
        status: { not: "TRIALING" },
      },
    }).catch(() => 0);

    const trialConvertedCount = await prisma.subscriptionLedger.count({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        planCode: { not: "FREE_LOCKED" },
        status: { in: ["ACTIVE", "PAST_DUE"] },
      },
    }).catch(() => 0);

    const trialConversionRate = trialEndedCount > 0 ? trialConvertedCount / trialEndedCount : 0;

    return {
      mrr,
      arr,
      arpu,
      ltv,
      churnRate,
      retentionRate,
      trialConversionRate,
      expansionRevenue,
      contractionRevenue,
    };
  }
}
