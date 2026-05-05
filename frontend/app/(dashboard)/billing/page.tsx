"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { createCheckoutSession } from "@/lib/billing";
import { notify } from "@/lib/toast";
import PaymentHistory from "@/components/billing/PaymentHistory";
import { apiFetch } from "@/lib/apiClient";
import LoadingButton from "@/components/ui/LoadingButton";
import { SkeletonCard } from "@/components/ui/feedback";

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

type Invoice = {
  id: string;
  amount?: number;
  subtotal?: number;
  taxAmount?: number;
  currency?: string;
  created?: number;
  status?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
};

type BillingContext = {
  planKey?: string;
  status?: "INACTIVE" | "ACTIVE" | "TRIAL";
  allowEarly?: boolean;
  remainingEarly?: number;
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
  meta?: {
    degraded?: boolean;
    reason?: string | null;
  } | null;
};

type BillingApiResponse = {
  subscription?: Subscription | null;
  invoices?: Invoice[];
  billing?: BillingContext | null;
  currency?: Currency;
  meta?: {
    degraded?: boolean;
    reason?: string | null;
  } | null;
};

const DEFAULT_BILLING_CONTEXT: BillingContext = {
  planKey: "FREE_LOCKED",
  status: "INACTIVE",
  allowEarly: false,
  remainingEarly: 0,
};

