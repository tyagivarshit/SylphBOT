import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import prisma from "../config/prisma";
import { env } from "../config/env";

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
      env.STRIPE_WEBHOOK_SECRET!
    );

  } catch (err) {

    console.error("❌ Signature verification failed.");

    return res.status(400).send("Webhook Error");

  }

  try {

    /* -----------------------------
    IDEMPOTENCY PROTECTION
    ----------------------------- */

    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });

    if (existingEvent) {
      return res.json({ received: true });
    }

    await prisma.stripeEvent.create({
      data: { eventId: event.id },
    });

    switch (event.type) {

      /* =======================================
      CHECKOUT COMPLETED
      ======================================= */

      case "checkout.session.completed": {

        const session =
          event.data.object as Stripe.Checkout.Session;

        const businessId = session.metadata?.businessId;
        const planName = session.metadata?.plan;

        const stripeSubId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;

        if (!businessId || !planName || !stripeSubId)
          break;

        const plan = await prisma.plan.findFirst({
          where: { name: planName },
        });

        if (!plan) break;

        const stripeSubscription =
          await stripe.subscriptions.retrieve(
            stripeSubId
          );

        const periodEnd =
          typeof (stripeSubscription as any).current_period_end === "number"
            ? (stripeSubscription as any).current_period_end
            : null;

        const currentPeriodEnd = periodEnd
          ? new Date(periodEnd * 1000)
          : null;

        await prisma.subscription.upsert({

          where: { businessId },

          update: {

            stripeSubscriptionId: stripeSubId,

            stripeCustomerId:
              typeof stripeSubscription.customer === "string"
                ? stripeSubscription.customer
                : null,

            status: "ACTIVE",

            planId: plan.id,

            currentPeriodEnd,

            isTrial: false, // 🔥 trial removed when paid

          },

          create: {

            businessId,

            planId: plan.id,

            stripeSubscriptionId: stripeSubId,

            stripeCustomerId:
              typeof stripeSubscription.customer === "string"
                ? stripeSubscription.customer
                : null,

            status: "ACTIVE",

            currentPeriodEnd,

            isTrial: false,

            trialUsed: true,

          },

        });

        break;
      }

      /* =======================================
      SUBSCRIPTION UPDATED
      ======================================= */

      case "customer.subscription.updated": {

        const subscription =
          event.data.object as Stripe.Subscription;

        const periodEnd =
          typeof (subscription as any).current_period_end === "number"
            ? new Date(
                (subscription as any).current_period_end * 1000
              )
            : null;

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: subscription.id,
          },

          data: {

            status:
              subscription.status === "active"
                ? "ACTIVE"
                : "INACTIVE",

            currentPeriodEnd: periodEnd,

          },

        });

        break;
      }

      /* =======================================
      SUBSCRIPTION CANCELLED
      ======================================= */

      case "customer.subscription.deleted": {

        const subscription =
          event.data.object as Stripe.Subscription;

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: subscription.id,
          },

          data: {
            status: "INACTIVE",
          },

        });

        break;
      }

      /* =======================================
      PAYMENT FAILED
      ======================================= */

      case "invoice.payment_failed": {

        const invoice =
          event.data.object as Stripe.Invoice;

        const subscriptionId =
          typeof (invoice as any).subscription === "string"
            ? (invoice as any).subscription
            : null;

        if (!subscriptionId) break;

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: subscriptionId,
          },

          data: {
            status: "PAST_DUE",
          },

        });

        break;
      }

      /* =======================================
      PAYMENT SUCCESS
      ======================================= */

      case "invoice.payment_succeeded": {

        const invoice =
          event.data.object as Stripe.Invoice;

        const subscriptionId =
          typeof (invoice as any).subscription === "string"
            ? (invoice as any).subscription
            : null;

        if (!subscriptionId) break;

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: subscriptionId,
          },

          data: {
            status: "ACTIVE",
          },

        });

        break;
      }

      default:

        console.log(`Unhandled event type: ${event.type}`);

    }

    return res.json({ received: true });

  } catch (error) {

    console.error("❌ Webhook processing error:", error);

    return res.status(500).json({
      message: "Webhook handler failed",
    });

  }

};