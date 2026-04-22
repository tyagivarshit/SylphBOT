"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmCheckout } from "@/lib/billing";
import { buildApiUrl } from "@/lib/userApi";

type BillingPayload = {
  success?: boolean;
  billing?: {
    status?: "INACTIVE" | "ACTIVE" | "TRIAL";
  } | null;
  subscription?: {
    status?: string;
    plan?: {
      name?: string | null;
      type?: string | null;
    } | null;
  } | null;
};

const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizePlanKey = (value?: string | null) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const getResolvedPlanKey = (payload: BillingPayload | null) =>
  normalizePlanKey(
    payload?.subscription?.plan?.type || payload?.subscription?.plan?.name || null
  );

const isActivated = (
  payload: BillingPayload | null,
  expectedPlan: string
) => {
  const billingStatus = payload?.billing?.status;
  const subscriptionStatus = payload?.subscription?.status;
  const active =
    billingStatus === "ACTIVE" ||
    billingStatus === "TRIAL" ||
    subscriptionStatus === "ACTIVE";

  if (!active) {
    return false;
  }

  if (!expectedPlan) {
    return true;
  }

  return getResolvedPlanKey(payload) === expectedPlan;
};

const getPlanLabel = (payload: BillingPayload | null) =>
  payload?.subscription?.plan?.name ||
  payload?.subscription?.plan?.type ||
  "your selected";

const getSuccessMessage = (payload: BillingPayload | null) => {
  const planLabel = getPlanLabel(payload);

  if (payload?.billing?.status === "TRIAL") {
    return `${planLabel} is now active and your trial is running.`;
  }

  return `${planLabel} is now active on your workspace.`;
};

const fetchBilling = async (): Promise<BillingPayload | null> => {
  try {
    const res = await fetch(buildApiUrl("/api/billing"), {
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
};

function SuccessPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expectedPlan = normalizePlanKey(searchParams.get("plan"));
  const sessionId = searchParams.get("session_id");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("Verifying your subscription...");
  const [resolvedPlan, setResolvedPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const activate = async () => {
      window.setTimeout(() => {
        if (!cancelled) {
          setShow(true);
        }
      }, 250);

      if (sessionId) {
        const confirmed = await confirmCheckout(sessionId);

        if (!cancelled && isActivated(confirmed, expectedPlan)) {
          setResolvedPlan(getPlanLabel(confirmed));
          setMessage(getSuccessMessage(confirmed));
          setLoading(false);
          return;
        }
      }

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const billing = await fetchBilling();

        if (!cancelled && isActivated(billing, expectedPlan)) {
          setResolvedPlan(getPlanLabel(billing));
          setMessage(getSuccessMessage(billing));
          setLoading(false);
          return;
        }

        await sleep(1500);
      }

      if (!cancelled) {
        setLoading(false);
        setFailed(true);
        setMessage(
          "Your payment finished in Stripe, but the plan is still syncing. Please reopen billing in a moment."
        );
      }
    };

    void activate();

    return () => {
      cancelled = true;
    };
  }, [expectedPlan, sessionId]);

  const statusTitle = loading
    ? "Verifying Payment"
    : failed
      ? "Activation Pending"
      : "Subscription Active";
  const statusTone = loading
    ? "border-blue-400 text-blue-600"
    : failed
      ? "border-amber-400 text-amber-600"
      : "border-green-500 text-green-600";
  const statusIcon = loading ? "..." : failed ? "!" : "OK";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all duration-500 ${statusTone} ${
              show ? "scale-100" : "scale-0"
            }`}
          >
            <span className="text-3xl">{statusIcon}</span>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">
          {statusTitle}
        </h1>

        <p className="mt-2 text-sm text-gray-500">{message}</p>

        {!failed && resolvedPlan ? (
          <p className="mt-3 text-sm font-semibold text-gray-900">
            Active plan: {resolvedPlan}
          </p>
        ) : null}

        <button
          onClick={() => router.push("/billing")}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-white disabled:opacity-50"
        >
          {loading ? "Checking..." : "Open Billing"}
        </button>
      </div>
    </div>
  );
}

function SuccessPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-semibold text-gray-900">
          Verifying payment
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Preparing your billing confirmation...
        </p>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<SuccessPageFallback />}>
      <SuccessPageContent />
    </Suspense>
  );
}
