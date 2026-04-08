"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmCheckout } from "@/lib/billing";
import { buildApiUrl } from "@/lib/userApi";

type BillingPayload = {
  success?: boolean;
  billing?: {
    status?: "INACTIVE" | "ACTIVE" | "TRIAL";
  };
  subscription?: {
    status?: string;
  };
};

const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const isActivated = (payload: BillingPayload | null) => {
  const billingStatus = payload?.billing?.status;
  const subscriptionStatus = payload?.subscription?.status;

  return (
    billingStatus === "ACTIVE" ||
    billingStatus === "TRIAL" ||
    subscriptionStatus === "ACTIVE"
  );
};

const getSuccessMessage = (
  payload: BillingPayload | null,
  upgraded: boolean
) => {
  if (upgraded) {
    return "Your plan change is now live.";
  }

  if (payload?.billing?.status === "TRIAL") {
    return "Your 7-day free trial is now active.";
  }

  return "Your subscription is now active.";
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
  const sessionId = searchParams.get("session_id");
  const upgraded = searchParams.get("upgraded") === "1";
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Verifying your payment...");
  const [failed, setFailed] = useState(false);

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

        if (!cancelled && confirmed?.success && isActivated(confirmed)) {
          setMessage(getSuccessMessage(confirmed, upgraded));
          setLoading(false);
          return;
        }
      }

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const billing = await fetchBilling();

        if (!cancelled && isActivated(billing)) {
          setMessage(getSuccessMessage(billing, upgraded));
          setLoading(false);
          return;
        }

        await sleep(1500);
      }

      if (!cancelled) {
        setLoading(false);
        setFailed(true);
        setMessage(
          "Payment completed, but activation is still syncing. Please reopen billing once."
        );
      }
    };

    activate();

    return () => {
      cancelled = true;
    };
  }, [sessionId, upgraded]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition-all duration-500 ${
              failed
                ? "border-amber-400 text-amber-600"
                : "border-green-500 text-green-600"
            } ${show ? "scale-100" : "scale-0"}`}
          >
            <span className="text-3xl">{failed ? "!" : "OK"}</span>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-gray-900">
          {failed ? "Activation Pending" : "Payment Successful"}
        </h1>

        <p className="mt-2 text-sm text-gray-500">{message}</p>

        <button
          onClick={() => router.push(failed ? "/billing" : "/dashboard")}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-white disabled:opacity-50"
        >
          {loading
            ? "Please wait..."
            : failed
            ? "Back to Billing"
            : "Go to Dashboard"}
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
