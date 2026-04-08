"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { buildApiUrl } from "@/lib/userApi"

/* ================= FETCH ================= */

const fetchBilling = async () => {
  const res = await fetch(buildApiUrl("/api/billing"), {
    credentials: "include",
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error("Failed to fetch billing")
  }

  return res.json()
}

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
  const plan =
    data?.billing?.planKey ||
    data?.subscription?.plan?.type ||
    "FREE_LOCKED"
  const status =
    data?.billing?.status ||
    data?.subscription?.status ||
    "INACTIVE"

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
