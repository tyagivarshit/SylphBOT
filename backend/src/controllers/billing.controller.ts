import { Request, Response } from "express";
import prisma from "../config/prisma";
import { stripe, createCheckoutSession } from "../services/stripe.service";

export class BillingController {

  /* ======================================
     CHECKOUT (BUY PLAN)
  ====================================== */

  static async checkout(req: Request, res: Response) {

    try {

      const { plan } = req.body;

      const businessId = req.user?.businessId;
      const email = req.user?.email;

      if (!businessId || !email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!plan) {
        return res.status(400).json({
          success: false,
          message: "Plan is required"
        });
      }

      const session = await createCheckoutSession(
        email,
        businessId,
        plan
      );

      return res.json({
        success: true,
        url: session.url
      });

    } catch (error) {

      console.error("Checkout error:", error);

      return res.status(500).json({
        success: false,
        message: "Checkout failed"
      });

    }

  }

  /* ======================================
     CREATE BILLING PORTAL
  ====================================== */

  static async createPortal(req: Request, res: Response) {

    try {

      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const subscription = await prisma.subscription.findUnique({
        where: { businessId }
      });

      if (!subscription?.stripeCustomerId) {
        return res.status(400).json({
          success: false,
          message: "No Stripe customer found"
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: process.env.FRONTEND_URL + "/billing"
      });

      return res.json({
        success: true,
        url: session.url
      });

    } catch (error) {

      console.error("Billing portal error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create billing portal"
      });

    }

  }

  /* ======================================
     CANCEL SUBSCRIPTION
  ====================================== */

  static async cancelSubscription(req: Request, res: Response) {

    try {

      const businessId = req.user?.businessId;

      if (!businessId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const subscription = await prisma.subscription.findUnique({
        where: { businessId }
      });

      if (!subscription?.stripeSubscriptionId) {
        return res.status(400).json({
          success: false,
          message: "Subscription not found"
        });
      }

      await stripe.subscriptions.cancel(
        subscription.stripeSubscriptionId
      );

      await prisma.subscription.update({
        where: { businessId },
        data: {
          status: "INACTIVE"
        }
      });

      return res.json({
        success: true,
        message: "Subscription cancelled"
      });

    } catch (error) {

      console.error("Cancel subscription error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to cancel subscription"
      });

    }

  }

}