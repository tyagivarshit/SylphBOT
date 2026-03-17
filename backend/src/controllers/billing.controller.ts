import { Request, Response } from "express";
import prisma from "../config/prisma";
import { stripe, createCheckoutSession } from "../services/stripe.service";
import { env } from "../config/env";
import geoip from "geoip-lite";

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
/* 🌍 GEO + CURRENCY */
/* ====================================== */

function getCurrency(req: Request) {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    req.socket.remoteAddress ||
    "";

  const geo = geoip.lookup(ip);
  const country = geo?.country || "IN";

  return country === "IN" ? "INR" : "USD";
}

/* ====================================== */
/* 💰 TAX */
/* ====================================== */

function getTaxRate(currency: string) {
  return currency === "INR" ? 0.18 : 0.1;
}

/* ====================================== */
/* CONTROLLER */
/* ====================================== */

export class BillingController {

  /* ====================================== */
  /* GET BILLING */
  /* ====================================== */

  static async getBilling(req: Request, res: Response) {
    try {

      const { businessId } = await getUserContext(req);

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
      });

      const currency = getCurrency(req);

      return res.json({
        success: true,
        subscription,
        currency,
      });

    } catch (error) {

      console.error("Billing fetch error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch billing",
      });

    }
  }

  /* ====================================== */
  /* CHECKOUT */
  /* ====================================== */

  static async checkout(req: Request, res: Response) {
    try {

      const { plan, billing } = req.body;

      if (!plan || !billing) {
        return res.status(400).json({
          success: false,
          message: "Plan & billing required",
        });
      }

      const { businessId, email } = await getUserContext(req);

      const currency = getCurrency(req);
      const taxRate = getTaxRate(currency);

      const session = await createCheckoutSession(
        email,
        businessId,
        plan,
        billing,
        req,
        currency
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

      /* 🔥 CURRENCY LOCK ERROR HANDLE */

      if (error.message?.includes("Currency cannot be changed")) {
        return res.status(400).json({
          success: false,
          message: "Currency cannot be changed once subscribed",
        });
      }

      console.error("Checkout error:", error);

      return res.status(500).json({
        success: false,
        message: "Checkout failed",
      });

    }
  }

  /* ====================================== */
  /* BILLING PORTAL */
  /* ====================================== */

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

  /* ====================================== */
  /* CANCEL SUBSCRIPTION */
  /* ====================================== */

  static async cancelSubscription(req: Request, res: Response) {
    try {

      const { businessId } = await getUserContext(req);

      const subscription = await prisma.subscription.findUnique({
        where: { businessId },
      });

      if (!subscription?.stripeSubscriptionId) {
        return res.status(400).json({
          success: false,
          message: "No subscription found",
        });
      }

      await stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      );

      await prisma.subscription.update({
        where: { businessId },
        data: {
          status: "CANCELLED",
        },
      });

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

  /* ====================================== */
  /* UPGRADE PLAN */
  /* ====================================== */

  static async upgradePlan(req: Request, res: Response) {
    try {

      const { plan, billing } = req.body;

      if (!plan || !billing) {
        return res.status(400).json({
          success: false,
          message: "Plan & billing required",
        });
      }

      const { businessId, email } = await getUserContext(req);

      const currency = getCurrency(req);
      const taxRate = getTaxRate(currency);

      const session = await createCheckoutSession(
        email,
        businessId,
        plan,
        billing,
        req,
        currency
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

      /* 🔥 CURRENCY LOCK ERROR HANDLE */

      if (error.message?.includes("Currency cannot be changed")) {
        return res.status(400).json({
          success: false,
          message: "Currency cannot be changed once subscribed",
        });
      }

      console.error("Upgrade error:", error);

      return res.status(500).json({
        success: false,
        message: "Upgrade failed",
      });

    }
  }

}