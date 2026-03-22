import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { getPlanFromPrice } from "../config/stripe.price.map";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

/* ======================================
UTILS
====================================== */

function getSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id;
}

const getPeriodEnd = (sub: Stripe.Subscription): Date | null => {
  const raw = (sub as any).current_period_end;
  return raw ? new Date(raw * 1000) : null;
};

const safeRedisDel = async (key: string) => {
  try {
    await redis.del(key);
  } catch {
    console.warn("⚠️ Redis failed:", key);
  }
};

/* ======================================
🔥 CURRENCY FIX (ADDED ONLY)
====================================== */

const mapCurrency = (currency: string): "INR" | "USD" => {
  if (!currency) return "INR";
  const upper = currency.toUpperCase();
  return upper === "USD" ? "USD" : "INR";
};

/* ======================================
WEBHOOK
====================================== */

export const stripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    console.error("❌ Stripe signature failed");
    return res.status(400).send("Webhook Error");
  }

  try {
    const exists = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });

    if (exists) {
      return res.json({ received: true });
    }

    await prisma.stripeEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
      },
    });

    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const businessId = session.metadata?.businessId;

        /* 🔥 FIXED (ONLY CHANGE HERE) */
        const rawCurrency: string =
          (session.metadata?.currency as string) ||
          session.currency ||
          "INR";

        const currency = mapCurrency(rawCurrency);

        const subscriptionId = getSubscriptionId(
          session.subscription as any
        );

        if (!businessId || !subscriptionId) break;

        let priceId: string | undefined;

        try {
          const lineItems =
            await stripe.checkout.sessions.listLineItems(session.id, {
              limit: 1,
            });

          priceId = lineItems.data[0]?.price?.id;
        } catch {
          console.error("❌ lineItems fetch failed");
          break;
        }

        const planType = getPlanFromPrice(priceId);

        if (!planType) {
          console.error("❌ Unknown priceId:", priceId);
          break;
        }

        const plan = await prisma.plan.findFirst({
          where: {
            OR: [{ name: planType }, { type: planType }],
          },
        });

        if (!plan) {
          console.error("❌ Plan not found:", planType);
          break;
        }

        let stripeSub: Stripe.Subscription | null = null;

        try {
          stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        } catch {
          console.error("❌ subscription fetch failed");
          break;
        }

        if (!stripeSub) break;

        const periodEnd = getPeriodEnd(stripeSub);

        const existing = await prisma.subscription.findUnique({
          where: { businessId },
        });

        if (
          existing?.currentPeriodEnd &&
          periodEnd &&
          existing.currentPeriodEnd > periodEnd
        ) {
          break;
        }

        await prisma.subscription.upsert({
          where: { businessId },

          update: {
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : stripeSub.customer?.id ?? null,
            planId: plan.id,

            /* 🔥 FIX APPLIED */
            currency,

            status:
              stripeSub.status === "active" ||
              stripeSub.status === "trialing"
                ? "ACTIVE"
                : "INACTIVE",

            currentPeriodEnd: periodEnd,
            isTrial: stripeSub.status === "trialing",
            trialUsed: true,
          },

          create: {
            businessId,
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : stripeSub.customer?.id ?? null,
            planId: plan.id,

            /* 🔥 FIX APPLIED */
            currency,

            status:
              stripeSub.status === "active" ||
              stripeSub.status === "trialing"
                ? "ACTIVE"
                : "INACTIVE",

            currentPeriodEnd: periodEnd,
            isTrial: stripeSub.status === "trialing",
            trialUsed: true,
          },
        });

        await safeRedisDel(`sub:${businessId}`);
        break;
      }

      /* ======================================
      🔥 ALL YOUR ORIGINAL CASES UNTOUCHED
      ====================================== */

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });

        if (!existing) break;

        const periodEnd = getPeriodEnd(sub);

        if (
          existing.currentPeriodEnd &&
          periodEnd &&
          existing.currentPeriodEnd > periodEnd
        ) {
          break;
        }

        await prisma.subscription.update({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status:
              sub.status === "active" ||
              sub.status === "trialing"
                ? "ACTIVE"
                : "INACTIVE",
            currentPeriodEnd: periodEnd,
            isTrial: sub.status === "trialing",
          },
        });

        await safeRedisDel(`sub:${existing.businessId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });

        if (!existing) break;

        await prisma.subscription.update({
          where: { stripeSubscriptionId: sub.id },
          data: { status: "CANCELLED" },
        });

        await safeRedisDel(`sub:${existing.businessId}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        const subscriptionId = getSubscriptionId(
          (invoice as any).subscription
        );

        if (!subscriptionId) break;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });

        if (!existing) break;

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: "PAST_DUE" },
        });

        await safeRedisDel(`sub:${existing.businessId}`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        const subscriptionId = getSubscriptionId(
          (invoice as any).subscription
        );

        if (!subscriptionId) break;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });

        if (!existing) break;

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: { status: "ACTIVE" },
        });

        await safeRedisDel(`sub:${existing.businessId}`);
        break;
      }

      default:
        console.log("Unhandled event:", event.type);
    }

    return res.json({ received: true });

  } catch (error) {
    console.error("❌ Stripe webhook error:", error);
    return res.json({ received: true });
  }
};