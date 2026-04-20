"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createCheckout, upgradePlan } from "@/lib/billing";
import PaymentHistory from "@/components/billing/PaymentHistory";
import UsageSummary from "@/components/billing/UsageSummary";
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

type UsageSummaryPayload = {
  plan: string;
  planLabel?: string;
  trialActive: boolean;
  daysLeft: number;
  warning?: boolean;
  warningMessage?: string | null;
  addonCredits?: number;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  usage: {
    ai: {
      used: number;
      dailyLimit: number;
      monthlyUsed: number;
      monthlyLimit: number;
      warning?: boolean;
    };
    contacts: {
      used: number;
      limit: number;
    };
    messages: {
      used: number;
      limit: number;
    };
  };
  addons: {
    aiCredits: number;
    contacts?: number;
  };
};

type PricingPlan = {
  id: string;
  name: string;
  type: PlanId;
  description: string;
  popular?: boolean;
  monthlyPrice: Record<Currency, number>;
  yearlyPrice: Record<Currency, number>;
  limits: {
    contactsLimit: number;
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    messageLimit: number;
    automationLimit: number;
  };
  features: string[];
};

type PlansResponse = {
  plans: PricingPlan[];
  addons?: Array<{
    type: string;
    label: string;
    description: string;
  }>;
  trialDays?: number;
};

const formatMoney = (amount: number, currency: Currency) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const normalizePlanKey = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const isCurrentPlan = (
  subscription: Subscription | null,
  planId: PlanId,
  planKey: string
) => {
  if (planKey === "FREE_LOCKED" || planKey === "LOCKED") {
    return false;
  }

  const currentType = normalizePlanKey(subscription?.plan?.type);
  const currentName = normalizePlanKey(subscription?.plan?.name);

  return currentType === planId || currentName === planId;
};

