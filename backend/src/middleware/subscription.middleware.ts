import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL as string);

const CACHE_TTL = 60 * 5; // 5 min

/* ======================================
CACHE KEY
====================================== */

const getKey = (businessId: string) => `sub:${businessId}`;

/* ======================================
TYPES
====================================== */

type BillingContext = {
  subscription: any | null;
  plan: any | null;
  status: "NONE" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIAL_EXPIRED";
  isLimited: boolean;
  upgradeRequired: boolean;
};

/* ======================================
🔥 SUBSCRIPTION CONTEXT (FINAL 10/10)
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

    let subscription: any = null;

    /* ======================================
    CACHE FIRST
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
    DEFAULT (FREE USER)
    ====================================== */

    let context: BillingContext = {
      subscription: null,
      plan: null,
      status: "NONE",
      isLimited: false, // ✅ FREE user allowed (dashboard open)
      upgradeRequired: false,
    };

    /* ======================================
    NO SUBSCRIPTION
    ====================================== */

    if (!subscription || !subscription.plan) {
      (req as any).billing = context;
      (req as any).subscription = null;
      return next(); // ✅ NEVER BLOCK
    }

    /* ======================================
    BUILD BASE CONTEXT
    ====================================== */

    context.subscription = subscription;
    context.plan = subscription.plan;
    context.status = subscription.status;
    context.isLimited = false;
    context.upgradeRequired = false;

    const now = new Date();

    /* ======================================
    STATUS HANDLING (CORRECT LOGIC)
    ====================================== */

    // 🔴 Payment failed
    if (subscription.status === "PAST_DUE") {
      context.isLimited = true;
      context.upgradeRequired = true;
    }

    // 🔴 Cancelled + expired
    if (
      subscription.status === "CANCELLED" &&
      subscription.currentPeriodEnd &&
      now > new Date(subscription.currentPeriodEnd)
    ) {
      context.status = "CANCELLED";
      context.isLimited = true;
      context.upgradeRequired = true;
    }

    // 🔴 Trial expired
    if (
      subscription.isTrial &&
      subscription.currentPeriodEnd &&
      now > new Date(subscription.currentPeriodEnd)
    ) {
      context.status = "TRIAL_EXPIRED";
      context.isLimited = true;
      context.upgradeRequired = true;
    }

    // 🟢 ACTIVE or TRIAL (valid) → FULL ACCESS
    // ❗ NO blanket blocking anymore

    /* ======================================
    ATTACH CONTEXT
    ====================================== */

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