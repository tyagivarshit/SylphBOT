"use client";

import { useEffect, useState } from "react";
import { createCheckout, upgradePlan } from "@/lib/billing";
import PaymentHistory from "@/components/billing/PaymentHistory";

const API = process.env.NEXT_PUBLIC_API_URL;

type Currency = "INR" | "USD";

export default function BillingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const [currency, setCurrency] = useState<Currency>("INR");
  const [lockedCurrency, setLockedCurrency] = useState<Currency | null>(null);

  const [isEarly, setIsEarly] = useState(false);

  const [subscription, setSubscription] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingContext, setBillingContext] = useState<any>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ================= INIT ================= */

  useEffect(() => {
    const init = async () => {
      try {
        const [geoRes, billingRes] = await Promise.allSettled([
          fetch("https://ipapi.co/json/"),
          fetch(`${API}/api/billing`, {
            credentials: "include",
          }),
        ]);

        if (geoRes.status === "fulfilled") {
          const geo = await geoRes.value.json();
          setCurrency(geo?.country === "IN" ? "INR" : "USD");
        }

        if (billingRes.status === "fulfilled") {
          const res = await billingRes.value.json();

          if (!res?.success) {
            throw new Error(res?.message || "Billing failed");
          }

          if (res.subscription) {
            setSubscription(res.subscription);
          }

          if (res.subscription?.currency) {
            setLockedCurrency(res.subscription.currency);
            setCurrency(res.subscription.currency);
          }

          if (res.invoices) {
            setInvoices(res.invoices);
          }

          if (res.billing) {
            setBillingContext(res.billing);
          }
        }

        setIsEarly(true);

      } catch (err) {
        console.error(err);
        setError("Failed to load billing");
      } finally {
        setPageLoading(false);
      }
    };

    init();
  }, []);

  /* ================= FLAGS ================= */

  const planKey = billingContext?.planKey || "FREE_LOCKED";

  // 🔥 FIX 1: trial check robust
  const hasUsedTrial =
    subscription?.hasUsedTrial ||
    subscription?.trialUsed ||
    false;

  /* ================= PLANS ================= */

  const plans = [
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
        "Instagram DM Automation",
        "Comment → DM Automation",
        "Basic AI Responses",
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
        "WhatsApp Automation",
        "CRM + Follow-ups",
        "Unlimited Automation",
        "Priority Support",
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
        "AI Booking System",
        "Advanced Workflows",
        "Unlimited Usage",
        "Dedicated Support",
      ],
    },
  ];

  /* ================= HANDLER ================= */

  const handleUpgrade = async (plan: string) => {
    if (loading) return;

    try {
      setLoading(plan);

      if (lockedCurrency && lockedCurrency !== currency) {
        alert("Currency cannot be changed once subscribed");
        return;
      }

      const upgrade = await upgradePlan(plan, billing);

      if (upgrade?.url) {
        window.location.href = upgrade.url;
        return;
      }

      const checkout = await createCheckout(plan, billing);

      if (checkout?.url) {
        window.location.href = checkout.url;
      }

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    } finally {
      setLoading(null);
    }
  };

  /* ================= STATES ================= */

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-[#14E1C1] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f9fcff] via-white to-[#eef6ff] p-4 md:p-8 space-y-10">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">

        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            Billing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your subscription and payments
          </p>
        </div>

        {/* ❌ REMOVED: No Active Plan badge */}

        {/* TOGGLE */}
        <div className="flex bg-white/70 backdrop-blur border border-gray-200 rounded-xl p-1 shadow-sm">
          {["monthly", "yearly"].map((type) => (
            <button
              key={type}
              onClick={() => setBilling(type as any)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                billing === type
                  ? "bg-gradient-to-r from-[#14E1C1] to-blue-500 text-white shadow"
                  : "text-gray-600"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

      </div>

      {/* TEXT */}
      <p className="text-center text-sm text-gray-500">
        Most users choose <span className="font-semibold text-black">Pro</span> 🚀
      </p>

      {/* PLANS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">

        {plans.map((plan) => {

          const data = plan[currency];

          const price =
            billing === "monthly"
              ? isEarly
                ? data.earlyMonthly
                : data.monthly
              : isEarly
              ? data.earlyYearly
              : data.yearly;

          const original =
            billing === "monthly" ? data.monthly : data.yearly;

          const isCurrent =
            subscription?.plan?.name === plan.id &&
            planKey !== "FREE_LOCKED";

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-[1px] ${
                plan.popular
                  ? "bg-gradient-to-r from-[#14E1C1] via-blue-500 to-indigo-500"
                  : "bg-gray-200"
              }`}
            >
              <div className="bg-white rounded-2xl p-6 h-full flex flex-col justify-between transition-all hover:shadow-2xl hover:-translate-y-1">

                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="text-xs bg-black text-white px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="space-y-4">

                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {plan.name}
                    </h2>

                    {isCurrent && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md">
                        Active
                      </span>
                    )}
                  </div>

                  <div>
                    {isEarly && (
                      <p className="text-xs line-through text-gray-400">
                        {currency === "INR" ? "₹" : "$"}
                        {original}
                      </p>
                    )}

                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold text-gray-900">
                        {currency === "INR" ? "₹" : "$"}
                        {price}
                      </span>
                      <span className="text-sm text-gray-500">
                        /{billing}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-2 text-sm text-gray-700">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[#14E1C1]">✔</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                </div>

                {/* ✅ BUTTON FIX */}
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={loading === plan.id || isCurrent}
                  className={`mt-6 w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isCurrent
                      ? "bg-gray-200 text-gray-600"
                      : "bg-gradient-to-r from-[#14E1C1] via-blue-500 to-indigo-500 text-white hover:opacity-90 shadow-md"
                  }`}
                >
                  {isCurrent
                    ? "Current Plan"
                    : loading === plan.id
                    ? "Processing..."
                    : planKey === "FREE_LOCKED"
                    ? hasUsedTrial
                      ? "Buy Now"
                      : "Start Free Trial"
                    : "Upgrade Plan"}
                </button>

              </div>
            </div>
          );
        })}
      </div>

      {/* PAYMENT HISTORY */}
      <div className="bg-white/80 backdrop-blur border border-gray-200 rounded-2xl p-6 shadow-sm">
        <PaymentHistory invoices={invoices} />
      </div>

    </div>
  );
}