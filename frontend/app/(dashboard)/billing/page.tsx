"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createCheckout, upgradePlan } from "@/lib/billing";
import PaymentHistory from "@/components/billing/PaymentHistory";
import { buildApiUrl } from "@/lib/userApi";

type Currency = "INR" | "USD";
type BillingCycle = "monthly" | "yearly";
type PlanId = "BASIC" | "PRO" | "ELITE";

type Subscription = {
  stripeSubscriptionId?: string | null;
  currency?: Currency | null;
  billingCycle?: BillingCycle | null;
  trialUsed?: boolean;
  currentPeriodEnd?: string | null;
  plan?: {
    name?: string | null;
    type?: string | null;
  } | null;
};

type BillingContext = {
  planKey?: string;
  status?: "INACTIVE" | "ACTIVE" | "TRIAL";
  allowEarly?: boolean;
  remainingEarly?: number;
};

const PLAN_CATALOG: Array<{
  id: PlanId;
  name: string;
  popular: boolean;
  INR: {
    monthly: number;
    yearly: number;
    earlyMonthly: number;
    earlyYearly: number;
  };
  USD: {
    monthly: number;
    yearly: number;
    earlyMonthly: number;
    earlyYearly: number;
  };
  features: string[];
}> = [
  {
    id: "BASIC",
    name: "Basic",
    popular: false,
    INR: {
      monthly: 999,
      yearly: 9990,
      earlyMonthly: 799,
      earlyYearly: 7990,
    },
    USD: {
      monthly: 19,
      yearly: 190,
      earlyMonthly: 15,
      earlyYearly: 150,
    },
    features: [
      "Instagram DM automation",
      "Comment to DM automation",
      "Basic AI responses",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    popular: true,
    INR: {
      monthly: 1999,
      yearly: 19990,
      earlyMonthly: 1599,
      earlyYearly: 15990,
    },
    USD: {
      monthly: 49,
      yearly: 490,
      earlyMonthly: 39,
      earlyYearly: 390,
    },
    features: [
      "WhatsApp automation",
      "CRM and follow-ups",
      "Unlimited automation",
      "Priority support",
    ],
  },
  {
    id: "ELITE",
    name: "Elite",
    popular: false,
    INR: {
      monthly: 3999,
      yearly: 39990,
      earlyMonthly: 2999,
      earlyYearly: 29990,
    },
    USD: {
      monthly: 99,
      yearly: 990,
      earlyMonthly: 79,
      earlyYearly: 790,
    },
    features: [
      "AI booking system",
      "Advanced workflows",
      "Unlimited usage",
      "Dedicated support",
    ],
  },
];

const formatMoney = (amount: number, currency: Currency) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const isCurrentPlan = (
  subscription: Subscription | null,
  planId: PlanId,
  planKey: string
) => {
  if (planKey === "FREE_LOCKED") {
    return false;
  }

  const currentType = subscription?.plan?.type?.toUpperCase();
  const currentName = subscription?.plan?.name?.toUpperCase();

  return currentType === planId || currentName === planId;
};

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [lockedCurrency, setLockedCurrency] = useState<Currency | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingContext, setBillingContext] = useState<BillingContext | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBilling = async () => {
      try {
        const res = await fetch(buildApiUrl("/api/billing"), {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "Failed to load billing");
        }

        setSubscription(data.subscription || null);
        setInvoices(data.invoices || []);
        setBillingContext(data.billing || null);

        const nextCurrency = data.subscription?.currency || data.currency || "INR";

        setCurrency(nextCurrency);
        setLockedCurrency(data.subscription?.currency || null);

        if (data.subscription?.billingCycle) {
          setBilling(data.subscription.billingCycle);
        }
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load billing");
      } finally {
        setPageLoading(false);
      }
    };

    loadBilling();
  }, []);

  const planKey = billingContext?.planKey || "FREE_LOCKED";
  const billingStatus = billingContext?.status || "INACTIVE";
  const allowEarly = Boolean(billingContext?.allowEarly);
  const remainingEarly = billingContext?.remainingEarly || 0;
  const hasUsedTrial = Boolean(subscription?.trialUsed);
  const isCancelled = searchParams.get("checkout") === "cancelled";
  const currentPeriodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  const handleCheckout = async (plan: PlanId) => {
    if (loading) return;

    try {
      setLoading(plan);

      if (lockedCurrency && lockedCurrency !== currency) {
        throw new Error(
          "Currency cannot be changed once a paid subscription exists"
        );
      }

      const action =
        planKey !== "FREE_LOCKED" && subscription?.stripeSubscriptionId
          ? upgradePlan
          : createCheckout;

      const result = await action(plan, billing);

      if (!result?.url) {
        throw new Error(result?.message || "No checkout URL received");
      }

      window.location.assign(result.url);
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-cyan-50 p-4 md:p-8 space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">
            Billing
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            Plans, payments, and access control
          </h1>
          <p className="max-w-2xl text-sm text-gray-600">
            Prices are shown in {currency}. Tax is calculated automatically at
            checkout based on the customer billing address and country.
          </p>
        </div>

        <div className="flex bg-white/90 backdrop-blur border border-blue-100 rounded-xl p-1 shadow-sm">
          {(["monthly", "yearly"] as BillingCycle[]).map((type) => (
            <button
              key={type}
              onClick={() => setBilling(type)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                billing === type
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow"
                  : "text-gray-600"
              }`}
            >
              {type === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Checkout was cancelled. Your plan has not changed.
        </div>
      )}

      {allowEarly && (
        <div className="rounded-2xl border border-cyan-200 bg-white/90 px-5 py-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-900">
            Early access offer live
          </p>
          <p className="mt-1 text-sm text-gray-600">
            First 50 clients get discounted pricing. {remainingEarly} spot
            {remainingEarly === 1 ? "" : "s"} remaining.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-blue-100 bg-white/85 p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-900">
          {billingStatus === "TRIAL"
            ? "7-day trial is active"
            : billingStatus === "ACTIVE"
            ? "Paid subscription is active"
            : hasUsedTrial
            ? "Trial already used"
            : "Your first checkout includes a 7-day free trial"}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {billingStatus === "TRIAL" && currentPeriodEnd
            ? `Trial access stays active until ${currentPeriodEnd}. After that, service becomes inactive if no paid subscription continues.`
            : billingStatus === "ACTIVE"
            ? "You can switch plans anytime and proration will be handled in Stripe."
            : hasUsedTrial
            ? "Service is locked until a paid plan is purchased again."
            : "The button shows Start Free Trial only once. After trial is used, it automatically switches to Buy Now."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
        {PLAN_CATALOG.map((plan) => {
          const prices = plan[currency];
          const displayPrice =
            billing === "monthly"
              ? allowEarly
                ? prices.earlyMonthly
                : prices.monthly
              : allowEarly
              ? prices.earlyYearly
              : prices.yearly;

          const originalPrice =
            billing === "monthly" ? prices.monthly : prices.yearly;

          const current = isCurrentPlan(subscription, plan.id, planKey);

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-white/85 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
                plan.popular ? "border-blue-300" : "border-blue-100"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {plan.name}
                  </h2>
                  {current && (
                    <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  )}
                </div>

                <div>
                  {allowEarly && (
                    <p className="text-sm text-gray-400 line-through">
                      {formatMoney(originalPrice, currency)}
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-gray-900">
                      {formatMoney(displayPrice, currency)}
                    </span>
                    <span className="pb-1 text-sm text-gray-500">
                      /{billing}
                    </span>
                  </div>
                </div>

                <ul className="space-y-2 text-sm text-gray-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-blue-500">+</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={Boolean(loading) || current}
                className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  current
                    ? "bg-gray-200 text-gray-600"
                    : "bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg"
                }`}
              >
                {current
                  ? "Current Plan"
                  : loading === plan.id
                  ? "Processing..."
                  : planKey === "FREE_LOCKED"
                  ? hasUsedTrial
                    ? "Buy Now"
                    : "Start Free Trial"
                  : "Upgrade Now"}
              </button>

              <p className="mt-3 text-xs text-gray-500">
                {planKey === "FREE_LOCKED" && !hasUsedTrial
                  ? "7-day free trial applies on the first checkout only."
                  : "Automatic tax and billing-country pricing are applied at checkout."}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-white/85 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
        <PaymentHistory invoices={invoices} />
      </div>
    </div>
  );
}
