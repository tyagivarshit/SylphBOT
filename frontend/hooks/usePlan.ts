"use client"

import { useQuery } from "@tanstack/react-query"

const fetchBilling = async () => {
  const res = await fetch("/api/billing", {
    credentials: "include",
  })

  if (!res.ok) throw new Error("Failed")

  return res.json()
}

export function usePlan() {

  const { data, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: fetchBilling,

    /* 🔥 BONUS ADD HERE */
    staleTime: 1000 * 60 * 5, // 5 min cache
    refetchOnWindowFocus: false, // ❌ tab switch pe API call band
    retry: 1
  })

  return {
    plan: data?.subscription?.plan?.type || "BASIC",
    status: data?.subscription?.status || "INACTIVE",
    loading: isLoading,
  }
}