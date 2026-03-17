import { Request, Response } from "express"
import Stripe from "stripe"
import { stripe } from "../services/stripe.service"
import prisma from "../config/prisma"
import { env } from "../config/env"

/* ======================================
HELPER
====================================== */

function getSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
): string | null {

  if (!subscription) return null

  if (typeof subscription === "string") {
    return subscription
  }

  return subscription.id
}

/* ======================================
WEBHOOK
====================================== */

export const stripeWebhook = async (
  req: Request,
  res: Response
) => {

  const sig = req.headers["stripe-signature"] as string

  let event: Stripe.Event

  try {

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    )

  } catch (err) {

    console.error("Stripe signature verification failed")

    return res.status(400).send("Webhook Error")
  }

  try {

    /* ======================================
    IDEMPOTENCY
    ====================================== */

    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id }
    })

    if (existingEvent) {
      return res.json({ received: true })
    }

    await prisma.stripeEvent.create({
      data: { eventId: event.id,
        type: event.type
       }
    })

    switch (event.type) {

      /* ======================================
      CHECKOUT COMPLETED
      ====================================== */

      case "checkout.session.completed": {

        const session = event.data.object as Stripe.Checkout.Session

        const businessId = session.metadata?.businessId
        const planName = session.metadata?.plan

        const subscriptionId = getSubscriptionId(
          session.subscription as any
        )

        if (!businessId || !planName || !subscriptionId) break

        const plan = await prisma.plan.findUnique({
          where: { name: planName }
        })

        if (!plan) break

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)

        const periodEnd =
          (stripeSub as any).current_period_end
            ? new Date((stripeSub as any).current_period_end * 1000)
            : null

        await prisma.subscription.upsert({

          where: { businessId },

          update: {

            stripeSubscriptionId: stripeSub.id,

            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : null,

            planId: plan.id,

            status:
              stripeSub.status === "active" ||
              stripeSub.status === "trialing"
                ? "ACTIVE"
                : "INACTIVE",

            currentPeriodEnd: periodEnd,

            isTrial: stripeSub.status === "trialing"
          },

          create: {

            businessId,

            planId: plan.id,

            stripeSubscriptionId: stripeSub.id,

            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : null,

            status:
              stripeSub.status === "active" ||
              stripeSub.status === "trialing"
                ? "ACTIVE"
                : "INACTIVE",

            currentPeriodEnd: periodEnd,

            isTrial: stripeSub.status === "trialing",

            trialUsed: stripeSub.status === "trialing"
          }
        })

        break
      }

      /* ======================================
      SUBSCRIPTION UPDATED
      ====================================== */

      case "customer.subscription.updated": {

        const sub = event.data.object as Stripe.Subscription

        const periodEnd =
          (sub as any).current_period_end
            ? new Date((sub as any).current_period_end * 1000)
            : null

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: sub.id
          },

          data: {

            status:
              sub.status === "active" ||
              sub.status === "trialing"
                ? "ACTIVE"
                : "INACTIVE",

            currentPeriodEnd: periodEnd,

            isTrial: sub.status === "trialing"
          }
        })

        break
      }

      /* ======================================
      SUBSCRIPTION CANCELLED
      ====================================== */

      case "customer.subscription.deleted": {

        const sub = event.data.object as Stripe.Subscription

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: sub.id
          },

          data: {
            status: "INACTIVE"
          }
        })

        break
      }

      /* ======================================
      PAYMENT FAILED
      ====================================== */

      case "invoice.payment_failed": {

        const invoice = event.data.object as Stripe.Invoice

        const subscriptionId = getSubscriptionId(
          (invoice as any).subscription
        )

        if (!subscriptionId) break

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: subscriptionId
          },

          data: {
            status: "PAST_DUE"
          }
        })

        break
      }

      /* ======================================
      PAYMENT SUCCESS
      ====================================== */

      case "invoice.payment_succeeded": {

        const invoice = event.data.object as Stripe.Invoice

        const subscriptionId = getSubscriptionId(
          (invoice as any).subscription
        )

        if (!subscriptionId) break

        await prisma.subscription.updateMany({

          where: {
            stripeSubscriptionId: subscriptionId
          },

          data: {
            status: "ACTIVE"
          }
        })

        break
      }

      default:
        console.log("Unhandled Stripe event:", event.type)
    }

    return res.json({ received: true })

  } catch (error) {

    console.error("Stripe webhook error:", error)

    return res.status(500).json({
      message: "Webhook failed"
    })
  }
}