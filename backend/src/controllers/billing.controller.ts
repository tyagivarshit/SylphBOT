import { Request, Response } from "express";
import prisma from "../config/prisma";
import { createCheckoutSession } from "../services/stripe.service";

export class BillingController {

  static async checkout(req: Request, res: Response) {
    try {
      const businessId = req.user?.businessId;
      const email = req.user?.email;
      const { plan } = req.body;

      if (!businessId || !email) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      // ✅ Strict plan validation
      const allowedPlans = ["BASIC", "PRO", "ENTERPRISE"];

      if (!allowedPlans.includes(plan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid plan selected",
        });
      }

      // ✅ Check if plan exists in DB
      const dbPlan = await prisma.plan.findFirst({
        where: { name: plan },
      });

      if (!dbPlan) {
        return res.status(400).json({
          success: false,
          message: "Plan not configured",
        });
      }

      // ✅ Check existing subscription
      const existingSubscription =
        await prisma.subscription.findUnique({
          where: { businessId },
        });

      if (
        existingSubscription &&
        existingSubscription.status === "active" &&
        existingSubscription.planId === dbPlan.id
      ) {
        return res.status(400).json({
          success: false,
          message: "You are already subscribed to this plan",
        });
      }

      // 🔥 Create Stripe Checkout Session
      const session = await createCheckoutSession(
        email,
        businessId,
        plan
      );

      return res.status(200).json({
        success: true,
        url: session.url,
      });

    } catch (error) {
      console.error("Checkout Error:", error);

      return res.status(500).json({
        success: false,
        message: "Checkout failed",
      });
    }
  }
}