async function fetchJson<T>(url: string) {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || "Request failed");
  }

  return data as T;
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [lockedCurrency, setLockedCurrency] = useState<Currency | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingContext, setBillingContext] = useState<BillingContext | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryPayload | null>(null);
  const [plansResponse, setPlansResponse] = useState<PlansResponse>({
    plans: [],
    addons: [],
    trialDays: 7,
  });
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBilling = async () => {
      try {
        const [billingData, plansData, usageData] = await Promise.all([
          fetchJson<any>(buildApiUrl("/api/billing")),
          fetchJson<any>(buildApiUrl("/api/billing/plans")),
          fetchJson<UsageSummaryPayload>(buildApiUrl("/api/usage")),
        ]);

        setSubscription(billingData.subscription || null);
        setInvoices(billingData.invoices || []);
        setBillingContext(billingData.billing || null);
        setUsageSummary(usageData || null);
        setPlansResponse({
          plans: plansData.plans || [],
          addons: plansData.addons || [],
          trialDays: plansData.trialDays || 7,
        });

        const nextCurrency =
          billingData.subscription?.currency || billingData.currency || "INR";

        setCurrency(nextCurrency);
        setLockedCurrency(billingData.subscription?.currency || null);

        if (billingData.subscription?.billingCycle) {
          setBilling(billingData.subscription.billingCycle);
        }
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load billing");
      } finally {
        setPageLoading(false);
      }
    };

    void loadBilling();
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

  const plans = useMemo(
    () => plansResponse.plans.slice().sort((left, right) => {
      const order: PlanId[] = ["BASIC", "PRO", "ELITE"];
      return order.indexOf(left.type) - order.indexOf(right.type);
    }),
    [plansResponse.plans]
  );

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
        planKey !== "FREE_LOCKED" &&
        planKey !== "LOCKED" &&
        subscription?.stripeSubscriptionId
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
      <div className="flex min-h-[18rem] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[18rem] items-center justify-center text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Pricing and billing
            </p>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Monthly pricing is shown in {currency}. Taxes are applied automatically at checkout.
            </p>
          </div>

          <div className="flex rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-sm">
            {(["monthly", "yearly"] as BillingCycle[]).map((type) => (
              <button
                key={type}
                onClick={() => setBilling(type)}
                className={`rounded-[14px] px-5 py-2 text-sm font-semibold transition-all ${
                  billing === type
                    ? "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow"
                    : "text-slate-600"
                }`}
              >
                {type === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-800 shadow-sm">
          Checkout was cancelled. Your plan has not changed.
        </div>
      )}

      {allowEarly && (
        <div className="brand-info-strip rounded-[24px] px-5 py-4">
          <p className="text-sm font-semibold text-gray-900">
            Early access offer live
          </p>
          <p className="mt-1 text-sm text-gray-600">
            First 50 clients get discounted pricing. {remainingEarly} spot
            {remainingEarly === 1 ? "" : "s"} remaining.
          </p>
        </div>
      )}

      <div className="brand-section-shell rounded-[26px] p-5">
        <p className="text-sm font-semibold text-gray-900">
          {billingStatus === "TRIAL"
            ? `${plansResponse.trialDays} day trial is active`
            : billingStatus === "ACTIVE"
              ? "Paid subscription is active"
              : hasUsedTrial
                ? "Trial already used"
                : `Your first checkout includes a ${plansResponse.trialDays} day free trial`}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {billingStatus === "TRIAL" && currentPeriodEnd
            ? `Trial access stays active until ${currentPeriodEnd}. After that, service becomes locked if no paid subscription continues.`
            : billingStatus === "ACTIVE"
              ? "You can switch plans anytime and Stripe will handle billing updates."
              : hasUsedTrial
                ? "Your workspace stays locked until a paid plan is active again."
                : "Start with Pro-level access free for 7 days, then keep momentum going with the plan that fits your growth."}
        </p>
      </div>

      <UsageSummary summary={usageSummary} />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const displayPrice =
            billing === "monthly"
              ? plan.monthlyPrice[currency]
              : plan.yearlyPrice[currency];
          const current = isCurrentPlan(subscription, plan.type, planKey);

          return (
            <div
              key={plan.type}
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
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {plan.name}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {plan.description}
                    </p>
                  </div>

                  {current && (
                    <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold text-gray-900">
                      {formatMoney(displayPrice, currency)}
                    </span>
                    <span className="pb-1 text-sm text-gray-500">
                      /{billing}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-blue-600">
                    Includes {plan.limits.aiDailyLimit} AI calls/day
                  </p>
                </div>

                <div className="rounded-xl bg-blue-50/70 p-3 text-xs text-slate-600">
                  <p>{plan.limits.contactsLimit.toLocaleString()} contacts included</p>
                  <p className="mt-1">
                    {plan.limits.aiMonthlyLimit.toLocaleString()} AI responses/month
                  </p>
                  <p className="mt-1">
                    {plan.limits.messageLimit === -1
                      ? "Unlimited monthly messages"
                      : `${plan.limits.messageLimit.toLocaleString()} messages/month`}
                  </p>
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
                onClick={() => handleCheckout(plan.type)}
                disabled={Boolean(loading) || current}
                className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  current
                    ? "bg-gray-200 text-gray-600"
                    : "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white hover:shadow-lg"
                }`}
              >
                {current
                  ? "Current Plan"
                  : loading === plan.type
                    ? "Processing..."
                    : planKey === "FREE_LOCKED" || planKey === "LOCKED"
                      ? hasUsedTrial
                        ? "Buy Now"
                        : "Start Free Trial"
                      : "Upgrade Now"}
              </button>

              <p className="mt-3 text-xs text-gray-500">
                {planKey === "FREE_LOCKED" || planKey === "LOCKED"
                    ? hasUsedTrial
                      ? "Need more? Buy extra AI calls anytime."
                      : `${plansResponse.trialDays} day free trial applies on the first checkout only.`
                  : "Need more? Buy extra AI calls anytime."}
              </p>
            </div>
          );
        })}
      </div>

      {plansResponse.addons?.length ? (
        <div className="brand-section-shell rounded-[26px] p-5">
          <h3 className="text-base font-semibold text-gray-900">
            Buy Extra AI Calls
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {plansResponse.addons.map((addon) => (
              <div
                key={addon.type}
                className="rounded-[20px] border border-slate-200/80 bg-white/84 p-4 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-950">
                  {addon.label}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {addon.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <PaymentHistory invoices={invoices} />
    </div>
  );
}

function BillingPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500" />
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageFallback />}>
      <BillingPageContent />
    </Suspense>
  );
}
