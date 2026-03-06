"use client"

import { useEffect, useState } from "react"
import { getDashboardStats, getRecentLeads } from "@/lib/dashboard"
import StatCard from "@/components/cards/StatCard"
import UsageProgress from "@/components/cards/UsageProgress"
import LeadsTable from "@/components/leads/LeadsTable"

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [leads, setLeads] = useState<any[]>([])
  useEffect(() => {
    const loadData = async () => {
      try {
        const statsData = await getDashboardStats()
        const leadsData = await getRecentLeads()
        setStats(statsData)
        setLeads(leadsData?.data || [])
      } catch (error) {
        console.error("Dashboard load error:", error)
      }
    }
    loadData()
  }, [])
  if (!stats) {
    return <p className="text-gray-500">Loading dashboard...</p>
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        <StatCard
          title="Total Leads"
          value={stats?.totalLeads || 0}
        />
        <StatCard
          title="Leads Today"
          value={stats?.leadsToday || 0}
        />
        <StatCard
          title="AI Calls Used"
          value={stats?.aiCallsUsed || 0}
        />
      </div>
      <UsageProgress
        used={stats?.aiCallsUsed || 0}
        limit={stats?.aiCallsLimit || 0}
      />
      <LeadsTable leads={leads} />
    </div>
  )
}