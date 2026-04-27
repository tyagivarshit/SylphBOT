"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/apiClient"
import { normalizePlan } from "@/lib/featureGuard"

/* ================= FETCH ================= */

const fetchBilling = async () => {
  const response = await apiFetch<{
    billing?: {
      status?: string;
      planKey?: string;
    };
    subscription?: {
      status?: string;
      plan?: {
        type?: string;
        name?: string;
      };
    };
  }>("/api/billing", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.success || !response.data) {
    throw new Error(response.message || "Failed to fetch billing");
  }

  return response.data;
};

/* ================= HOOK ================= */

export function usePlan() {

  const queryClient = useQueryClient()

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBilling,

    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  /* 🔥 SAFE FALLBACK */
  const status =
    data?.billing?.status ||
    data?.subscription?.status ||
    "INACTIVE"
  const billingPlan = normalizePlan(data?.billing?.planKey)
  const subscriptionPlan = normalizePlan(
    data?.subscription?.plan?.type ||
    data?.subscription?.plan?.name
  )
  const plan =
    (status === "ACTIVE" || status === "TRIAL") &&
    billingPlan === "FREE_LOCKED"
      ? subscriptionPlan
      : billingPlan

  /* 🔥 FORCE REFRESH (AFTER CHECKOUT) */
  const refreshPlan = async () => {
    await queryClient.invalidateQueries({ queryKey: ["billing"] })
    await refetch()
  }

  return {
    plan,
    status,
    loading: isLoading,
    error: isError,
    refreshPlan,
  }
}
