import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import prisma from "../config/prisma";
import { env } from "../config/env";
import Redis from "ioredis";

/* 🔥 EMAIL */
import {
  sendSubscriptionEmail,
  sendInvoiceEmail,
} from "../services/email.service";

/* 🔥 TAX */
import { getStripeTaxDetails } from "../services/tax.service";

/* 🔥 INVOICE NUMBER */
import { generateInvoiceNumber } from "../services/invoice.service";

const redis = new Redis(process.env.REDIS_URL!);

/* ====================================== */
/* UTILS */
/* ====================================== */

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

const mapCurrency = (currency: string): "INR" | "USD" => {
  if (!currency) return "INR";
  const upper = currency.toUpperCase();
  return upper === "USD" ? "USD" : "INR";
};

/* ====================================== */
/* WEBHOOK */
/* ====================================== */

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
    /* 🔥 DUPLICATE PROTECTION */
    const exists = await prisma.stripeEvent.findUnique({
      where: { eventId: event.id },
    });

    if (exists) return res.json({ received: true });

    await prisma.stripeEvent.create({
      data: { eventId: event.id, type: event.type },
    });

    switch (event.type) {

      /* ====================================== */
      /* CHECKOUT COMPLETE */
      /* ====================================== */

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const businessId = session.metadata?.businessId;
        const planType = session.metadata?.plan as string;

        const rawCurrency =
          (session.metadata?.currency as string) ||
          session.currency ||
          "INR";

        const currency = mapCurrency(rawCurrency);

        const subscriptionId = getSubscriptionId(
          session.subscription as any
        );

        if (!businessId || !subscriptionId || !planType) break;

        const existing = await prisma.subscription.findUnique({
          where: { businessId },
        });

        const plan = await prisma.plan.findFirst({
          where: {
            OR: [{ name: planType }, { type: planType }],
          },
        });

        if (!plan) break;

        /* ============================= */
        /* 🔥 EARLY COUNT UPDATE */
        /* ============================= */

        const usedEarly = session.metadata?.usedEarly === "true";

        if (usedEarly) {
          await prisma.plan.updateMany({
            where: {
              OR: [{ name: planType }, { type: planType }],
            },
            data: {
              earlyUsed: { increment: 1 },
            },
          });
        }

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

        const periodEnd = getPeriodEnd(stripeSub);

        await prisma.subscription.upsert({
          where: { businessId },

          update: {
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : stripeSub.customer?.id ?? null,
            planId: plan.id,
            currency,
            status:
              stripeSub.status === "trialing" ||
              stripeSub.status === "active"
                ? "ACTIVE"
                : "INACTIVE",
            currentPeriodEnd: periodEnd,
            isTrial: stripeSub.status === "trialing",

            /* 🔥 TRIAL PROTECTION */
            trialUsed:
              existing?.trialUsed === true
                ? true
                : stripeSub.status === "trialing",
          },

          create: {
            businessId,
            stripeSubscriptionId: stripeSub.id,
            stripeCustomerId:
              typeof stripeSub.customer === "string"
                ? stripeSub.customer
                : stripeSub.customer?.id ?? null,
            planId: plan.id,
            currency,
            status:
              stripeSub.status === "trialing" ||
              stripeSub.status === "active"
                ? "ACTIVE"
                : "INACTIVE",
            currentPeriodEnd: periodEnd,
            isTrial: stripeSub.status === "trialing",
            trialUsed: stripeSub.status === "trialing",
          },
        });

        const user = await prisma.user.findFirst({
          where: { businessId },
        });

        if (user?.email) {
          await sendSubscriptionEmail(user.email, planType);
        }

        await safeRedisDel(`sub:${businessId}`);
        break;
      }

      /* ====================================== */
      /* PAYMENT SUCCESS */
      /* ====================================== */

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

      /* ====================================== */
      /* SUB UPDATED */
      /* ====================================== */

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        const existing = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
        });

        if (!existing) break;

        const periodEnd = getPeriodEnd(sub);

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

      /* ====================================== */
      /* CANCELLED */
      /* ====================================== */

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

      /* ====================================== */
      /* PAYMENT FAILED (GRACE PERIOD) */
      /* ====================================== */

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
    console.error("❌ Stripe webhook error:", error);
    return res.json({ received: true });
  }
};