"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import axios from "axios";
import LeadsChart from "@/components/charts/LeadsCharts";
import UsageOverview from "@/components/dashboard/UsageOverview";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { buildApiUrl } from "@/lib/url";
import { useUpgrade } from "@/app/(dashboard)/layout";
import {
  EmptyState,
  RetryState,
  SkeletonCard,
  TrustSignals,
} from "@/components/ui/feedback";

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
  const { openUpgrade } = useUpgrade();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [convo, setConvo] = useState<ConversationStats | null>(null);
  const [limited, setLimited] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  const loadDashboard = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setPageLoading(true);
      setError("");

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
      setLimited(Boolean(statsRes.data.limited || convoRes.data.limited));
    } catch (dashboardError) {
      console.error("Dashboard error", dashboardError);
      setError("We couldn't load your dashboard right now.");
    } finally {
      setPageLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading || pageLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <RetryState
        title="Dashboard unavailable"
        description={error}
        onRetry={() => void loadDashboard()}
      />
    );
  }

  if (!user || !stats) {
    return null;
  }

  const usagePercent = Math.min(Math.round(stats.usagePercent * 100), 100);

  return (
    <div className="relative min-w-0 space-y-6">
      {limited ? (
        <div className="brand-section-shell rounded-[28px] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                Usage limit reached
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                You've used all your AI replies for today
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Buy extra credits to keep responding now, or upgrade for a larger allowance before the next wave of conversations lands.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  openUpgrade({
                    variant: "usage_limit",
                    remainingCredits: 0,
                    title: "You've used all your AI replies for today",
                    description:
                      "Buy extra credits to keep responding now, or upgrade for a larger allowance before the next wave of conversations lands.",
                  })
                }
                className="brand-button-primary"
              >
                <Sparkles size={15} />
                Upgrade Options
              </button>

              <button
                type="button"
                onClick={() => router.push("/billing")}
                className="brand-button-secondary"
              >
                Buy Credits
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <OnboardingFlow />

      <div className="brand-section-shell rounded-[28px] p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Growth workflow
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Smooth, visible, and ready to convert
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Connect Instagram, launch automation, and keep AI replies running without guessing where usage or conversations stand.
            </p>
          </div>

          <TrustSignals />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
            Connect Instagram
          </span>
          <ArrowRight size={14} className="text-slate-400" />
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Create automation
          </span>
          <ArrowRight size={14} className="text-slate-400" />
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            Start replies
          </span>
        </div>
      </div>

      <UsageOverview />

      <div className="space-y-3.5 md:hidden">
        <div className="grid grid-cols-2 gap-2.5">
          <MiniCard title="Leads" value={stats.totalLeads} />
          <MiniCard title="Today" value={stats.leadsToday} />
          <MiniCard title="Month" value={stats.leadsThisMonth} />
          <MiniCard title="Messages" value={stats.messagesToday} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 backdrop-blur-xl">
          <p className="text-xs font-medium text-gray-500">AI reply usage</p>
          <h2 className="break-words text-base font-bold text-gray-900">
            {stats.aiCallsUsed} / {stats.isUnlimited ? "Unlimited" : stats.aiCallsLimit}
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
            <MiniCard title="Resolved" value={convo.resolved} />
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-3 backdrop-blur-xl">
          <LeadsChart data={stats.chartData} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 backdrop-blur-xl">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Activity</h2>

          {stats.recentActivity.length ? (
            stats.recentActivity.map((item) => (
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
            ))
          ) : (
            <EmptyState
              title="No recent activity yet"
              description="Live replies, automation triggers, and new leads will appear here as your workspace starts converting."
            />
          )}
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
            <h2 className="mb-4 font-semibold text-gray-900">Leads growth</h2>
            <LeadsChart data={stats.chartData} />
          </div>

          <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
            <p className="text-sm font-medium text-gray-500">AI reply usage</p>
            <h2 className="text-2xl font-bold text-gray-900">
              {stats.aiCallsUsed} / {stats.isUnlimited ? "Unlimited" : stats.aiCallsLimit}
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
              <p className="mt-3 inline-block rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-700">
                {stats.warningMessage || "You're close to today's AI reply limit"}
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
          <h2 className="mb-4 font-semibold text-gray-900">Recent activity</h2>

          {stats.recentActivity.length ? (
            stats.recentActivity.map((item) => (
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
            ))
          ) : (
            <EmptyState
              title="No recent activity yet"
              description="Replies, lead captures, and automation wins will start showing here as soon as your workspace goes live."
            />
          )}
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-32" />
      <SkeletonCard className="h-48" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonCard className="h-80 lg:col-span-2" />
        <SkeletonCard className="h-80" />
      </div>
      <SkeletonCard className="h-72" />
    </div>
  );
}
