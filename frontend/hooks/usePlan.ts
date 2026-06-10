"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/apiClient"
import { normalizePlan } from "@/lib/featureGuard"
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry"

const BILLING_FETCH_TIMEOUT_MS = 7_000;
const BILLING_POLL_ACTIVE_MS = 75_000;
const BILLING_POLL_IDLE_MS = 120_000;
const BILLING_POLL_MAX_BACKOFF_MS = 300_000;

const getBillingPollIntervalMs = (query: unknown) => {
  const safeQuery =
    query && typeof query === "object"
      ? (query as {
          state?: {
            fetchFailureCount?: unknown
            data?: {
              billing?: { status?: unknown }
              subscription?: { status?: unknown }
            }
          }
        })
      : null;
  const fetchFailureCount = Number(safeQuery?.state?.fetchFailureCount || 0);

  if (fetchFailureCount > 0) {
    const delayMs = Math.min(
      BILLING_POLL_MAX_BACKOFF_MS,
      45_000 * 2 ** Math.min(fetchFailureCount - 1, 3) +
        Math.floor(Math.random() * 400)
    );

    recordLifecycleEvent("polling_backoff_applied", {
      area: "billing_plan",
      fetchFailureCount,
      delayMs,
    });

    return delayMs;
  }

  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return BILLING_POLL_IDLE_MS;
  }

  const billingStatus = String(
    safeQuery?.state?.data?.billing?.status ||
      safeQuery?.state?.data?.subscription?.status ||
      ""
  )
    .trim()
    .toUpperCase();

  if (billingStatus === "ACTIVE" || billingStatus === "TRIAL" || billingStatus === "TRIALING") {
    return BILLING_POLL_ACTIVE_MS;
  }

  return BILLING_POLL_IDLE_MS;
};

/* ================= FETCH ================= */

export const fetchBillingPlanState = async () => {
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
  }>("/api/billing?surface=billing", {
    credentials: "include",
    cache: "no-store",
    timeoutMs: BILLING_FETCH_TIMEOUT_MS,
  });

  if (!response.success || !response.data) {
    throw new Error(response.message || "Failed to fetch billing");
  }

  return response.data;
};

/* ================= HOOK ================= */

export function usePlan() {

  const queryClient = useQueryClient()

  const [mounted, setMounted] = useState(false)
  const [localPlan, setLocalPlan] = useState<string | null>(null)
  const [localStatus, setLocalStatus] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      const savedPlan = localStorage.getItem("lkv-billing-plan")
      const savedStatus = localStorage.getItem("lkv-billing-status")
      if (savedPlan) setLocalPlan(savedPlan)
      if (savedStatus) setLocalStatus(savedStatus)
    }
  }, [])

  const {
    data,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["billing-plan"],
    queryFn: fetchBillingPlanState,

    staleTime: 1000 * 20,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => getBillingPollIntervalMs(query),
    refetchIntervalInBackground: false,
    retry: 1,
  })

  /* 🔥 SAFE FALLBACK */
  const rawStatus =
    data?.billing?.status ||
    data?.subscription?.status ||
    "INACTIVE"
  const billingPlan = normalizePlan(data?.billing?.planKey)
  const subscriptionPlan = normalizePlan(
    data?.subscription?.plan?.type ||
    data?.subscription?.plan?.name
  )
  const resolvedPlan =
    (rawStatus === "ACTIVE" || rawStatus === "TRIAL") &&
    billingPlan === "FREE_LOCKED"
      ? subscriptionPlan
      : billingPlan

  // Persist resolved values when data changes
  useEffect(() => {
    if (data && resolvedPlan) {
      localStorage.setItem("lkv-billing-plan", resolvedPlan)
      localStorage.setItem("lkv-billing-status", rawStatus)
      setLocalPlan(resolvedPlan)
      setLocalStatus(rawStatus)
    }
  }, [data, resolvedPlan, rawStatus])

  // Determine final plan and status
  const plan = data
    ? resolvedPlan
    : mounted && localPlan
    ? localPlan
    : "FREE_LOCKED"

  const status = data
    ? rawStatus
    : mounted && localStatus
    ? localStatus
    : "INACTIVE"

  const loading = isLoading && (!mounted || !localPlan)

  /* 🔥 FORCE REFRESH (AFTER CHECKOUT) */
  const refreshPlan = async () => {
    await queryClient.invalidateQueries({ queryKey: ["billing-plan"] })
    await refetch()
  }

  return {
    plan,
    status,
    loading,
    error: isError,
    refreshPlan,
  }
}
