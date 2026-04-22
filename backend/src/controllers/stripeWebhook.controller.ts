import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../config/prisma";
import redis from "../config/redis";
import { env } from "../config/env";
import { stripe } from "../services/stripe.service";
import {
  sendInvoiceEmail,
  sendSubscriptionEmail,
} from "../services/email.service";
import { generateInvoiceNumber } from "../services/invoice.service";
import { getStripeTaxDetails } from "../services/tax.service";
import {
  syncCheckoutSession,
  syncStripeSubscriptionState,
} from "../services/billingSync.service";
import { recordConversionEvent } from "../services/salesAgent/conversionTracker.service";

function getSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
): string | null {
  if (!subscription) return null;
  if (typeof subscription === "string") return subscription;
  return subscription.id;
}

function getCustomerId(
  customer:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | null
    | undefined
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

const safeRedisDel = async (key: string) => {
  try {
    await redis.del(key);
  } catch {
    console.warn("Redis cache delete failed", { key });
  }
};

const isUniqueConstraintError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

const logBilling = (
  level: "info" | "warn" | "error",
  message: string,
  payload: Record<string, unknown>
) => {
  const logger =
    level === "info"
      ? console.info
      : level === "warn"
        ? console.warn
        : console.error;

  logger(message, payload);
};

const runBillingSideEffect = async (
  label: string,
  payload: Record<string, unknown>,
  task: Promise<unknown>
) => {
  try {
    await task;
  } catch (error) {
    logBilling("warn", label, {
      ...payload,
      error:
        error instanceof Error ? error.message : "Unknown side-effect error",
    });
  }
};

const reserveBillingEvent = async (event: Stripe.Event) => {
  const existing = await prisma.billingEvent.findUnique({
    where: { stripeEventId: event.id },
  });

  if (existing) {
    console.log("Duplicate webhook ignored", {
      eventId: event.id,
      eventType: event.type,
    });
    return false;
  }

  try {
    await prisma.billingEvent.create({
      data: { stripeEventId: event.id },
    });

    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      console.log("Duplicate webhook ignored", {
        eventId: event.id,
        eventType: event.type,
      });
      return false;
    }

    throw error;
  }
};

const releaseBillingEvent = async (eventId: string) => {
  try {
    await prisma.billingEvent.deleteMany({
      where: {
        stripeEventId: eventId,
      },
    });
  } catch (error) {
    logBilling("error", "Billing webhook dedupe rollback failed", {
      eventId,
      error:
        error instanceof Error ? error.message : "Unknown rollback error",
    });
  }
};

const findSubscriptionRecord = async ({
  businessId,
  stripeSubscriptionId,
  customerId,
}: {
  businessId?: string | null;
  stripeSubscriptionId?: string | null;
  customerId?: string | null;
}) => {
  if (businessId) {
    const byBusiness = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });

    if (byBusiness) {
      return byBusiness;
    }
  }

  if (stripeSubscriptionId) {
    const byStripeSubscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });

    if (byStripeSubscription) {
      return byStripeSubscription;
    }
  }

  if (customerId) {
    return prisma.subscription.findFirst({
      where: { stripeCustomerId: customerId },
      include: { plan: true },
    });
  }

  return null;
};

const getPlanName = (
  subscription:
    | {
        plan?: {
          name?: string | null;
          type?: string | null;
        } | null;
      }
    | null
) => subscription?.plan?.type || subscription?.plan?.name || null;

const syncInvoiceSubscription = async (invoice: Stripe.Invoice) => {
  const stripeSubscriptionId = getSubscriptionId(
    (invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }).subscription
  );

  if (!stripeSubscriptionId) {
    return null;
  }

  const stripeSubscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId
  );

  return syncStripeSubscriptionState(stripeSubscription, {
    currencyHint: invoice.currency?.toUpperCase() || null,
  });
};

