import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import prisma from "../config/prisma";
import { env } from "../config/env";
import {
  sendSubscriptionEmail,
  sendInvoiceEmail,
} from "../services/email.service";
import { getStripeTaxDetails } from "../services/tax.service";
import { generateInvoiceNumber } from "../services/invoice.service";
import redis from "../config/redis";
import {
  syncCheckoutSession,
  syncStripeSubscriptionState,
} from "../services/billingSync.service";

function getSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id;
}

const safeRedisDel = async (key: string) => {
  try {
    await redis.del(key);
  } catch {
    console.warn("Redis cache delete failed:", key);
  }
};

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
    console.error("Stripe signature failed");
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
      data: { eventId: event.id, type: event.type },
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const businessId = session.metadata?.businessId;
        const planType = session.metadata?.plan as string | undefined;

        if (!businessId || !planType) break;

        await syncCheckoutSession(session);

        const user = await prisma.user.findFirst({
          where: { businessId },
        });

        if (user?.email) {
          await sendSubscriptionEmail(user.email, planType);
        }

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
          data: {
            status: "ACTIVE",
            graceUntil: null,
          },
        });

        const taxData = getStripeTaxDetails(invoice);
        const invoiceNumber = await generateInvoiceNumber();

        await prisma.invoice.create({
          data: {
            businessId: existing.businessId,
            amount: taxData.total,
            currency: taxData.currency,
            status: "PAID",
            stripeInvoiceId: invoice.id,
            invoiceNumber,
            subtotal: taxData.subtotal,
            taxAmount: taxData.taxAmount,
            taxType: taxData.taxType,
          },
        });

        const user = await prisma.user.findFirst({
          where: { businessId: existing.businessId },
        });

        if (user?.email) {
          await sendInvoiceEmail(
            user.email,
            taxData.total,
            taxData.currency,
            invoice.hosted_invoice_url || undefined,
            invoice.invoice_pdf || undefined,
            taxData.subtotal,
            taxData.taxAmount,
            taxData.taxType
          );
        }

        await safeRedisDel(`sub:${existing.businessId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripeSubscriptionState(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (!existing) break;

        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: "CANCELLED",
            graceUntil: null,
            isTrial: false,
          },
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
          data: {
            status: "PAST_DUE",
            graceUntil: new Date(
              Date.now() + 3 * 24 * 60 * 60 * 1000
            ),
          },
        });

        await safeRedisDel(`sub:${existing.businessId}`);
        break;
      }

      default:
        console.log("Unhandled event:", event.type);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return res.json({ received: true });
  }
};
