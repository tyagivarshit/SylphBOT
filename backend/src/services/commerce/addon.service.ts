
export interface AddonProduct {
  code: string;
  name: string;
  description: string;
  priceMinor: {
    INR: number;
    USD: number;
  };
  billingCycle: "one_time" | "recurring";
  stripePriceIdUSD?: string;
  stripePriceIdINR?: string;
}

export const ADDON_CATALOG: Record<string, AddonProduct> = {
  EXTRA_WHATSAPP: {
    code: "EXTRA_WHATSAPP",
    name: "Extra WhatsApp Numbers",
    description: "Connect additional WhatsApp phone numbers to your inbox",
    priceMinor: { INR: 150000, USD: 2000 }, // 1500 INR or 20 USD per month
    billingCycle: "recurring",
    stripePriceIdUSD: process.env.STRIPE_PRICE_ADDON_WHATSAPP_USD || "price_addon_whatsapp_usd",
  },
  EXTRA_TEAM_SEAT: {
    code: "EXTRA_TEAM_SEAT",
    name: "Extra Team Members",
    description: "Add additional admin or agent seats to your workspace",
    priceMinor: { INR: 75000, USD: 1000 }, // 750 INR or 10 USD per month
    billingCycle: "recurring",
    stripePriceIdUSD: process.env.STRIPE_PRICE_ADDON_SEAT_USD || "price_addon_seat_usd",
  },
  EXTRA_AI_CREDITS_50K: {
    code: "EXTRA_AI_CREDITS_50K",
    name: "50,000 Extra AI Credits",
    description: "One-time booster pack of 50,000 AI credits",
    priceMinor: { INR: 350000, USD: 4900 }, // 3500 INR or 49 USD
    billingCycle: "one_time",
    stripePriceIdUSD: process.env.STRIPE_PRICE_ADDON_CREDITS_USD || "price_addon_credits_usd",
  },
  WHITE_LABEL: {
    code: "WHITE_LABEL",
    name: "White Label branding",
    description: "Remove SylphBOT branding and use custom domains",
    priceMinor: { INR: 750000, USD: 9900 }, // 7500 INR or 99 USD per month
    billingCycle: "recurring",
    stripePriceIdUSD: process.env.STRIPE_PRICE_ADDON_WHITELABEL_USD || "price_addon_whitelabel_usd",
  },
};

export class AddonService {
  /**
   * Resolves addon configuration by code.
   */
  static getAddon(code: string): AddonProduct | null {
    return ADDON_CATALOG[code.toUpperCase()] || null;
  }

  /**
   * Calculates the final consolidated billing amount for a period.
   * Plan + Sum(Addons) + Overage = Final Billing Amount
   */
  static calculateFinalBillingAmount(
    planBasePriceMinor: number,
    activeAddons: Array<{ code: string; quantity: number }>,
    currency: "INR" | "USD" = "USD"
  ): number {
    let total = planBasePriceMinor;

    for (const item of activeAddons) {
      const addon = this.getAddon(item.code);
      if (addon) {
        const rate = currency === "INR" ? addon.priceMinor.INR : addon.priceMinor.USD;
        total += rate * Math.max(0, item.quantity);
      }
    }

    return total;
  }
}
