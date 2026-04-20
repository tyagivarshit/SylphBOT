"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildApiUrl } from "@/lib/url";

type Currency = "INR" | "USD";

type PricingPlan = {
  id: string;
  name: string;
  type: "BASIC" | "PRO" | "ELITE";
  description: string;
  popular?: boolean;
  monthlyPrice: Record<Currency, number>;
  limits: {
    contactsLimit: number;
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    messageLimit: number;
    automationLimit: number;
  };
  features: string[];
};

type PricingResponse = {
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

export default function PricingPage() {
  const [currency, setCurrency] = useState<Currency>("INR");
  const [pricing, setPricing] = useState<PricingResponse>({
    plans: [],
    addons: [],
    trialDays: 7,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadPlans = async () => {
      try {
        const res = await fetch(buildApiUrl("/api/billing/plans"), {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);

        if (!mounted || !res.ok || !payload?.plans) {
          return;
        }

        setPricing({
          plans: payload.plans,
          addons: payload.addons || [],
          trialDays: payload.trialDays || 7,
        });
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadPlans();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="brand-app brand-shell">
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <header className="brand-panel-strong rounded-[32px] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Pricing
              </p>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Generous plans for growth, strict controls behind the scenes.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Start with a {pricing.trialDays} day free trial, pick the daily AI capacity that fits your team, and top up with extra AI calls whenever you need more.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="flex rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-sm">
                {(["INR", "USD"] as Currency[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setCurrency(type)}
                    className={`rounded-[14px] px-4 py-2 text-sm font-semibold transition-all ${
                      currency === type
                        ? "bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] text-white shadow"
                        : "text-slate-600"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <Link
                href="/billing"
                className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="brand-panel rounded-[28px] p-10 text-center text-sm text-slate-500">
            Loading pricing...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {pricing.plans.map((plan) => (
              <div
                key={plan.type}
                className={`relative rounded-[28px] border bg-white/84 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
                  plan.popular ? "border-blue-300" : "border-slate-200/80"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}

                <div className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">
                      {plan.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {plan.description}
                    </p>
                  </div>

                  <div>
                    <p className="text-4xl font-semibold tracking-tight text-slate-950">
                      {formatMoney(plan.monthlyPrice[currency], currency)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">per month</p>
                    <p className="mt-3 text-sm font-medium text-blue-600">
                      Includes {plan.limits.aiDailyLimit} AI calls/day
                    </p>
                  </div>

                  <div className="rounded-[22px] bg-blue-50/70 p-4 text-sm text-slate-600">
                    <p>{plan.limits.contactsLimit.toLocaleString()} contacts included</p>
                    <p className="mt-1">
                      {plan.limits.aiMonthlyLimit.toLocaleString()} AI calls/month
                    </p>
                    <p className="mt-1">
                      {plan.limits.messageLimit === -1
                        ? "Unlimited messages"
                        : `${plan.limits.messageLimit.toLocaleString()} messages/month`}
                    </p>
                    <p className="mt-1">
                      {plan.limits.automationLimit === -1
                        ? "Unlimited automation runs"
                        : `${plan.limits.automationLimit.toLocaleString()} automation runs/month`}
                    </p>
                  </div>

                  <ul className="space-y-3 text-sm text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="text-blue-500">+</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/billing"
                  className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] px-4 py-3 text-sm font-semibold text-white transition hover:shadow-lg"
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="brand-panel-strong rounded-[28px] p-6">
          <h2 className="text-lg font-semibold text-slate-950">
            Buy Extra AI Calls
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Keep the experience generous for your team while staying in control with add-on credits for AI and contacts.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {(pricing.addons || []).map((addon) => (
              <div
                key={addon.type}
                className="rounded-[22px] border border-slate-200/80 bg-white/84 p-4"
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
      </div>
    </div>
  );
}
