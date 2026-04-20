"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LeadsChart from "@/components/charts/LeadsCharts";
import axios from "axios";
import { buildApiUrl } from "@/lib/url";
import UsageOverview from "@/components/dashboard/UsageOverview";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

type DashboardValue = number | string;

type ActivityItem = {
  id: string;
  text: string;
  time: string;
};

type ChartPoint = {
  date: string;
  leads: number;
};

type DashboardStats = {
  totalLeads: DashboardValue;
  leadsToday: DashboardValue;
  leadsThisMonth: DashboardValue;
  messagesToday: DashboardValue;
  qualifiedLeads: DashboardValue;
  plan: DashboardValue;
  usagePercent: number;
  aiCallsUsed: DashboardValue;
  aiCallsRemaining?: DashboardValue;
  isUnlimited: boolean;
  aiCallsLimit: DashboardValue;
  nearLimit?: boolean;
  warning?: boolean;
  warningMessage?: string | null;
  chartData: ChartPoint[];
  recentActivity: ActivityItem[];
};

type ConversationStats = {
  active: DashboardValue;
  waitingReplies: DashboardValue;
  resolved: DashboardValue;
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [convo, setConvo] = useState<ConversationStats | null>(null);
  const [limited, setLimited] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [statsRes, convoRes] = await Promise.all([
          axios.get(buildApiUrl("/dashboard/stats"), {
            withCredentials: true,
          }),
          axios.get(buildApiUrl("/dashboard/active-conversations"), {
            withCredentials: true,
          }),
        ]);

        setStats(statsRes.data.data);
        setConvo(convoRes.data.data);

        if (statsRes.data.limited || convoRes.data.limited) {
          setLimited(true);
        }
      } catch (err) {
        console.error("Dashboard error", err);
      }
    };

    void fetchData();
  }, [user]);

  if (loading || !stats) {
    return (
      <div className="brand-panel overflow-hidden rounded-[26px] p-6 text-sm text-slate-500">
        Loading dashboard...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const usagePercent = Math.min(Math.round(stats.usagePercent * 100), 100);

  return (
    <div className="relative min-w-0 space-y-6">
      {limited ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-[32px] bg-white/80 backdrop-blur">
          <div className="brand-panel-strong rounded-[28px] p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-900">
              Upgrade Required
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              You have reached your plan limit.
            </p>
            <button className="mt-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg">
              Upgrade Plan
            </button>
          </div>
        </div>
      ) : null}

      <OnboardingFlow />

      <UsageOverview />

      <div className="space-y-3.5 md:hidden">
        <div className="grid grid-cols-2 gap-2.5">
          <MiniCard title="Leads" value={stats.totalLeads} />
          <MiniCard title="Today" value={stats.leadsToday} />
          <MiniCard title="Month" value={stats.leadsThisMonth} />
          <MiniCard title="Msgs" value={stats.messagesToday} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 backdrop-blur-xl">
          <p className="text-xs font-medium text-gray-500">AI Usage</p>
          <h2 className="break-words text-base font-bold text-gray-900">
            {stats.aiCallsUsed} / {stats.isUnlimited ? "∞" : stats.aiCallsLimit}
          </h2>
          <p className="mt-2 text-xs text-gray-500">
            Remaining today: {stats.aiCallsRemaining ?? 0}
          </p>

          <div className="mt-3 h-2 w-full rounded-full bg-blue-50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        {convo ? (
          <div className="grid grid-cols-3 gap-2.5">
            <MiniCard title="Active" value={convo.active} />
            <MiniCard title="Waiting" value={convo.waitingReplies} />
            <MiniCard title="Done" value={convo.resolved} />
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-3 backdrop-blur-xl">
          <LeadsChart data={stats.chartData} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 backdrop-blur-xl">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Activity</h2>

          {stats.recentActivity.map((item) => (
            <div
              key={item.id}
              className="min-w-0 border-b border-blue-100 py-2 last:border-none"
            >
              <p className="break-words text-xs leading-5 text-gray-900">
                {item.text}
              </p>
              <span className="text-[10px] text-gray-500">
                {new Date(item.time).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden space-y-8 md:block">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Card title="Total Leads" value={stats.totalLeads} />
          <Card title="Today" value={stats.leadsToday} />
          <Card title="This Month" value={stats.leadsThisMonth} />
          <Card title="Messages" value={stats.messagesToday} />
          <Card title="Qualified" value={stats.qualifiedLeads} />
          <Card title="Plan" value={stats.plan} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
            <h2 className="mb-4 font-semibold text-gray-900">Leads Growth</h2>
            <LeadsChart data={stats.chartData} />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
            <p className="text-sm font-medium text-gray-500">AI Usage</p>
            <h2 className="text-2xl font-bold text-gray-900">
              {stats.aiCallsUsed} / {stats.isUnlimited ? "∞" : stats.aiCallsLimit}
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              Remaining today: {stats.aiCallsRemaining ?? 0}
            </p>

            <div className="mt-3 h-2 w-full rounded-full bg-blue-50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            {stats.warning ? (
              <p className="mt-3 inline-block rounded-md bg-red-100 px-2 py-1 text-xs text-red-600">
                {stats.warningMessage || "You have used 80% of your daily AI limit."}
              </p>
            ) : null}
          </div>
        </div>

        {convo ? (
          <div className="grid grid-cols-3 gap-4">
            <Card title="Active" value={convo.active} />
            <Card title="Waiting Replies" value={convo.waitingReplies} />
            <Card title="Resolved" value={convo.resolved} />
          </div>
        ) : null}

        <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
          <h2 className="mb-4 font-semibold text-gray-900">Recent Activity</h2>

          {stats.recentActivity.map((item) => (
            <div
              key={item.id}
              className="flex min-w-0 justify-between gap-4 border-b border-blue-100 py-3 last:border-none"
            >
              <p className="min-w-0 break-words text-sm text-gray-900">
                {item.text}
              </p>
              <span className="shrink-0 text-sm text-gray-500">
                {new Date(item.time).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: DashboardValue }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm transition hover:shadow-md">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <h2 className="mt-1 break-words text-xl font-semibold text-gray-900">
        {value}
      </h2>
    </div>
  );
}

function MiniCard({ title, value }: { title: string; value: DashboardValue }) {
  return (
    <div className="overflow-hidden rounded-xl border border-blue-100 bg-white/80 p-3 shadow-sm">
      <p className="text-[10px] font-medium text-gray-500">{title}</p>
      <h2 className="break-words text-sm font-semibold text-gray-900">
        {value}
      </h2>
    </div>
  );
}
