import { Request, Response } from "express";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { resolveBillingCurrency } from "../services/billingGeo.service";
import { loadBillingContext } from "../middleware/subscription.middleware";
import { commerceProjectionService } from "../services/commerceProjection.service";
import { paymentIntentService } from "../services/paymentIntent.service";
import { proposalEngineService } from "../services/proposalEngine.service";
import { subscriptionEngineService } from "../services/subscriptionEngine.service";
import {
  getAddonCatalog,
  getPricingPlanConfig,
  getPublicPricingPlans,
  TRIAL_DAYS,
} from "../config/pricing.config";
import { getUsageOverview } from "../services/usage.service";

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

export class BillingController {
  private static async buildBillingResponse(
    businessId: string,
    req: Request
  ) {
    const [{ subscription, context }, usage] = await Promise.all([
      loadBillingContext(businessId),
      getUsageOverview(businessId),
    ]);
    const invoices = await prisma.invoiceLedger.findMany({
      where: {
        businessId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      select: {
        invoiceKey: true,
        status: true,
        currency: true,
        subtotalMinor: true,
        taxMinor: true,
        totalMinor: true,
        paidMinor: true,
        dueAt: true,
        issuedAt: true,
        paidAt: true,
        externalInvoiceId: true,
        createdAt: true,
      },
    });

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
      const { plan, coupon, quantity } = req.body;
      const billing = String(req.body?.billing || "monthly");
      const normalizedPlan = String(plan || "").trim().toUpperCase();
      const normalizedBilling =
        billing === "yearly"
          ? "yearly"
          : billing === "monthly"
          ? "monthly"
          : null;
      const allowedPlans = new Set(["BASIC", "PRO", "ELITE"]);

      if (!normalizedPlan) {
        return res.status(400).json({
          success: false,
          message: "Plan is required",
        });
      }

      if (!allowedPlans.has(normalizedPlan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid plan selected",
        });
      }

      if (!normalizedBilling) {
        return res.status(400).json({
          success: false,
          message: "Invalid billing cycle",
        });
      }

      const { businessId } = await getUserContext(req);
      const currency = resolveBillingCurrency(req);
      const pricingPlan = getPricingPlanConfig(normalizedPlan);
      const unitPrice = normalizedBilling === "yearly"
        ? pricingPlan.yearlyPrice[currency]
        : pricingPlan.monthlyPrice[currency];
      const proposal = await proposalEngineService.createProposal({
        businessId,
        planCode: normalizedPlan,
        billingCycle: normalizedBilling,
        currency,
        quantity: Math.max(1, Number(quantity || 1)),
        customUnitPriceMinor: Math.round(Number(unitPrice || 0) * 100),
        source: "SELF",
        requestedBy: "SELF",
        metadata: {
          checkoutSource: "billing_controller",
          coupon: coupon || null,
        },
        idempotencyKey: `checkout:proposal:${businessId}:${normalizedPlan}:${normalizedBilling}:${currency}`,
      });
      const readyProposal =
        proposal.status === "APPROVED" || proposal.status === "SENT"
          ? proposal
          : await proposalEngineService.sendProposal({
              businessId,
              proposalKey: proposal.proposalKey,
            });
      const paymentIntent = await paymentIntentService.createCheckout({
        businessId,
        proposalKey: readyProposal.proposalKey,
        provider: "STRIPE",
        source: "SELF",
        description: `${normalizedPlan} ${normalizedBilling} plan checkout`,
        successUrl: `${env.FRONTEND_URL}/billing/success?proposal=${readyProposal.proposalKey}`,
        cancelUrl: `${env.FRONTEND_URL}/billing/cancel?proposal=${readyProposal.proposalKey}`,
        metadata: {
          coupon: coupon || null,
          origin: "billing_controller",
        },
        idempotencyKey: `checkout:payment_intent:${businessId}:${readyProposal.proposalKey}`,
      });

      return res.json({
        success: true,
        url: paymentIntent.checkoutUrl,
        proposalKey: readyProposal.proposalKey,
        paymentIntentKey: paymentIntent.paymentIntentKey,
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
        error.message?.includes("Invalid billing") ||
        error.message?.includes("proposal_not_checkout_ready")
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

          return {
            id: existing?.id || plan.key,
            name: plan.label,
            type: existing?.type || plan.key,
            priceIdINR: existing?.priceIdINR || null,
            priceIdUSD: existing?.priceIdUSD || null,
            description: plan.description,
            popular: Boolean(plan.popular),
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
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
      const paymentIntent = await prisma.paymentIntentLedger.findFirst({
        where: {
          businessId,
          provider: "STRIPE",
          providerPaymentIntentId: sessionId,
        },
        select: {
          paymentIntentKey: true,
          providerPaymentIntentId: true,
        },
      });

      if (!paymentIntent?.providerPaymentIntentId) {
        return res.status(403).json({
          success: false,
          message: "Checkout session does not belong to this user",
        });
      }

      await commerceProjectionService.reconcileProviderWebhook({
        provider: "STRIPE",
        strictBusinessId: businessId,
        body: {
          id: `manual_confirm_${paymentIntent.providerPaymentIntentId}`,
          type: "checkout.session.completed",
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: paymentIntent.providerPaymentIntentId,
              metadata: {
                businessId,
                paymentIntentKey: paymentIntent.paymentIntentKey,
              },
            },
          },
        },
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
    return res.status(410).json({
      success: false,
      message: "billing_portal_deprecated_use_canonical_commerce",
    });
  }

  static async cancelSubscription(req: Request, res: Response) {
    try {
      const { businessId } = await getUserContext(req);
      const subscription = await prisma.subscriptionLedger.findFirst({
        where: {
          businessId,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      if (!subscription) {
        return res.status(400).json({
          success: false,
          message: "No active subscription found",
        });
      }

      await subscriptionEngineService.applyLifecycleAction({
        businessId,
        subscriptionKey: subscription.subscriptionKey,
        action: "cancel",
        metadata: {
          source: "billing_controller",
          requestedBy: "SELF",
        },
      });

      return res.json({
        success: true,
        message: "Subscription cancellation submitted",
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