const handleCheckoutSessionCompleted = async (
  event: Stripe.Event
) => {
  const session = event.data.object as Stripe.Checkout.Session;
  const businessId =
    session.metadata?.businessId || session.client_reference_id || null;
  const userId = session.metadata?.userId || null;
  const leadId = session.metadata?.leadId;
  const customerId = getCustomerId(session.customer);

  if (!businessId) {
    logBilling("warn", "Stripe checkout.session.completed missing business", {
      eventId: event.id,
      eventType: event.type,
      sessionId: session.id,
      customerId,
    });
    return;
  }

  const previous = await findSubscriptionRecord({
    businessId,
    stripeSubscriptionId: getSubscriptionId(session.subscription),
    customerId,
  });
  const syncedSubscription = await syncCheckoutSession(session);
  const plan =
    getPlanName(syncedSubscription) || session.metadata?.plan || null;

  logBilling("info", "Stripe checkout completed", {
    eventId: event.id,
    eventType: event.type,
    sessionId: session.id,
    businessId,
    userId,
    customerId: syncedSubscription?.stripeCustomerId || customerId,
    stripeSubscriptionId:
      syncedSubscription?.stripeSubscriptionId ||
      getSubscriptionId(session.subscription),
    plan,
    previousStatus: previous?.status || null,
    nextStatus: syncedSubscription?.status || null,
  });

  if (leadId && plan) {
    await recordConversionEvent({
      businessId,
      leadId,
      outcome: "payment_completed",
      source: "STRIPE_CHECKOUT",
      idempotencyKey: `stripe:${event.id}`,
      metadata: {
        checkoutSessionId: session.id,
        planType: plan,
      },
    }).catch(() => {});
  }

  const user = await prisma.user.findFirst({
    where: { businessId },
    select: { email: true },
  });

  if (user?.email) {
    await runBillingSideEffect(
      "Stripe subscription email skipped",
      {
        eventId: event.id,
        eventType: event.type,
        businessId,
        customerId,
        plan,
      },
      sendSubscriptionEmail(user.email, plan || "SUBSCRIPTION")
    );
  }
};

const handleInvoicePaymentSucceeded = async (
  event: Stripe.Event
) => {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = getCustomerId(invoice.customer);
  const stripeSubscriptionId = getSubscriptionId(
    (invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }).subscription
  );

  const previous = await findSubscriptionRecord({
    stripeSubscriptionId,
    customerId,
  });
  await syncInvoiceSubscription(invoice);
  const current = await findSubscriptionRecord({
    stripeSubscriptionId,
    customerId,
  });

  if (!current) {
    logBilling("warn", "Stripe payment succeeded without subscription match", {
      eventId: event.id,
      eventType: event.type,
      invoiceId: invoice.id,
      customerId,
      stripeSubscriptionId,
    });
    return;
  }

  const updated = await prisma.subscription.update({
    where: { businessId: current.businessId },
    data: {
      status: "ACTIVE",
      graceUntil: null,
    },
    include: {
      plan: true,
    },
  });

  const taxData = getStripeTaxDetails(invoice);
  const existingInvoice = await prisma.invoice.findFirst({
    where: { stripeInvoiceId: invoice.id },
    select: { id: true },
  });
  let invoiceCreated = false;

  if (!existingInvoice) {
    await prisma.invoice.create({
      data: {
        businessId: updated.businessId,
        amount: taxData.total,
        currency: taxData.currency,
        status: "PAID",
        stripeInvoiceId: invoice.id,
        invoiceNumber: generateInvoiceNumber(),
        subtotal: taxData.subtotal,
        taxAmount: taxData.taxAmount,
        taxType: taxData.taxType,
      },
    });

    invoiceCreated = true;
  }

  await safeRedisDel(`sub:${updated.businessId}`);

  logBilling("info", "Stripe invoice payment succeeded", {
    eventId: event.id,
    eventType: event.type,
    invoiceId: invoice.id,
    businessId: updated.businessId,
    customerId,
    stripeSubscriptionId,
    plan: getPlanName(updated),
    previousStatus: previous?.status || null,
    nextStatus: updated.status,
    invoiceCreated,
  });

  if (!invoiceCreated) {
    return;
  }

  const user = await prisma.user.findFirst({
    where: { businessId: updated.businessId },
    select: { email: true },
  });

  if (user?.email) {
    await runBillingSideEffect(
      "Stripe invoice email skipped",
      {
        eventId: event.id,
        eventType: event.type,
        businessId: updated.businessId,
        customerId,
        plan: getPlanName(updated),
      },
      sendInvoiceEmail(
        user.email,
        taxData.total,
        taxData.currency,
        invoice.hosted_invoice_url || undefined,
        invoice.invoice_pdf || undefined,
        taxData.subtotal,
        taxData.taxAmount,
        taxData.taxType
      )
    );
  }
};

