import Stripe from "stripe";
import { env } from "../config/env";
import prisma from "../config/prisma"; // ✅ added

if (!env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {});

// ✅ stricter typing
const PRICE_MAP: Record<"BASIC" | "PRO" | "ENTERPRISE", string | undefined> = {
  BASIC: env.STRIPE_PRICE_ID_BASIC,
  PRO: env.STRIPE_PRICE_ID_PRO,
  ENTERPRISE: env.STRIPE_PRICE_ID_ENTERPRISE,
};

export const createCheckoutSession = async (
  customerEmail: string,
  businessId: string,
  plan: "BASIC" | "PRO" | "ENTERPRISE"
) => {
  // ✅ Strict plan validation
  if (!["BASIC", "PRO", "ENTERPRISE"].includes(plan)) {
    throw new Error("Invalid plan selected");
  }

  const priceId = PRICE_MAP[plan];

  if (!priceId) {
    throw new Error("Invalid or missing price ID");
  }

  // ✅ Try to reuse existing Stripe customer
  const existingSubscription = await prisma.subscription.findUnique({
    where: { businessId },
  });

  let stripeCustomerId = existingSubscription?.stripeCustomerId || null;

  // ✅ Create Stripe customer only if not exists
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      metadata: { businessId },
    });

    stripeCustomerId = customer.id;

    // store customer id if subscription row already exists
    if (existingSubscription) {
      await prisma.subscription.update({
        where: { businessId },
        data: { stripeCustomerId },
      });
    }
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId, // ✅ using customer instead of customer_email
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        businessId,
        plan,
      },
      success_url: `${env.FRONTEND_URL}/billing/success`,
      cancel_url: `${env.FRONTEND_URL}/billing/cancel`,
    },
    {
      // ✅ Idempotency key prevents duplicate sessions
      idempotencyKey: `${businessId}-${plan}`,
    }
  );

  return session;
};