const fetchJsonWithRetry = async <T,>(
  url: string,
  retries = 1,
  timeoutMs = 6000
) => {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= retries) {
    try {
      return await fetchJson<T>(url, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed");
      attempt += 1;

      if (attempt > retries) {
        break;
      }

      await new Promise((resolve) =>
        window.setTimeout(resolve, 350 * attempt)
      );
    }
  }

  throw lastError || new Error("Request failed");
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

async function fetchJson<T>(url: string, timeoutMs = 6000) {
  const response = await apiFetch<T>(url, {
    credentials: "include",
    cache: "no-store",
    timeoutMs,
  });

  if (!response.success || !response.data) {
    throw new Error(response.message || "Request failed");
  }

  return response.data as T;
}

function BillingPageContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<Currency>("INR");
  const [lockedCurrency, setLockedCurrency] = useState<Currency | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [billingContext, setBillingContext] = useState<BillingContext | null>(null);
  const [plansResponse, setPlansResponse] = useState<PlansResponse>({
    plans: [],
    addons: [],
    trialDays: 7,
  });
  const [pageLoading, setPageLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const applyBillingState = useCallback((billingData: BillingApiResponse) => {
    setSubscription(billingData.subscription || null);
    setInvoices(Array.isArray(billingData.invoices) ? billingData.invoices : []);
    setBillingContext(billingData.billing || DEFAULT_BILLING_CONTEXT);

    const nextCurrency =
      billingData.subscription?.currency || billingData.currency || "INR";

    setCurrency(nextCurrency);
    setLockedCurrency(billingData.subscription?.currency || null);

    if (
      billingData.subscription?.billingCycle === "monthly" ||
      billingData.subscription?.billingCycle === "yearly"
    ) {
      setBilling(billingData.subscription.billingCycle);
    }
  }, []);

  const applyPlansState = useCallback((plansData: PlansResponse) => {
    setPlansResponse({
      plans: Array.isArray(plansData.plans) ? plansData.plans : [],
      addons: Array.isArray(plansData.addons) ? plansData.addons : [],
      trialDays: plansData.trialDays || 7,
    });
  }, []);

  const loadBilling = useCallback(async (options?: { background?: boolean }) => {
    const isBackground = Boolean(options?.background);
    try {
      if (!isBackground) {
        setPageLoading(true);
      }
      setLoadWarning(null);

      const [billingResult, plansResult] = await Promise.allSettled([
        fetchJsonWithRetry<BillingApiResponse>("/api/billing", 2, 11000),
        fetchJsonWithRetry<PlansResponse>("/api/billing/plans", 2, 5000),
      ]);

      const warnings: string[] = [];
      let resolvedBillingData: BillingApiResponse | null = null;
      let resolvedPlansData: PlansResponse | null = null;

      if (billingResult.status === "fulfilled") {
        resolvedBillingData = billingResult.value;
        applyBillingState(resolvedBillingData);

        if (resolvedBillingData.meta?.degraded) {
          warnings.push("Live billing sync is delayed. Refresh to reconcile the latest provider state.");
        }
      } else {
        warnings.push("Billing summary is temporarily unavailable. Retry in a moment.");
      }

      if (plansResult.status === "fulfilled") {
        resolvedPlansData = plansResult.value;
        applyPlansState(resolvedPlansData);

        const degradedMeta = plansResult.value?.meta;
        if (degradedMeta?.degraded) {
          warnings.push("Plan catalog is running in recovery mode.");
        }
      } else {
        warnings.push("Plan catalog is temporarily unavailable.");
      }

      setLoadWarning(warnings.length ? warnings.join(" ") : null);
    } catch (loadError) {
      setLoadWarning(
        loadError instanceof Error
          ? loadError.message
          : "Some billing data could not be loaded."
      );
    } finally {
      if (!isBackground) {
        setPageLoading(false);
      }
    }
  }, [applyBillingState, applyPlansState]);

  useEffect(() => {
    void loadBilling();

    const interval = window.setInterval(() => {
      void loadBilling({
        background: true,
      });
    }, 45_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadBilling]);

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
    () =>
      plansResponse.plans.slice().sort((left, right) => {
        const order: PlanId[] = ["BASIC", "PRO", "ELITE"];
        return order.indexOf(left.type) - order.indexOf(right.type);
      }),
    [plansResponse.plans]
  );

  const handleCheckout = async (plan: PlanId) => {
    if (loading) {
      return;
    }

    try {
      setLoading(plan);

      if (lockedCurrency && lockedCurrency !== currency) {
        throw new Error(
          "Your billing currency is already locked for this workspace."
        );
      }

      const result = await createCheckoutSession(plan, billing);

      if (!result?.url) {
        throw new Error(result?.message || "No checkout URL received");
      }

      window.location.assign(result.url);
    } catch (checkoutError) {
      notify.error(
        checkoutError instanceof Error
          ? checkoutError.message
          : "We couldn't start checkout right now."
      );
    } finally {
      setLoading(null);
    }
  };

  if (pageLoading) {
    return <BillingPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Pricing and billing
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

      {loadWarning ? (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          {loadWarning}
        </div>
      ) : null}

      {isCancelled ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-800 shadow-sm">
          Checkout was cancelled. Your current plan has not changed.
        </div>
      ) : null}

      {allowEarly ? (
        <div className="brand-info-strip rounded-[24px] px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Early access offer is still live
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {remainingEarly} discounted spot{remainingEarly === 1 ? "" : "s"} remaining.
              </p>
            </div>
            <span className="brand-chip">
              <Sparkles size={13} />
              Early pricing
            </span>
          </div>
        </div>
      ) : null}

      <div className="brand-section-shell rounded-[26px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
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
                ? `Trial access stays active until ${currentPeriodEnd}.`
                : billingStatus === "ACTIVE"
                  ? "You can switch plans anytime and Stripe will handle the billing update."
                  : hasUsedTrial
                    ? "Pick a paid plan to unlock replies, automation, and billing access again."
                    : "Start with a free trial, then keep the momentum going with the plan that fits your volume."}
            </p>
          </div>

          <span className="brand-chip brand-chip-success">
            <ShieldCheck size={13} />
            Secure billing
          </span>
        </div>
      </div>

      <div id="plans" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
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
              {plan.popular ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              ) : null}

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

                  {current ? (
                    <span className="rounded-md bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  ) : null}
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
                    Includes {plan.limits.aiDailyLimit} AI replies per day
                  </p>
                </div>

                <div className="rounded-xl bg-blue-50/70 p-3 text-xs text-slate-600">
                  <p>{plan.limits.contactsLimit.toLocaleString()} contacts included</p>
                  <p className="mt-1">
                    {plan.limits.aiMonthlyLimit.toLocaleString()} AI replies per month
                  </p>
                  <p className="mt-1">
                    {plan.limits.messageLimit === -1
                      ? "Unlimited monthly messages"
                      : `${plan.limits.messageLimit.toLocaleString()} messages per month`}
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

              <LoadingButton
                onClick={() => void handleCheckout(plan.type)}
                loading={loading === plan.type}
                loadingLabel="Redirecting..."
                disabled={Boolean(loading) || current}
                className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  current
                    ? "bg-gray-200 text-gray-600"
                    : "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white hover:shadow-lg"
                }`}
              >
                {current
                  ? "Current Plan"
                  : planKey === "FREE_LOCKED" || planKey === "LOCKED"
                    ? hasUsedTrial
                      ? "Buy Now"
                      : "Start Free Trial"
                    : "Upgrade Now"}
              </LoadingButton>

              <p className="mt-3 text-xs text-gray-500">
                {planKey === "FREE_LOCKED" || planKey === "LOCKED"
                  ? hasUsedTrial
                    ? "Need more flexibility? Buy extra AI credits anytime."
                    : `${plansResponse.trialDays} day free trial applies on the first checkout only.`
                  : "Need more headroom? Buy extra AI credits anytime."}
              </p>
            </div>
          );
        })}

        {plans.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/86 p-6 text-sm text-slate-600 sm:col-span-2 xl:col-span-3">
            Plan options are temporarily unavailable. Your billing state and payment history are still accessible below.
          </div>
        ) : null}
      </div>

      {plansResponse.addons?.length ? (
        <div className="brand-section-shell rounded-[26px] p-5">
          <h3 className="text-base font-semibold text-gray-900">
            Extra AI credits
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Top up when conversations spike without changing your base plan.
          </p>
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

function BillingPageSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-28" />
      <SkeletonCard className="h-36" />
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonCard key={index} className="h-[32rem]" />
        ))}
      </div>
      <SkeletonCard className="h-72" />
    </div>
  );
}

function BillingPageFallback() {
  return <BillingPageSkeleton />;
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageFallback />}>
      <BillingPageContent />
    </Suspense>
  );
}
