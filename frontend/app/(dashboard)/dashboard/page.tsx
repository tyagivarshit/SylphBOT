"use client";

import { useDashboard } from "@/hooks/useDashboard";
import FeatureGate from "@/components/FeatureGate";

import StatCard from "@/components/cards/StatCard";
import UsageProgress from "@/components/cards/UsageProgress";
import LeadsTable from "@/components/leads/LeadsTable";
import LeadsChart from "@/components/charts/LeadsCharts";
import QuickActions from "@/components/dashboard/QuickActions";

import {
  Users,
  Zap,
  BarChart3,
  TrendingUp,
} from "lucide-react";

export default function DashboardPage() {

  const { stats, leads, loading } = useDashboard();

  /* ================================
  💣 FINAL LOADING FIX
  ================================ */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  /* ================================
  🔥 SAFE DATA
  ================================ */

  const chart = Array.isArray(stats?.chartData) ? stats.chartData : [];
  const messagesChart = Array.isArray(stats?.messagesChart)
    ? stats.messagesChart
    : [];

  return (
    <div className="space-y-8 p-6">

      {/* ===== STATS ===== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        <StatCard
          title="Total Leads"
          value={stats?.totalLeads ?? 0}
          icon={<Users size={18} />}
        />

        <StatCard
          title="Leads Today"
          value={stats?.leadsToday ?? 0}
          icon={<BarChart3 size={18} />}
        />

        <StatCard
          title="Messages Today"
          value={stats?.messagesToday ?? 0}
          icon={<TrendingUp size={18} />}
        />

        <StatCard
          title="AI Messages Sent"
          value={stats?.aiCallsUsed ?? 0}
          icon={<Zap size={18} />}
        />

      </div>

      {/* ===== CHARTS ===== */}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">
            Leads Growth
          </h3>
          <LeadsChart data={chart} />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">
            Messages Growth
          </h3>
          <LeadsChart
            data={messagesChart.map((d: any) => ({
              date: d.date,
              leads: d.messages,
            }))}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">
            AI Usage
          </h3>
          <UsageProgress
            used={stats?.aiCallsUsed ?? 0}
            limit={stats?.aiCallsLimit ?? 1}
          />
        </div>

      </div>

      {/* ===== QUICK ACTIONS ===== */}

      <QuickActions />

      {/* ===== LEADS ===== */}

      <FeatureGate feature="CRM">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

          <h3 className="text-sm font-semibold mb-4">
            Recent Leads
          </h3>

          <LeadsTable leads={leads} />

        </div>
      </FeatureGate>

    </div>
  );
}