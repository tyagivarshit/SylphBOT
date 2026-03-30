import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import Redis from "ioredis";
import { getPlanKey } from "../config/plan.config";

const redis = new Redis(process.env.REDIS_URL as string);

const CACHE_TTL = 60 * 3;

const getKey = (businessId: string) => `sub:${businessId}`;

type BillingContext = {
  subscription: any | null;
  plan: any | null;
  planKey: string;
  status: "INACTIVE" | "ACTIVE" | "TRIAL";
  isLimited: boolean;
  upgradeRequired: boolean;
};

export const attachBillingContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      });
    }

    let subscription: any = null;

    const cacheKey = getKey(businessId);
    const cached = await redis.get(cacheKey);

    if (cached) {
      subscription = JSON.parse(cached);
    } else {
      subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
      });

      if (subscription) {
        await redis.set(
          cacheKey,
          JSON.stringify(subscription),
          "EX",
          CACHE_TTL
        );
      }
    }

    const now = new Date();

    let context: BillingContext = {
      subscription: null,
      plan: null,
      planKey: "FREE_LOCKED",
      status: "INACTIVE",
      isLimited: true,
      upgradeRequired: true,
    };

    if (subscription && subscription.plan) {
      const planKey = getPlanKey(subscription.plan);

      context = {
        subscription,
        plan: subscription.plan,
        planKey,
        status: "ACTIVE",
        isLimited: false,
        upgradeRequired: false,
      };

      /* ============================= */
      /* TRIAL */
      /* ============================= */

      if (subscription.isTrial) {
        if (
          subscription.currentPeriodEnd &&
          now <= new Date(subscription.currentPeriodEnd)
        ) {
          context.status = "TRIAL";
        } else {
          context.status = "INACTIVE";
          context.planKey = "FREE_LOCKED";
          context.isLimited = true;
          context.upgradeRequired = true;
        }
      }

      /* ============================= */
      /* GRACE PERIOD (🔥 NEW) */
      /* ============================= */

      if (subscription.status === "PAST_DUE") {
        if (
          subscription.graceUntil &&
          now <= new Date(subscription.graceUntil)
        ) {
          context.status = "ACTIVE"; // allow during grace
        } else {
          context.status = "INACTIVE";
          context.planKey = "FREE_LOCKED";
          context.isLimited = true;
          context.upgradeRequired = true;
        }
      }

      /* ============================= */
      /* CANCELLED */
      /* ============================= */

      if (subscription.status === "CANCELLED") {
        context.status = "INACTIVE";
        context.planKey = "FREE_LOCKED";
        context.isLimited = true;
        context.upgradeRequired = true;
      }
    }

    (req as any).subscription = subscription;
    (req as any).billing = context;

    next();

  } catch (error) {
    console.error("❌ Subscription Middleware Error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};