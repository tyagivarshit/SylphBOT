"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function BillingCancelContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-semibold text-gray-900">
          Checkout Cancelled
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          {plan
            ? `Your ${plan} upgrade was not completed, and your current plan has not changed.`
            : "Your current plan has not changed."}
        </p>

        <button
          onClick={() => router.push("/billing")}
          className="mt-6 w-full rounded-xl bg-blue-600 py-2.5 text-white"
        >
          Back to Billing
        </button>
      </div>
    </div>
  );
}

function BillingCancelFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-xl font-semibold text-gray-900">
          Checkout Cancelled
        </h1>
      </div>
    </div>
  );
}

export default function BillingCancelPage() {
  return (
    <Suspense fallback={<BillingCancelFallback />}>
      <BillingCancelContent />
    </Suspense>
  );
}
