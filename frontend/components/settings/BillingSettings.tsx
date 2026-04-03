"use client";

import { useQuery } from "@tanstack/react-query";

const API_URL = "http://localhost:5000";

export default function BillingSettings() {
  /* =========================
     🔥 FETCH BILLING DATA
  ========================= */
  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/billing/current`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed");

      return res.json();
    },
  });

  const subscription = data?.subscription;

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500 animate-pulse">
        Loading billing...
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 space-y-6 shadow-sm">

      {/* HEADER */}
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Billing & Plan
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage your subscription and billing
        </p>
      </div>

      {/* PLAN CARD */}
      <div className="border border-blue-100 rounded-2xl p-5 flex items-center justify-between bg-white/70 backdrop-blur-xl hover:shadow-md transition">

        <div>
          <p className="text-sm font-semibold text-gray-900">
            {subscription?.plan?.name || "FREE PLAN"}
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Status:{" "}
            <span
              className={`ml-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                subscription?.status === "ACTIVE"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {subscription?.status || "INACTIVE"}
            </span>
          </p>
        </div>

        <div className="flex gap-2">

          <button className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg transition">
            Upgrade
          </button>

          {subscription?.status === "ACTIVE" && (
            <button className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-100 hover:shadow-md transition">
              Cancel
            </button>
          )}

        </div>

      </div>

      {/* USAGE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 text-center hover:shadow-md transition">
          <p className="text-xs text-gray-500">AI Calls</p>
          <span className="text-lg font-semibold text-gray-900">
            {data?.usage?.aiCallsUsed || 0}
          </span>
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 text-center hover:shadow-md transition">
          <p className="text-xs text-gray-500">Messages</p>
          <span className="text-lg font-semibold text-gray-900">
            {data?.usage?.messagesUsed || 0}
          </span>
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 text-center hover:shadow-md transition">
          <p className="text-xs text-gray-500">Followups</p>
          <span className="text-lg font-semibold text-gray-900">
            {data?.usage?.followupsUsed || 0}
          </span>
        </div>

      </div>

    </div>
  );
}