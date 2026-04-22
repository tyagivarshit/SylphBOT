import { Request, Response } from "express";
import prisma from "../config/prisma";
import { stripe } from "../services/stripe.service";
import { createCheckoutSession } from "../services/checkout.service";
import { env } from "../config/env";
import { getInvoices } from "../services/invoice.service";
import { resolveBillingCurrency } from "../services/billingGeo.service";
import { loadBillingContext } from "../middleware/subscription.middleware";
import { syncCheckoutSession } from "../services/billingSync.service";
import {
  getAddonCatalog,
  getPublicPricingPlans,
  TRIAL_DAYS,
} from "../config/pricing.config";
import { getUsageOverview } from "../services/usage.service";
import {
  getStandardStripePriceCatalog,
  type PlanType as StripePlanType,
  type PricingCurrency as StripePricingCurrency,
} from "../config/stripe.price.map";

/* ====================================== */
/* USER CONTEXT */
/* ====================================== */

async function getUserContext(req: Request) {
  const userId = req.user?.id;
  const businessId = req.user?.businessId;

  if (!userId || !businessId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Unauthorized");
  }

  return {
    userId,
    businessId,
    email: user.email,
  };
}

/* ====================================== */
/* CONTROLLER */
/* ====================================== */

type PublicPlanPriceSnapshot = Record<
  StripePlanType,
  {
    monthlyPrice: Record<StripePricingCurrency, number>;
    yearlyPrice: Record<StripePricingCurrency, number>;
    priceIds: Partial<
      Record<
        StripePricingCurrency,
        Partial<Record<"monthly" | "yearly", string>>
      >
    >;
  }
>;

let publicPricingCache:
  | {
      expiresAt: number;
      value: PublicPlanPriceSnapshot;
    }
  | null = null;

const buildEmptyPriceSnapshot = (): PublicPlanPriceSnapshot => ({
  BASIC: {
    monthlyPrice: { INR: 0, USD: 0 },
    yearlyPrice: { INR: 0, USD: 0 },
    priceIds: {},
  },
  PRO: {
    monthlyPrice: { INR: 0, USD: 0 },
    yearlyPrice: { INR: 0, USD: 0 },
    priceIds: {},
  },
  ELITE: {
    monthlyPrice: { INR: 0, USD: 0 },
    yearlyPrice: { INR: 0, USD: 0 },
    priceIds: {},
  },
});

