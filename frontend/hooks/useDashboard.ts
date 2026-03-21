"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getDashboardStats,
  getRecentLeads,
} from "@/lib/dashboard.api";

export function useDashboard() {

  /* ================================
  🔥 STATS
  ================================ */

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await getDashboardStats();
      console.log("📊 STATS:", res);
      return res;
    },
    retry: 1,
    refetchOnWindowFocus: false,
  });

  /* ================================
  🔥 LEADS
  ================================ */

  const leadsQuery = useQuery({
    queryKey: ["dashboard-leads"],
    queryFn: async () => {
      const res = await getRecentLeads();
      console.log("👥 LEADS:", res);
      return res;
    },
    retry: 1,
    refetchOnWindowFocus: false,
  });

  /* ================================
  💣 FINAL LOADING (STABLE)
  ================================ */

  const loading =
    statsQuery.isPending ||
    leadsQuery.isPending;

  /* ================================
  💣 ERROR (FIXED)
  ================================ */

  const error =
    statsQuery.error ||
    leadsQuery.error;

  /* ================================
  🔥 HANDLE UNAUTHORIZED (CRITICAL)
  ================================ */

  if (error && (error as any)?.message === "UNAUTHORIZED") {
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  }

  /* ================================
  🔥 DATA (SAFE DEFAULTS)
  ================================ */

  const stats = statsQuery.data ?? {};
  const leads = leadsQuery.data ?? [];

  /* ================================
  🔍 DEBUG
  ================================ */

  console.log("🔥 DASHBOARD:", {
    statsStatus: statsQuery.status,
    leadsStatus: leadsQuery.status,
    stats,
    leads,
    loading,
    error,
  });

  return {
    stats,
    leads,
    loading,
    error,
    refetch: () => {
      statsQuery.refetch();
      leadsQuery.refetch();
    },
  };
}