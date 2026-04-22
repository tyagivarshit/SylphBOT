"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl, buildAppUrl } from "@/lib/userApi";

type BillingResponse = {
  subscription?: {
    status?: string;
    stripeSubscriptionId?: string | null;
    plan?: {
      name?: string | null;
      type?: string | null;
    } | null;
  } | null;
  billing?: {
    status?: string;
    planKey?: string;
  } | null;
  usage?: {
    aiCallsUsed?: number;
    messagesUsed?: number;
    followupsUsed?: number;
  } | null;
};

export default function BillingSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/billing"), {
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("Failed to load billing");
      }

      return (await res.json()) as BillingResponse;
    },
  });

  const subscription = data?.subscription;
  const billing = data?.billing;
  const isPaidSubscription = Boolean(subscription?.stripeSubscriptionId);

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(buildApiUrl("/api/billing/portal"), {
        method: "POST",
        credentials: "include",
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.url) {
        throw new Error(payload?.message || "Portal failed");
      }

      return payload.url as string;
    },
    onSuccess: (url) => {
      window.location.assign(url);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(buildApiUrl("/api/billing/cancel"), {
        method: "POST",
        credentials: "include",
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "Cancel failed");
      }

      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing"] });
      alert("Subscription will cancel at period end.");
    },
  });

  const handlePrimaryAction = () => {
    if (isPaidSubscription) {
      portalMutation.mutate();
      return;
    }

    window.location.assign(buildAppUrl("/billing"));
  };

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500 animate-pulse">
        Loading billing...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm bg-red-100 text-red-600 px-3 py-2 rounded-md inline-block">
        Failed to load billing settings
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 space-y-6 shadow-sm">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          Billing and Plan
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage your subscription and billing
        </p>
      </div>

      <div className="border border-blue-100 rounded-2xl p-5 flex items-center justify-between bg-white/70 backdrop-blur-xl hover:shadow-md transition gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {subscription?.plan?.name || "FREE PLAN"}
          </p>

          <p className="text-xs text-gray-500 mt-1">
            Status:{" "}
            <span
              className={`ml-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                billing?.status === "ACTIVE" || billing?.status === "TRIAL"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {billing?.status || subscription?.status || "INACTIVE"}
            </span>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePrimaryAction}
            disabled={portalMutation.isPending}
            className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-70"
          >
            {portalMutation.isPending
              ? "Opening..."
              : isPaidSubscription
              ? "Manage Billing"
              : "Open Billing"}
          </button>

          {isPaidSubscription && (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-100 hover:shadow-md transition disabled:opacity-70"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>
      </div>

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
