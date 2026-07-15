import prisma from "../../config/prisma";
import { getPlanFromPrice, type PlanType, type BillingInterval, type PricingCurrency } from "../../config/stripe.price.map";
import { PRICING_CONFIG, type PricingPlanConfig, getPricingPlanConfig } from "../../config/pricing.config";

export interface Product {
  id: string;
  name: string;
  description: string;
  type: "PLATFORM" | "ADDON" | "SERVICE";
}

export interface LimitConfig {
  key: string;
  limit: number; // -1 for unlimited
  interval: "DAILY" | "MONTHLY" | "ONCE";
}

export interface FeatureBundle {
  id: string;
  features: string[];
  limits: LimitConfig[];
  betaFlags?: string[];
}

export interface Price {
  id: string;
  stripePriceId: string;
  currency: "INR" | "USD";
  amountMinor: number;
  interval: "monthly" | "yearly";
  region: string; // e.g. "IN", "US", "GLOBAL"
}

export interface PlanConfig {
  id: string;
  product: Product;
  name: string;
  type: string; // "BASIC" | "PRO" | "ELITE" | "CUSTOM"
  prices: Price[];
  featureBundle: FeatureBundle;
  compatibleAddons: string[];
  isCustomContract: boolean;
}

export class PricingCatalogService {
  /**
   * Resolves a PlanConfig dynamically by its plan code/key.
   * If it's a standard plan, uses static configuration.
   * Otherwise, attempts to resolve from custom database definitions.
   */
  static async getPlanConfig(planCode: string, businessId?: string): Promise<PlanConfig | null> {
    const code = planCode.trim().toUpperCase();

    // Check if there is a custom database-configured plan first
    const dbPlan = await prisma.plan.findUnique({
      where: { type: code },
    }).catch(() => null);

    if (dbPlan) {
      const prices: Price[] = [];
      if (dbPlan.priceIdINR) {
        prices.push({
          id: `price_inr_${dbPlan.id}`,
          stripePriceId: dbPlan.priceIdINR,
          currency: "INR",
          amountMinor: 0, // Resolved from Stripe or static catalog
          interval: "monthly",
          region: "IN",
        });
      }
      if (dbPlan.priceIdUSD) {
        prices.push({
          id: `price_usd_${dbPlan.id}`,
          stripePriceId: dbPlan.priceIdUSD,
          currency: "USD",
          amountMinor: 0,
          interval: "monthly",
          region: "US",
        });
      }

      return {
        id: dbPlan.id,
        product: {
          id: "prod_platform_core",
          name: "SylphBOT Core Platform",
          description: "Core AI agent, automation, and messaging automation platform",
          type: "PLATFORM",
        },
        name: dbPlan.name,
        type: dbPlan.type,
        prices,
        featureBundle: {
          id: `features_${dbPlan.id}`,
          features: ["whatsapp", "instagram", "crm", "ai_replies"],
          limits: [
            { key: "ai_volume", limit: dbPlan.maxAiCalls, interval: "MONTHLY" },
            { key: "messages", limit: dbPlan.maxMessages, interval: "MONTHLY" },
            { key: "followups", limit: dbPlan.maxFollowups, interval: "MONTHLY" },
          ],
        },
        compatibleAddons: ["ai_credits", "contacts"],
        isCustomContract: code.startsWith("CUSTOM") || code.startsWith("ENTERPRISE"),
      };
    }

    // Fallback to static pricing config
    const staticConfig = getPricingPlanConfig(code);
    if (staticConfig && staticConfig.key !== "LOCKED") {
      const prices: Price[] = [
        {
          id: `price_inr_${staticConfig.key}_monthly`,
          stripePriceId: "", // resolved via Price Map
          currency: "INR",
          amountMinor: staticConfig.monthlyPrice.INR * 100,
          interval: "monthly",
          region: "IN",
        },
        {
          id: `price_usd_${staticConfig.key}_monthly`,
          stripePriceId: "",
          currency: "USD",
          amountMinor: staticConfig.monthlyPrice.USD * 100,
          interval: "monthly",
          region: "US",
        },
      ];

      return {
        id: `static_${staticConfig.key}`,
        product: {
          id: "prod_platform_core",
          name: "SylphBOT Core Platform",
          description: staticConfig.description,
          type: "PLATFORM",
        },
        name: staticConfig.label,
        type: staticConfig.key,
        prices,
        featureBundle: {
          id: `features_static_${staticConfig.key}`,
          features: ["whatsapp", "instagram", "crm", "ai_replies"],
          limits: [
            { key: "ai_volume", limit: staticConfig.limits.aiDailyLimit * 30, interval: "MONTHLY" },
            { key: "messages", limit: staticConfig.limits.messageLimit, interval: "MONTHLY" },
            { key: "contacts", limit: staticConfig.limits.contactsLimit, interval: "MONTHLY" },
          ],
        },
        compatibleAddons: ["ai_credits", "contacts"],
        isCustomContract: false,
      };
    }

    return null;
  }
}