const handleCustomerSubscriptionUpdated = async (
  event: Stripe.Event
) => {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = getCustomerId(subscription.customer);
  const previous = await findSubscriptionRecord({
    stripeSubscriptionId: subscription.id,
    customerId,
  });
  const synced = await syncStripeSubscriptionState(subscription);

  if (!synced) {
    logBilling("warn", "Stripe subscription update missing business link", {
      eventId: event.id,
      eventType: event.type,
      customerId,
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  logBilling("info", "Stripe subscription updated", {
    eventId: event.id,
    eventType: event.type,
    businessId: synced.businessId,
    customerId: synced.stripeCustomerId || customerId,
    stripeSubscriptionId: synced.stripeSubscriptionId,
    plan: synced.planType,
    previousStatus: previous?.status || null,
    nextStatus: synced.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
};

const handleCustomerSubscriptionDeleted = async (
  event: Stripe.Event
) => {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = getCustomerId(subscription.customer);
  const previous = await findSubscriptionRecord({
    stripeSubscriptionId: subscription.id,
    customerId,
  });
  const synced = await syncStripeSubscriptionState(subscription);

  if (!synced) {
    logBilling("warn", "Stripe subscription deletion missing business link", {
      eventId: event.id,
      eventType: event.type,
      customerId,
      stripeSubscriptionId: subscription.id,
    });
    return;
  }

  logBilling("info", "Subscription cancelled", {
    eventId: event.id,
    eventType: event.type,
    businessId: synced.businessId,
    customerId: synced.stripeCustomerId || customerId,
    stripeSubscriptionId: synced.stripeSubscriptionId,
    plan: synced.planType,
    effectivePlan: "FREE_LOCKED",
    previousStatus: previous?.status || null,
    nextStatus: synced.status,
  });
};

const handleInvoicePaymentFailed = async (
  event: Stripe.Event
) => {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = getCustomerId(invoice.customer);
  const stripeSubscriptionId = getSubscriptionId(
    (invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    }).subscription
  );

  const previous = await findSubscriptionRecord({
    stripeSubscriptionId,
    customerId,
  });
  await syncInvoiceSubscription(invoice);
  const current = await findSubscriptionRecord({
    stripeSubscriptionId,
    customerId,
  });

  if (!current) {
    logBilling("warn", "Stripe payment failure missing subscription match", {
      eventId: event.id,
      eventType: event.type,
      invoiceId: invoice.id,
      customerId,
      stripeSubscriptionId,
    });
    return;
  }

  const gracePeriodEndsAt = new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000
  );
  const updated = await prisma.subscription.update({
    where: { businessId: current.businessId },
    data: {
      status: "PAST_DUE",
      graceUntil: gracePeriodEndsAt,
    },
    include: {
      plan: true,
    },
  });

  await safeRedisDel(`sub:${updated.businessId}`);

  logBilling("warn", "Payment failed - grace period started", {
    eventId: event.id,
    eventType: event.type,
    invoiceId: invoice.id,
    businessId: updated.businessId,
    customerId,
    stripeSubscriptionId,
    plan: getPlanName(updated),
    previousStatus: previous?.status || null,
    nextStatus: updated.status,
    gracePeriodEndsAt,
  });
};

const handleStripeEvent = async (event: Stripe.Event) => {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event);
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event);
      break;

    case "customer.subscription.updated":
      await handleCustomerSubscriptionUpdated(event);
      break;

    case "customer.subscription.deleted":
      await handleCustomerSubscriptionDeleted(event);
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      break;

    default:
      logBilling("info", "Unhandled Stripe billing event", {
        eventId: event.id,
        eventType: event.type,
      });
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
  } catch (error) {
    logBilling("error", "Stripe signature failed", {
      error: (error as Error)?.message || "Unknown signature error",
    });
    return res.status(400).send("Webhook Error");
  }

  try {
    logBilling("info", "Stripe webhook received", {
      eventId: event.id,
      eventType: event.type,
    });

    const shouldProcess = await reserveBillingEvent(event);

    if (!shouldProcess) {
      return res.json({ received: true });
    }

    await handleStripeEvent(event);

    return res.json({ received: true });
  } catch (err) {
    await releaseBillingEvent(event.id);

    logBilling("error", "WEBHOOK ERROR", {
      eventId: event.id,
      eventType: event.type,
      error: err instanceof Error ? err.message : "Unknown webhook error",
    });

    return res.status(500).json({ error: "Webhook failed" });
  }
};
