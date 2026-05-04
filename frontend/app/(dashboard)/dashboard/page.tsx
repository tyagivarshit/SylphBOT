"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import LeadsChart from "@/components/charts/LeadsCharts";
import UsageOverview from "@/components/dashboard/UsageOverview";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { getActiveConversations, getDashboardStats } from "@/lib/dashboard.api";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { EmptyState, RetryState, SkeletonCard } from "@/components/ui/feedback";

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
  chartData: ChartPoint[];
  recentActivity: ActivityItem[];
  premiumLocked?: boolean;
};

type ConversationStats = {
  active: DashboardValue;
  waitingReplies: DashboardValue;
  resolved: DashboardValue;
};

const EMPTY_CONVERSATION_STATS: ConversationStats = {
  active: 0,
  waitingReplies: 0,
  resolved: 0,
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { openUpgrade } = useUpgrade();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [convo, setConvo] = useState<ConversationStats>(EMPTY_CONVERSATION_STATS);
  const [limited, setLimited] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [conversationUnavailable, setConversationUnavailable] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, router, user]);

  const loadDashboard = useCallback(async () => {
    if (!user) {
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);
      setError("");
      setConversationUnavailable(false);

      const [statsResult, convoResult] = await Promise.allSettled([
        getDashboardStats(),
        getActiveConversations(),
      ]);

      if (
        statsResult.status === "fulfilled" &&
        statsResult.value.unauthorized
      ) {
        router.replace("/auth/login");
        return;
      }

      if (statsResult.status !== "fulfilled" || !statsResult.value.success || !statsResult.value.data) {
        throw new Error(
          statsResult.status === "fulfilled"
            ? statsResult.value.message || "We couldn't load your dashboard right now."
            : "We couldn't load your dashboard right now."
        );
      }

      setStats(statsResult.value.data as DashboardStats);
      setLimited(Boolean(statsResult.value.limited));

      if (
        convoResult.status === "fulfilled" &&
        convoResult.value.success &&
        convoResult.value.data
      ) {
        setConvo(convoResult.value.data as ConversationStats);
      } else {
        setConversationUnavailable(true);
        setConvo(EMPTY_CONVERSATION_STATS);
      }
    } catch (dashboardError) {
      console.error("Dashboard error", dashboardError);
      setError("We couldn't load your dashboard right now.");
    } finally {
      setPageLoading(false);
    }
  }, [router, user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading || (pageLoading && Boolean(user))) {
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

  const premiumLocked = Boolean(stats.premiumLocked);
  const qualifiedValue: DashboardValue = premiumLocked
    ? "Upgrade required"
    : stats.qualifiedLeads;

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
                You have used all your AI replies for today
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Buy credits or upgrade to keep replies running.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  openUpgrade({
                    variant: "usage_limit",
                    remainingCredits: 0,
                    title: "You have used all your AI replies for today",
                    description: "Buy credits or upgrade to keep replies running.",
                  })
                }
                className="brand-button-primary"
              >
                <Sparkles size={15} />
                Upgrade options
              </button>

              <button
                type="button"
                onClick={() => router.push("/billing")}
                className="brand-button-secondary"
              >
                Buy credits
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {premiumLocked ? (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Premium dashboard metrics are locked. Upgrade required.
        </div>
      ) : null}

      {conversationUnavailable ? (
        <div className="rounded-[22px] border border-slate-200 bg-white/82 px-4 py-3 text-sm text-slate-600">
          Conversation insights are temporarily unavailable. Core dashboard metrics are still live.
        </div>
      ) : null}

      <OnboardingFlow />
      <UsageOverview />

      <div className="space-y-3.5 md:hidden">
        <div className="grid grid-cols-2 gap-2.5">
          <MiniCard title="Leads" value={stats.totalLeads} />
          <MiniCard title="Today" value={stats.leadsToday} />
          <MiniCard title="Month" value={stats.leadsThisMonth} />
          <MiniCard title="Messages" value={stats.messagesToday} />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <MiniCard title="Active" value={convo.active} />
          <MiniCard title="Waiting" value={convo.waitingReplies} />
          <MiniCard title="Resolved" value={convo.resolved} />
        </div>

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
                <p className="break-words text-xs leading-5 text-gray-900">{item.text}</p>
                <span className="text-[10px] text-gray-500">
                  {new Date(item.time).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="No recent activity yet" description="Activity will appear here." />
          )}
        </div>
      </div>

      <div className="hidden space-y-8 md:block">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Card title="Total Leads" value={stats.totalLeads} />
          <Card title="Today" value={stats.leadsToday} />
          <Card title="This Month" value={stats.leadsThisMonth} />
          <Card title="Messages" value={stats.messagesToday} />
          <Card title="Qualified" value={qualifiedValue} />
          <Card title="Plan" value={stats.plan} />
        </div>

        <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
          <h2 className="mb-4 font-semibold text-gray-900">Leads growth</h2>
          <LeadsChart data={stats.chartData} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card title="Active" value={convo.active} />
          <Card title="Waiting Replies" value={convo.waitingReplies} />
          <Card title="Resolved" value={convo.resolved} />
        </div>

        <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
          <h2 className="mb-4 font-semibold text-gray-900">Recent activity</h2>

          {stats.recentActivity.length ? (
            stats.recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex min-w-0 justify-between gap-4 border-b border-blue-100 py-3 last:border-none"
              >
                <p className="min-w-0 break-words text-sm text-gray-900">{item.text}</p>
                <span className="shrink-0 text-sm text-gray-500">
                  {new Date(item.time).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="No recent activity yet" description="Activity will appear here." />
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
      <h2 className="mt-1 break-words text-xl font-semibold text-gray-900">{value}</h2>
    </div>
  );
}

function MiniCard({ title, value }: { title: string; value: DashboardValue }) {
  return (
    <div className="overflow-hidden rounded-xl border border-blue-100 bg-white/80 p-3 shadow-sm">
      <p className="text-[10px] font-medium text-gray-500">{title}</p>
      <h2 className="break-words text-sm font-semibold text-gray-900">{value}</h2>
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
