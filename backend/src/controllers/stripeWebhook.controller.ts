import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { getPlanFromPrice } from "../config/stripe.price.map";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

/* ======================================
HELPER
====================================== */

function getSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id;
}

/* ======================================
WEBHOOK
====================================== */

export const stripeWebhook = async (
  req: Request,
  res: Response
) => {

  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe signature failed");
    return res.status(400).send("Webhook Error");
  }

  try {

    /* ======================================
    IDEMPOTENCY
    ====================================== */

    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existingEvent) {
      return res.json({ received: true });
    }

    await prisma.stripeEvent.create({
      data: {
        eventId: event.id,
        type: event.type,
      },
    });

    switch (event.type) {

      /* ======================================
      CHECKOUT COMPLETED
      ====================================== */

      case "checkout.session.completed": {

        const session = event.data.object as Stripe.Checkout.Session;

        const businessId = session.metadata?.businessId;
        const currency = session.metadata?.currency || "INR";

        const subscriptionId = getSubscriptionId(
          session.subscription as any
        );

        if (!businessId || !subscriptionId) break;

        /* 🔥 SECURE PLAN FROM PRICE */
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 1 }
        );

        const priceId = lineItems.data[0]?.price?.id;
        const planType = getPlanFromPrice(priceId);

        if (!planType) {
          console.error("❌ Unknown priceId:", priceId);
          break;
        }

        const plan = await prisma.plan.findFirst({
          where: {
            OR: [
              { name: planType },
              { type: planType },
            ],
          },
        });

        if (!plan) {
          console.error("❌ Plan not found:", planType);
          break;
        }

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

        const periodEnd =
          (stripeSub as any).current_period_end
            ? new Date((stripeSub as any).current_period_end * 1000)
            : null;

        /* 🔥 EVENT ORDER PROTECTION */
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

        await prisma.subscription.update({
          where: { businessId },
          data: {
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : stripeSub.customer?.id || null,
            planId: plan.id,
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

        /* 🔥 CACHE INVALIDATION */
        await redis.del(`sub:${businessId}`);

        break;
      }

      /* ======================================
      SUBSCRIPTION UPDATED
      ====================================== */

      case "customer.subscription.updated": {

        const sub = event.data.object as Stripe.Subscription;

        const periodEnd =
          (sub as any).current_period_end
            ? new Date((sub as any).current_period_end * 1000)
            : null;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });

        if (
          existing?.currentPeriodEnd &&
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

        if (existing?.businessId) {
          await redis.del(`sub:${existing.businessId}`);
        }

        break;
      }

      /* ======================================
      SUBSCRIPTION CANCELLED
      ====================================== */

      case "customer.subscription.deleted": {

        const sub = event.data.object as Stripe.Subscription;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });

        await prisma.subscription.update({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: "CANCELLED",
          },
        });

        if (existing?.businessId) {
          await redis.del(`sub:${existing.businessId}`);
        }

        break;
      }

      /* ======================================
      PAYMENT FAILED
      ====================================== */

      case "invoice.payment_failed": {

        const invoice = event.data.object as Stripe.Invoice;

        const subscriptionId = getSubscriptionId(
          (invoice as any).subscription
        );

        if (!subscriptionId) break;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            status: "PAST_DUE",
          },
        });

        if (existing?.businessId) {
          await redis.del(`sub:${existing.businessId}`);
        }

        break;
      }

      /* ======================================
      PAYMENT SUCCESS
      ====================================== */

      case "invoice.payment_succeeded": {

        const invoice = event.data.object as Stripe.Invoice;

        const subscriptionId = getSubscriptionId(
          (invoice as any).subscription
        );

        if (!subscriptionId) break;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscriptionId },
          data: {
            status: "ACTIVE",
          },
        });

        if (existing?.businessId) {
          await redis.del(`sub:${existing.businessId}`);
        }

        break;
      }

      default:
        console.log("Unhandled event:", event.type);
    }

    return res.json({ received: true });

  } catch (error) {

    console.error("❌ Stripe webhook error:", error);

    return res.status(500).json({
      message: "Webhook failed",
    });

  }
};