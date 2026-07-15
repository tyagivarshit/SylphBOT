import prisma from "../../config/prisma";
import { PricingCatalogService } from "./catalog.service";
import { getAuthoritativeSubscriptionLKV } from "../../middleware/subscription.middleware";

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: "inactive_subscription" | "quota_exceeded" | "restricted_role" | "restricted_workspace" | "feature_not_in_plan" | "beta_flag_missing";
  limit?: number;
  currentUsage?: number;
}

export class EntitlementEngine {
  /**
   * Main entitlement evaluation point.
   * Checks plan permissions, usage counters, expirations, roles, and workspace limits.
   */
  static async checkEntitlement(
    businessId: string,
    featureKey: string,
    options?: {
      userId?: string;
      requiredUsageDelta?: number;
    }
  ): Promise<EntitlementCheckResult> {
    const now = new Date();
    const lkv = await getAuthoritativeSubscriptionLKV(businessId, now).catch(() => null);
    
    let subscription = lkv?.subscription;
    if (!subscription) {
      // Safe DB fallback
      subscription = await prisma.subscriptionLedger.findFirst({
        where: { businessId },
        orderBy: { updatedAt: "desc" },
      }).catch(() => null);
    }

    if (!subscription || !["ACTIVE", "TRIALING", "GRACE"].includes(subscription.status)) {
      return { allowed: false, reason: "inactive_subscription" };
    }

    // Resolve plan configuration dynamically
    const planConfig = await PricingCatalogService.getPlanConfig(subscription.planCode, businessId);
    if (!planConfig) {
      return { allowed: false, reason: "feature_not_in_plan" };
    }

    // 1. Verify feature boolean access
    const featureBundle = planConfig.featureBundle;
    const hasFeature = featureBundle.features.includes(featureKey);
    if (!hasFeature) {
      // Check if it's in a custom override list on the subscription metadata
      const meta = subscription.metadata && typeof subscription.metadata === "object"
        ? (subscription.metadata as Record<string, any>)
        : {};
      const customFeatures = Array.isArray(meta.customFeatures) ? meta.customFeatures : [];
      if (!customFeatures.includes(featureKey)) {
        return { allowed: false, reason: "feature_not_in_plan" };
      }
    }

    // 2. Verify beta flags if the feature is in beta
    if (featureBundle.betaFlags?.includes(featureKey)) {
      const meta = subscription.metadata && typeof subscription.metadata === "object"
        ? (subscription.metadata as Record<string, any>)
        : {};
      if (!meta.allowBeta) {
        return { allowed: false, reason: "beta_flag_missing" };
      }
    }

    // 3. Verify user role restrictions
    if (options?.userId) {
      const user = await prisma.user.findUnique({
        where: { id: options.userId },
        select: { role: true },
      }).catch(() => null);

      if (user) {
        // Workspace role constraints (e.g. some features like billing settings are restricted to Owner/Admin)
        if (featureKey === "manage_billing" && !["OWNER", "ADMIN"].includes(user.role)) {
          return { allowed: false, reason: "restricted_role" };
        }
      }
    }

    // 4. Verify Quotas / Usage Limits
    const limitObj = featureBundle.limits.find((l) => l.key === featureKey || (featureKey === "ai_replies" && l.key === "ai_volume"));
    if (limitObj) {
      const limitVal = limitObj.limit;
      if (limitVal !== -1) {
        // Fetch current usage event count for the billing period
        const periodStart = subscription.currentPeriodStart || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const periodStartKey = periodStart.toISOString().slice(0, 10);
        const aggregates = await prisma.usageDaily.findMany({
          where: {
            businessId,
            feature: featureKey,
            dateKey: {
              gte: periodStartKey,
            },
          },
          select: {
            count: true,
          },
        }).catch(() => []);
        const usageCount = (aggregates as any[]).reduce((sum, item) => sum + (item.count || 0), 0);

        const delta = options?.requiredUsageDelta ?? 1;
        if (usageCount + delta > limitVal) {
          return {
            allowed: false,
            reason: "quota_exceeded",
            limit: limitVal,
            currentUsage: usageCount,
          };
        }

        return {
          allowed: true,
          limit: limitVal,
          currentUsage: usageCount,
        };
      }
    }

    return { allowed: true };
  }
}
