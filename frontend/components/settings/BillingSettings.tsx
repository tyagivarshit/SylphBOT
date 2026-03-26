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
    return <div className="text-sm text-gray-500">Loading billing...</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">

      {/* HEADER */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Billing & Plan
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Manage your subscription and billing
        </p>
      </div>

      {/* PLAN CARD */}
      <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-between">

        <div>
          <p className="text-sm font-semibold text-gray-900">
            {subscription?.plan?.name || "FREE PLAN"}
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Status:{" "}
            <span className="font-medium text-gray-700">
              {subscription?.status || "INACTIVE"}
            </span>
          </p>
        </div>

        <div className="flex gap-2">

          <button className="btn-upgrade">
            Upgrade
          </button>

          {subscription?.status === "ACTIVE" && (
            <button className="btn-cancel">
              Cancel
            </button>
          )}

        </div>

      </div>

      {/* USAGE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <div className="usage-card">
          <p>AI Calls</p>
          <span>{data?.usage?.aiCallsUsed || 0}</span>
        </div>

        <div className="usage-card">
          <p>Messages</p>
          <span>{data?.usage?.messagesUsed || 0}</span>
        </div>

        <div className="usage-card">
          <p>Followups</p>
          <span>{data?.usage?.followupsUsed || 0}</span>
        </div>

      </div>

      {/* STYLES */}
      <style jsx>{`
        .btn-upgrade {
          background: #14e1c1;
          color: white;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
        }

        .btn-cancel {
          border: 1px solid #ef4444;
          color: #ef4444;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 13px;
        }

        .usage-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 12px;
          text-align: center;
        }

        .usage-card p {
          font-size: 12px;
          color: #6b7280;
        }

        .usage-card span {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
        }
      `}</style>

    </div>
  );
}