const getStripePublicPricing = async () => {
  const cached = publicPricingCache;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const catalog = getStandardStripePriceCatalog();

  if (!env.STRIPE_SECRET_KEY || !catalog.length) {
    return null;
  }

  const prices = await Promise.all(
    catalog.map(async (entry) => {
      const price = await stripe.prices.retrieve(entry.priceId);

      return {
        entry,
        price,
      };
    })
  );

  const snapshot = buildEmptyPriceSnapshot();

  for (const { entry, price } of prices) {
    const amount = typeof price.unit_amount === "number"
      ? price.unit_amount / 100
      : null;

    if (amount === null) {
      continue;
    }

    snapshot[entry.plan].priceIds[entry.currency] = {
      ...(snapshot[entry.plan].priceIds[entry.currency] || {}),
      [entry.billing]: entry.priceId,
    };

    if (entry.billing === "monthly") {
      snapshot[entry.plan].monthlyPrice[entry.currency] = amount;
      continue;
    }

    snapshot[entry.plan].yearlyPrice[entry.currency] = amount;
  }

  publicPricingCache = {
    value: snapshot,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  return snapshot;
};

export class BillingController {
  private static async buildBillingResponse(
    businessId: string,
    req: Request
  ) {
    const [{ subscription, context }, usage] = await Promise.all([
      loadBillingContext(businessId),
      getUsageOverview(businessId),
    ]);

    let invoices: any[] = [];

    if (subscription?.stripeCustomerId) {
      invoices = await getInvoices(subscription.stripeCustomerId);
    }

    return {
      success: true,
      subscription,
      billing: context,
      usage: {
        aiCallsUsed: usage.usage.ai.monthlyUsed,
        messagesUsed: usage.usage.messages.used,
        followupsUsed: usage.usage.automation.used,
        summary: usage,
      },
      currency:
        subscription?.currency || resolveBillingCurrency(req),
      invoices,
    };
  }

  private static async handleCheckout(
    req: Request,
    res: Response
  ) {
    try {
      const { plan, coupon } = req.body;
      const billing = String(req.body?.billing || "monthly");

      if (!plan) {
        return res.status(400).json({
          success: false,
          message: "Plan is required",
        });
      }

      const { businessId, email, userId } = await getUserContext(req);

      const session = await createCheckoutSession(
        email,
        businessId,
        userId,
        plan,
        billing,
        req,
        resolveBillingCurrency(req),
        coupon
      );

      return res.json({
        success: true,
        url: session.url,
      });
    } catch (error: any) {
      if (error.message === "Unauthorized") {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      if (
        error.message?.includes("Currency cannot be changed") ||
        error.message?.includes("Invalid plan") ||
        error.message?.includes("Invalid billing")
      ) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      console.error("Billing checkout error:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Checkout failed",
      });
    }
  }

  static async getPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.plan.findMany({
        where: {
          type: {
            in: ["BASIC", "PRO", "ELITE"],
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
          priceIdINR: true,
          priceIdUSD: true,
        },
      });
      const livePricing = await getStripePublicPricing().catch((error) => {
        console.warn("Stripe pricing sync failed:", error);
        return null;
      });

      const planMap = new Map(
        plans.map((plan) => [String(plan.type || plan.name).toUpperCase(), plan])
      );

      return res.json({
        success: true,
        trialDays: TRIAL_DAYS,
        addons: getAddonCatalog(),
        plans: getPublicPricingPlans().map((plan) => {
          const existing =
            planMap.get(plan.key) || planMap.get(plan.label.toUpperCase());
          const livePlanPricing = livePricing?.[plan.key as StripePlanType];
          const monthlyPrice = {
            INR:
              livePlanPricing?.monthlyPrice?.INR || plan.monthlyPrice.INR,
            USD:
              livePlanPricing?.monthlyPrice?.USD || plan.monthlyPrice.USD,
          };
          const yearlyPrice = {
            INR:
              livePlanPricing?.yearlyPrice?.INR || plan.yearlyPrice.INR,
            USD:
              livePlanPricing?.yearlyPrice?.USD || plan.yearlyPrice.USD,
          };

          return {
            id: existing?.id || plan.key,
            name: plan.label,
            type: existing?.type || plan.key,
            priceIdINR:
              livePlanPricing?.priceIds?.INR?.monthly ||
              existing?.priceIdINR ||
              null,
            priceIdUSD:
              livePlanPricing?.priceIds?.USD?.monthly ||
              existing?.priceIdUSD ||
              null,
            description: plan.description,
            popular: Boolean(plan.popular),
            monthlyPrice,
            yearlyPrice,
            limits: plan.limits,
            features: plan.features,
          };
        }),
      });

    } catch (error) {
      console.error("Get plans error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch plans",
      });
    }
  }

  static async getBilling(req: Request, res: Response) {
    try {
      const { businessId } = await getUserContext(req);
      res.setHeader("Cache-Control", "no-store");

      return res.json(
        await BillingController.buildBillingResponse(
          businessId,
          req
        )
      );

    } catch (error) {

      console.error("Billing fetch error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch billing",
      });

    }
  }

  static async checkout(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res);
  }

  static async createCheckoutSession(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res);
  }

  static async confirmCheckout(req: Request, res: Response) {
    try {
      const sessionId =
        String(req.query.session_id || req.body?.session_id || "");

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "session_id is required",
        });
      }

      const { businessId } = await getUserContext(req);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const sessionBusinessId =
        session.metadata?.businessId || session.client_reference_id;

      if (!sessionBusinessId || sessionBusinessId !== businessId) {
        return res.status(403).json({
          success: false,
          message: "Checkout session does not belong to this user",
        });
      }

      await syncCheckoutSession(session, {
        strictBusinessId: businessId,
      });

      res.setHeader("Cache-Control", "no-store");

      return res.json(
        await BillingController.buildBillingResponse(
          businessId,
          req
        )
      );
    } catch (error: any) {
      console.error("Confirm checkout error:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Checkout confirmation failed",
      });
    }
  }

  static async createPortal(req: Request, res: Response) {
    try {

      const { businessId } = await getUserContext(req);

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
      });

      if (!subscription?.stripeCustomerId) {
        return res.status(400).json({
          success: false,
          message: "No customer found",
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${env.FRONTEND_URL}/billing`,
      });

      return res.json({
        success: true,
        url: session.url,
      });

    } catch (error) {

      console.error("Portal error:", error);

      return res.status(500).json({
        success: false,
        message: "Portal failed",
      });

    }
  }

  static async cancelSubscription(req: Request, res: Response) {
    try {

      const { businessId } = await getUserContext(req);

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
      });

      if (!subscription?.stripeSubscriptionId) {
        return res.status(400).json({
          success: false,
          message: "No active paid subscription found",
        });
      }

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      /* ❌ DB update removed (webhook करेगा) */

      return res.json({
        success: true,
        message: "Subscription will cancel at period end",
      });

    } catch (error) {

      console.error("Cancel error:", error);

      return res.status(500).json({
        success: false,
        message: "Cancel failed",
      });

    }
  }

  static async upgradePlan(req: Request, res: Response) {
    return BillingController.handleCheckout(req, res);
  }

}
