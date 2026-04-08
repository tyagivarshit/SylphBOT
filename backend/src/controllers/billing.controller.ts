import { Request, Response } from "express";
import prisma from "../config/prisma";
import { stripe } from "../services/stripe.service";
import { createCheckoutSession } from "../services/checkout.service";
import { env } from "../config/env";
import { getInvoices } from "../services/invoice.service";
import { resolveBillingCurrency } from "../services/billingGeo.service";
import { loadBillingContext } from "../middleware/subscription.middleware";
import { confirmCheckoutSession } from "../services/billingSync.service";

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
    const { subscription, context } = await loadBillingContext(
      businessId
    );

    let invoices: any[] = [];

    if (subscription?.stripeCustomerId) {
      invoices = await getInvoices(subscription.stripeCustomerId);
    }

    return {
      success: true,
      subscription,
      billing: context,
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
      const { plan, billing, coupon } = req.body;

      if (!plan || !billing) {
        return res.status(400).json({
          success: false,
          message: "Plan & billing required",
        });
      }

      const { businessId, email } = await getUserContext(req);

      const session = await createCheckoutSession(
        email,
        businessId,
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

      return res.json({
        success: true,
        plans,
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

      await confirmCheckoutSession(sessionId, businessId);

      res.setHeader("Cache-Control", "no-store");

      return res.json(
        await BillingController.buildBillingResponse(
          businessId,
          req
        )
      );
    } catch (error: any) {
      if (
        error.message?.includes("does not belong") ||
        error.message?.includes("missing billing metadata")
      ) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

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
