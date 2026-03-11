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

      /* ---------------------------
      PLAN VALIDATION
      --------------------------- */

      const allowedPlans = ["BASIC", "PRO", "ENTERPRISE"];

      if (!allowedPlans.includes(plan)) {
        return res.status(400).json({
          success: false,
          message: "Invalid plan selected",
        });
      }

      const dbPlan = await prisma.plan.findFirst({
        where: { name: plan },
      });

      if (!dbPlan) {
        return res.status(400).json({
          success: false,
          message: "Plan not configured",
        });
      }

      const existingSubscription =
        await prisma.subscription.findUnique({
          where: { businessId },
        });

      if (
        existingSubscription &&
        existingSubscription.status === "ACTIVE" &&
        existingSubscription.planId === dbPlan.id
      ) {
        return res.status(400).json({
          success: false,
          message: "You are already subscribed to this plan",
        });
      }

      /* ---------------------------
      TRIAL PROTECTION
      --------------------------- */

      if (existingSubscription?.trialUsed) {

        const session = await createCheckoutSession(
          email,
          businessId,
          plan
        );

        return res.status(200).json({
          success: true,
          trial: false,
          url: session.url,
        });

      }

      /* ---------------------------
      START 7 DAY TRIAL
      --------------------------- */

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 7);

      if (existingSubscription) {

        await prisma.subscription.update({
          where: { businessId },
          data: {
            planId: dbPlan.id,
            status: "ACTIVE",
            isTrial: true,
            trialUsed: true,
            currentPeriodEnd: trialEnd,
          },
        });

      } else {

        await prisma.subscription.create({
          data: {
            businessId,
            planId: dbPlan.id,
            status: "ACTIVE",
            isTrial: true,
            trialUsed: true,
            currentPeriodEnd: trialEnd,
          },
        });

      }

      const session = await createCheckoutSession(
        email,
        businessId,
        plan
      );

      return res.status(200).json({
        success: true,
        trial: true,
        trialEndsAt: trialEnd,
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