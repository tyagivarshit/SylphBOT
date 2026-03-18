"use client"

import { useQuery } from "@tanstack/react-query"
import { getDashboardStats, getRecentLeads } from "@/lib/dashboard"

export function useDashboard(){

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => getDashboardStats() // ✅ FIX
  })

  const leadsQuery = useQuery({
    queryKey: ["dashboard-leads"],
    queryFn: () => getRecentLeads() // ✅ FIX
  })

  return {
    stats: statsQuery.data?.data || {},
    leads: leadsQuery.data?.data || [],
    loading: statsQuery.isLoading || leadsQuery.isLoading
  }
}