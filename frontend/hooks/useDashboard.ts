"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import {
  getDashboardStats,
  getRecentLeads,
} from "@/lib/dashboard.api";

/* ======================================
DEFAULT SAFE DATA
====================================== */

const DEFAULT_STATS = {
  totalLeads: 0,
  leadsToday: 0,
  leadsThisMonth: 0,
  messagesToday: 0,

  aiCallsUsed: 0,
  aiCallsLimit: 0,
  usagePercent: 0,
  nearLimit: false,
  isUnlimited: false,

  plan: "FREE",

  chartData: [],
  messagesChart: [],
  recentActivity: [],
};

/* ======================================
HOOK (FINAL NO-ERROR VERSION)
====================================== */

export function useDashboard() {
  const { user } = useAuth();

  /* ================= STATS ================= */

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats", user?.businessId],
    queryFn: getDashboardStats,
    enabled: !!user?.businessId, // ✅ FIXED
  });

  /* ================= LEADS ================= */

  const leadsQuery = useQuery({
    queryKey: ["dashboard-leads", user?.businessId],
    queryFn: () => getRecentLeads(), 
    enabled: !!user?.businessId, // ✅ FIXED
  });

  const statsRes: any = statsQuery.data;
  const leadsRes: any = leadsQuery.data;

  /* ======================================
  SAFE EXTRACTION (ZERO TS ERRORS)
  ====================================== */

  const stats =
    statsRes?.success && statsRes?.data
      ? statsRes.data
      : DEFAULT_STATS;

  const leads =
    leadsRes?.success && leadsRes?.data?.leads
      ? leadsRes.data.leads
      : [];

  /* ======================================
  FINAL RETURN
  ====================================== */

  return {
    stats,
    leads,

    loading: statsQuery.isLoading || leadsQuery.isLoading,

    error:
      statsQuery.isError || leadsQuery.isError
        ? "Failed to load dashboard"
        : null,

    limited: statsRes?.limited ?? false,
    upgradeRequired: statsRes?.upgradeRequired ?? false,
  };
}