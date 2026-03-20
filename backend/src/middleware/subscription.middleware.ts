import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

const CACHE_TTL = 60 * 5; // 5 min

/* ======================================
CACHE KEY
====================================== */

const getKey = (businessId: string) =>
  `sub:${businessId}`;

/* ======================================
SUBSCRIPTION GUARD (FINAL)
====================================== */

export const requireActiveSubscription = async (
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

    let subscription: any;

    /* ======================================
    🔥 CACHE FIRST
    ====================================== */

    const cached = await redis.get(getKey(businessId));

    if (cached) {
      subscription = JSON.parse(cached);
    } else {
      subscription = await prisma.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
      });

      if (subscription) {
        await redis.set(
          getKey(businessId),
          JSON.stringify(subscription),
          "EX",
          CACHE_TTL
        );
      }
    }

    /* ======================================
    NO SUBSCRIPTION
    ====================================== */

    if (!subscription || !subscription.plan) {
      return res.status(403).json({
        code: "NO_SUBSCRIPTION",
        message: "No active subscription",
        upgradeRequired: true,
      });
    }

    /* ======================================
    🔥 STATUS LOGIC FIX
    ====================================== */

    if (subscription.status === "PAST_DUE") {
      return res.status(403).json({
        code: "PAYMENT_FAILED",
        message: "Payment failed, update billing",
        upgradeRequired: true,
      });
    }

    /* CANCELLED BUT STILL VALID UNTIL PERIOD END */
    if (
      subscription.status === "CANCELLED" &&
      subscription.currentPeriodEnd &&
      new Date() < new Date(subscription.currentPeriodEnd)
    ) {
      (req as any).subscription = subscription;
      return next();
    }

    if (subscription.status !== "ACTIVE") {
      return res.status(403).json({
        code: "SUBSCRIPTION_INACTIVE",
        message: "Subscription inactive",
        upgradeRequired: true,
      });
    }

    /* ======================================
    TRIAL CHECK
    ====================================== */

    if (
      subscription.isTrial &&
      subscription.currentPeriodEnd &&
      new Date() > new Date(subscription.currentPeriodEnd)
    ) {
      return res.status(403).json({
        code: "TRIAL_EXPIRED",
        message: "Trial expired",
        upgradeRequired: true,
      });
    }

    /* ======================================
    ✅ ACCESS GRANTED
    ====================================== */

    (req as any).subscription = subscription;

    next();

  } catch (error) {

    console.error("Subscription Middleware Error:", error);

    return res.status(500).json({
      message: "Server error",
    });

  }
};