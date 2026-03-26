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

        /* GEO */
        if (geoRes.status === "fulfilled") {
          const geo = await geoRes.value.json();
          setCurrency(geo?.country === "IN" ? "INR" : "USD");
        }

        /* BILLING */
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

  /* ================= PLANS ================= */

  const plans = [
    {
      id: "BASIC",
      name: "Basic",
      popular: false,
      INR: { monthly: 999, yearly: 9990, early: 799 },
      USD: { monthly: 19, yearly: 190, early: 15 },
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
      INR: { monthly: 1999, yearly: 19990, early: 1599 },
      USD: { monthly: 49, yearly: 490, early: 39 },
      features: [
        "Everything in Basic",
        "WhatsApp Automation",
        "CRM + Follow-ups",
      ],
    },
    {
      id: "ELITE",
      name: "Elite",
      popular: false,
      INR: { monthly: 3999, yearly: 39990, early: 2999 },
      USD: { monthly: 99, yearly: 990, early: 79 },
      features: [
        "Everything in Pro",
        "AI Booking System",
        "Advanced Workflows",
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
      <div className="min-h-screen bg-[#f9fcff] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-[#14E1C1] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f9fcff] flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="min-h-screen bg-[#f9fcff] p-6 space-y-10">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Billing
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your subscription and payments
          </p>
        </div>

        {/* TOGGLE */}
        <div className="flex bg-white border border-gray-200 rounded-lg p-1 text-sm shadow-sm">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-4 py-1.5 rounded-md transition ${
              billing === "monthly"
                ? "bg-gradient-to-r from-[#14E1C1] to-blue-500 text-white"
                : "text-gray-600"
            }`}
          >
            Monthly
          </button>

          <button
            onClick={() => setBilling("yearly")}
            className={`px-4 py-1.5 rounded-md transition ${
              billing === "yearly"
                ? "bg-gradient-to-r from-[#14E1C1] to-blue-500 text-white"
                : "text-gray-600"
            }`}
          >
            Yearly
          </button>
        </div>

      </div>

      {/* PLANS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {plans.map((plan) => {

          const data = plan[currency];

          const price = isEarly
            ? data.early
            : billing === "monthly"
            ? data.monthly
            : data.yearly;

          const original =
            billing === "monthly" ? data.monthly : data.yearly;

          const isCurrent =
            subscription?.plan?.name === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative bg-white border rounded-2xl p-6 transition shadow-sm
              ${
                isCurrent
                  ? "border-[#14E1C1] shadow-lg"
                  : "border-gray-200 hover:shadow-xl hover:-translate-y-1"
              }`}
            >

              {/* POPULAR */}
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-gradient-to-r from-[#14E1C1] to-blue-500 text-white px-3 py-1 rounded-full shadow">
                  Most Popular
                </span>
              )}

              {/* NAME */}
              <h2 className="text-lg font-semibold text-gray-900">
                {plan.name}
              </h2>

              {isCurrent && (
                <span className="text-xs text-[#14E1C1] font-medium">
                  ✔ Current Plan
                </span>
              )}

              {/* PRICE */}
              <div className="mt-4">

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

              {/* FEATURES */}
              <ul className="mt-5 space-y-2 text-sm text-gray-700">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#14E1C1]">✔</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={loading === plan.id || isCurrent}
                className={`mt-6 w-full py-2.5 rounded-lg text-sm font-semibold transition
                ${
                  isCurrent
                    ? "bg-gray-200 text-gray-600"
                    : "bg-gradient-to-r from-[#14E1C1] via-blue-500 to-indigo-500 text-white hover:opacity-90"
                }`}
              >
                {isCurrent
                  ? "Current Plan"
                  : loading === plan.id
                  ? "Processing..."
                  : "Upgrade Plan"}
              </button>

            </div>
          );
        })}
      </div>

      {/* PAYMENT HISTORY */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <PaymentHistory invoices={invoices} />
      </div>

    </div>
  );
}