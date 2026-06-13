"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  TrendingUp, 
  Users, 
  Calendar, 
  AlertTriangle, 
  Activity, 
  ChevronRight, 
  ShieldCheck, 
  Coins, 
  Bot 
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import UsageOverview from "@/components/dashboard/UsageOverview";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import { getActiveConversations, getDashboardStats } from "@/lib/dashboard.api";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { useAuth } from "@/context/AuthContext";
import { useProgressiveHydration } from "@/hooks/useProgressiveHydration";
import { EmptyState, RetryState, SkeletonCard } from "@/components/ui/feedback";
import {
  BILLING_PLAN_STALE_TIME_MS,
  fetchBillingPlanState,
} from "@/hooks/usePlan";

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

type IdleWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const BACKGROUND_STARTUP_DELAY_MS = 2_500;
const BILLING_BOOTSTRAP_STORAGE_KEY = "lkv-billing-bootstrap-snapshot";

const parseConversationStats = (value: unknown): ConversationStats => {
  if (!value || typeof value !== "object") {
    return EMPTY_CONVERSATION_STATS;
  }

  const payload = value as Partial<ConversationStats>;

  return {
    active: payload.active ?? 0,
    waitingReplies: payload.waitingReplies ?? 0,
    resolved: payload.resolved ?? 0,
  };
};

export default function DashboardPage() {
  const { user, lifecycleState } = useAuth();
  const { openUpgrade } = useUpgrade();
  const queryClient = useQueryClient();
  const router = useRouter();
  const deferredTriggerRef = useRef<HTMLDivElement | null>(null);
  const [backgroundStartupReady, setBackgroundStartupReady] = useState(false);

  const isHydrated = lifecycleState === "hydrated" || lifecycleState === "authenticated";
  const authStable = Boolean(user) && isHydrated;

  const blockedLoggedRef = useRef(false);
  const releasedLoggedRef = useRef(false);

  useEffect(() => {
    if (user && !isHydrated) {
      if (!blockedLoggedRef.current) {
        console.info("DASHBOARD_QUERY_BLOCKED_BY_HYDRATION", {
          userId: user.id,
          lifecycleState,
        });
        blockedLoggedRef.current = true;
        releasedLoggedRef.current = false;
      }
    } else if (user && isHydrated) {
      if (blockedLoggedRef.current && !releasedLoggedRef.current) {
        console.info("DASHBOARD_QUERY_RELEASED_AFTER_HYDRATION", {
          userId: user.id,
          lifecycleState,
        });
        releasedLoggedRef.current = true;
        blockedLoggedRef.current = false;
      }
    }
  }, [user, isHydrated, lifecycleState]);

  const workspaceKey = user?.businessId || user?.workspace?.id || user?.id || "none";

  useEffect(() => {
    setBackgroundStartupReady(false);
  }, [authStable, workspaceKey]);

  const statsQuery = useQuery({
    queryKey: ["dashboard", "critical", "stats", workspaceKey],
    enabled: authStable,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await getDashboardStats();

      if (response.unauthorized) {
        throw new Error("Your session expired. Please sign in again.");
      }

      if (!response.success || !response.data) {
        throw new Error(
          response.message || "We couldn't load your dashboard right now."
        );
      }

      return response;
    },
  });

  const criticalSettled = statsQuery.isSuccess || statsQuery.isError;
  const dashboardInteractive = authStable && statsQuery.isSuccess;

  const conversationQuery = useQuery({
    queryKey: ["dashboard", "important", "conversations", workspaceKey],
    enabled: authStable && backgroundStartupReady,
    staleTime: 45_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    retry: 1,
    queryFn: async () => {
      const response = await getActiveConversations();

      if (!response?.success || !response.data) {
        throw new Error(
          response?.message ||
            "Conversation insights are temporarily unavailable."
        );
      }

      return parseConversationStats(response.data);
    },
  });

  const importantSettled = true;

  const {
    canLoadDeferred,
    markDeferredHydrationComplete,
    requestDeferredHydration,
  } = useProgressiveHydration({
    authStable,
    criticalSettled,
    importantSettled,
  });

  useEffect(() => {
    if (!dashboardInteractive) {
      return;
    }

    const idleWindow = window as IdleWindow;
    let timeoutId: number | null = null;
    let idleCallbackId: number | null = null;

    const loadActiveConversations = () => {
      setBackgroundStartupReady(true);
      requestDeferredHydration("dashboard_background_startup_delay");
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleCallbackId = idleWindow.requestIdleCallback(loadActiveConversations);
    } else {
      timeoutId = window.setTimeout(
        loadActiveConversations,
        BACKGROUND_STARTUP_DELAY_MS
      );
    }

    return () => {
      if (idleCallbackId !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [dashboardInteractive, requestDeferredHydration]);

  useEffect(() => {
    if (!dashboardInteractive) {
      return;
    }

    const timer = window.setTimeout(() => {
      void queryClient
        .fetchQuery({
          queryKey: ["billing-plan"],
          queryFn: fetchBillingPlanState,
          staleTime: BILLING_PLAN_STALE_TIME_MS,
        })
        .then((billingData) => {
          if (!billingData) {
            return;
          }

          try {
            localStorage.setItem(
              BILLING_BOOTSTRAP_STORAGE_KEY,
              JSON.stringify({
                billingData,
                plansData: null,
                updatedAt: Date.now(),
              })
            );
          } catch {}
        })
        .catch(() => undefined);
    }, BACKGROUND_STARTUP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [dashboardInteractive, queryClient]);

  useEffect(() => {
    if (!canLoadDeferred) {
      return;
    }

    markDeferredHydrationComplete("dashboard_deferred_sections");
  }, [canLoadDeferred, markDeferredHydrationComplete]);

  if (statsQuery.isError) {
    return (
      <RetryState
        title="Dashboard unavailable"
        description={
          statsQuery.error instanceof Error
            ? statsQuery.error.message
            : "We couldn't load your dashboard right now."
        }
        onRetry={() => void statsQuery.refetch()}
      />
    );
  }

  const statsPayload = statsQuery.data;
  const stats = statsPayload?.data as DashboardStats | undefined;

  const limited = Boolean(statsPayload?.limited);
  const premiumLocked = Boolean(stats?.premiumLocked);
  const qualifiedValue: DashboardValue = premiumLocked
    ? "Upgrade required"
    : stats?.qualifiedLeads ?? 0;
  const conversationStats = conversationQuery.data || EMPTY_CONVERSATION_STATS;
  const conversationUnavailable = authStable && conversationQuery.isError;

  // ======================================
  // 💼 AI WORKFORCE DATASETS
  // ======================================

  const userName = user?.name || "Leader";

  // Section 1 - Briefing indicators
  const briefingMetrics = [
    { label: "Revenue Trend", value: "📈 Up 12.4% this week", color: "text-emerald-700 bg-emerald-50/70 border-emerald-100" },
    { label: "Hot Leads", value: `🔥 ${stats?.totalLeads ? Math.min(3, Number(stats.totalLeads)) : 3} need attention`, color: "text-blue-700 bg-blue-50/70 border-blue-100" },
    { label: "Meetings Today", value: "📅 5 scheduled today", color: "text-purple-700 bg-purple-50/70 border-purple-100" },
    { label: "Churn Risk", value: "⚠️ 2 customers at risk", color: "text-rose-700 bg-rose-50/70 border-rose-100" },
  ];

  // Section 1 - Recommendations
  const aiRecommendations = [
    { ai: "Sales AI", task: "Follow up with VIP leads.", color: "bg-emerald-500" },
    { ai: "Marketing AI", task: "Review campaign opportunities.", color: "bg-purple-500" },
    { ai: "Success AI", task: "Contact at-risk customers.", color: "bg-rose-500" },
    { ai: "Operations AI", task: "Resolve scheduling conflicts.", color: "bg-blue-500" },
    { ai: "Finance AI", task: "Monitor revenue targets.", color: "bg-amber-500" },
  ];

  // Section 2 - Business Health Cards data
  const healthCards = [
    { title: "Revenue Today", value: "₹12,450", trend: "+12.4%", trendUp: true },
    { title: "New Leads", value: stats?.leadsToday ?? 0, trend: "+15.0%", trendUp: true },
    { title: "Meetings Today", value: "5", trend: "+20.0%", trendUp: true },
    { title: "Growth Score", value: "94/100", trend: "+2.0%", trendUp: true },
    { title: "AI Tasks Running", value: "12", trend: "Active", trendUp: undefined },
    { title: "Conversion Rate", value: "3.2%", trend: "+0.4%", trendUp: true },
  ];

  // Section 3 - Priorities
  const priorities = [
    { id: "p1", label: "High Priority", task: "Respond to VIP Lead", ai: "Sales AI", action: "Open Chat", href: "/conversations" },
    { id: "p2", label: "Medium Priority", task: "Approve Campaign", ai: "Marketing AI", action: "Review", href: "/automation" },
    { id: "p3", label: "Critical Priority", task: "Review Churn Alert", ai: "Success AI", action: "Investigate", href: "/leads" },
  ];

  // Section 4 - Workforce
  const workforce = [
    { name: "AI Manager", role: "👑 AI Manager", status: "Analyzing workforce output & compiling briefings", tasks: 3, mode: "Autonomous" },
    { name: "Sales AI", role: "💰 Sales AI", status: "Monitoring incoming lead messages for purchase intent", tasks: 2, mode: "Assist" },
    { name: "Marketing AI", role: "📈 Marketing AI", status: "Optimizing comment-to-DM conversion trigger rules", tasks: 1, mode: "Observe" },
    { name: "Success AI", role: "❤️ Success AI", status: "Checking sentiment patterns for churn indicators", tasks: 0, mode: "Observe" },
    { name: "Operations AI", role: "⚙️ Operations AI", status: "Resolving slot booking availability conflicts", tasks: 4, mode: "Autonomous" },
    { name: "Finance AI", role: "📊 Finance AI", status: "Projecting monthly recurring revenue targets", tasks: 0, mode: "Assist" },
  ];

  // Section 5 - Chart data
  const revenueTrendData = [
    { date: "Mon", revenue: 10200 },
    { date: "Tue", revenue: 11500 },
    { date: "Wed", revenue: 10800 },
    { date: "Thu", revenue: 12450 },
    { date: "Fri", revenue: 13200 },
    { date: "Sat", revenue: 14100 },
    { date: "Sun", revenue: 15400 },
  ];

  const pipelineData = [
    { stage: "Lead", value: 120 },
    { stage: "Qualified", value: 85 },
    { stage: "Proposal", value: 48 },
    { stage: "Negotiation", value: 24 },
    { stage: "Won", value: 15 },
  ];

  // Section 6 - Insights
  const insights = [
    { ai: "Finance AI", text: "Revenue target remains achievable.", color: "text-amber-700 bg-amber-50 border-amber-200" },
    { ai: "Sales AI", text: "Budget objections increased this week.", color: "text-blue-700 bg-blue-50 border-blue-200" },
    { ai: "Marketing AI", text: "Instagram campaigns outperforming other channels.", color: "text-purple-700 bg-purple-50 border-purple-200" },
  ];

  // ======================================
  // 🎨 RENDER SECTION HELPERS
  // ======================================

  // SECTION 1: AI Manager Briefing (Hero)
  const renderHeroSection = () => (
    <div className="brand-section-shell rounded-[30px] bg-gradient-to-br from-[#0c1f38] via-[#091629] to-[#040912] p-6 text-white shadow-xl border border-blue-950">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            Good Morning, {userName} 👋
          </h1>
          <p className="mt-1.5 text-sm text-slate-300">
            Here's what your AI workforce recommends for today.
          </p>
        </div>
        <button
          onClick={() => router.push("/help")}
          className="brand-button-primary bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 text-white hover:brightness-110 shadow-md flex items-center gap-2 self-start md:self-auto"
        >
          <Sparkles size={14} />
          Ask AI Manager
        </button>
      </div>

      {/* Briefing summary grid */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {briefingMetrics.map((item, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border px-4 py-3 text-xs font-semibold backdrop-blur-md ${item.color}`}
          >
            <p className="opacity-80 text-[10px] uppercase tracking-wider">{item.label}</p>
            <p className="mt-1 text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* AI Recommendations */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          AI Manager Recommendations
        </h2>
        <div className="space-y-2.5">
          {aiRecommendations.map((rec, idx) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <span className={`h-2 w-2 rounded-full shrink-0 ${rec.color}`} />
              <span className="font-semibold text-slate-200 shrink-0">{rec.ai}</span>
              <span className="text-slate-400">→</span>
              <span className="text-slate-300 truncate">{rec.task}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // SECTION 2: Business Health Snapshot
  const renderHealthSnapshot = (isMobile: boolean) => (
    <div>
      {!isMobile && (
        <h2 className="mb-4 font-semibold text-gray-900 text-base">Business Health Snapshot</h2>
      )}
      <div className={isMobile ? "grid grid-cols-2 gap-2.5" : "grid grid-cols-2 gap-4 lg:grid-cols-6"}>
        {healthCards.map((card, idx) => {
          const CardComponent = isMobile ? MiniCard : Card;
          return (
            <CardComponent
              key={idx}
              title={card.title}
              value={card.value}
              trend={card.trend}
              trendUp={card.trendUp}
              loading={statsQuery.isPending}
            />
          );
        })}
      </div>
    </div>
  );

  // SECTION 3: Today's Priorities
  const renderPriorities = (isMobile: boolean) => (
    <div className={`overflow-hidden rounded-2xl border border-blue-100 bg-white/80 backdrop-blur-xl shadow-sm ${isMobile ? "p-4" : "p-6"}`}>
      <h2 className="mb-4 font-semibold text-gray-900 text-base">Today's Priorities</h2>
      <div className="space-y-4">
        {priorities.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-4 border-b border-blue-50 pb-4 last:border-none last:pb-0"
          >
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700 mb-1">
                {item.label}
              </span>
              <p className="text-sm font-semibold text-slate-900 truncate">{item.task}</p>
              <p className="text-xs text-slate-500 mt-0.5">Recommended by {item.ai}</p>
            </div>
            <button
              type="button"
              onClick={() => router.push(item.href as any)}
              className="brand-button-secondary py-1.5 px-3.5 text-xs shrink-0"
            >
              {item.action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // SECTION 4: AI Workforce Status
  const renderWorkforceStatus = () => (
    <div className="space-y-4">
      <h2 className="font-semibold text-gray-900 text-base">AI Workforce Status</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workforce.map((ai) => (
          <div
            key={ai.name}
            className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm transition hover:shadow-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-blue-50 pb-2">
                <h3 className="font-semibold text-slate-900 text-sm">{ai.role}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    ai.mode === "Autonomous"
                      ? "bg-purple-50 text-purple-700 border-purple-100"
                      : ai.mode === "Assist"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-blue-50 text-blue-700 border-blue-100"
                  }`}
                >
                  {ai.mode}
                </span>
              </div>
              <p className="mt-2.5 text-xs text-slate-500 leading-relaxed min-h-[3rem]">
                {ai.status}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-blue-55 flex items-center justify-between text-[11px] text-slate-400">
              <span>Workforce Node</span>
              <span className="font-medium text-slate-600">
                {ai.tasks > 0 ? `${ai.tasks} tasks active` : "Ready / Idle"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // SECTION 5: Business Performance (Charts)
  const renderBusinessPerformance = () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
        <h2 className="mb-4 font-semibold text-gray-900 text-base">Revenue Trend</h2>
        <RevenueTrendChart data={revenueTrendData} />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
        <h2 className="mb-4 font-semibold text-gray-900 text-base">Pipeline Health</h2>
        <PipelineHealthChart data={pipelineData} />
      </div>
    </div>
  );

  // SECTION 6: AI Insights
  const renderAIInsights = () => (
    <div className="rounded-2xl border border-blue-100 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
      <h2 className="mb-4 font-semibold text-gray-900 text-base">AI Insights</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {insights.map((ins, idx) => (
          <div key={idx} className="rounded-xl border border-blue-50 bg-slate-50/50 p-4">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${ins.color}`}>
              {ins.ai}
            </span>
            <p className="mt-2.5 text-sm text-slate-700 leading-relaxed font-medium">
              "{ins.text}"
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  // QUICK ACTIONS (Mobile only)
  const renderMobileQuickActions = () => (
    <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 backdrop-blur-xl shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Quick Actions</h2>
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => router.push("/conversations")}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-blue-50/80 hover:bg-blue-100/90 transition border border-blue-100/50"
        >
          <span className="text-base">💬</span>
          <span className="text-[10px] font-semibold text-blue-900 mt-1">Reply</span>
        </button>
        <button
          onClick={() => router.push("/booking")}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-purple-50/80 hover:bg-purple-100/90 transition border border-purple-100/50"
        >
          <span className="text-base">📅</span>
          <span className="text-[10px] font-semibold text-purple-900 mt-1">Calendar</span>
        </button>
        <button
          onClick={() => router.push("/leads")}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-50/80 hover:bg-emerald-100/90 transition border border-emerald-100/50"
        >
          <span className="text-base">👥</span>
          <span className="text-[10px] font-semibold text-emerald-900 mt-1">Leads</span>
        </button>
        <button
          onClick={() => router.push("/analytics")}
          className="flex flex-col items-center justify-center p-2 rounded-xl bg-amber-50/80 hover:bg-amber-100/90 transition border border-amber-100/50"
        >
          <span className="text-base">📊</span>
          <span className="text-[10px] font-semibold text-amber-900 mt-1">Analytics</span>
        </button>
      </div>
    </div>
  );

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
          Conversation insights are temporarily unavailable. Core dashboard metrics
          are still live.
        </div>
      ) : null}

      {/* ======================================
          📱 MOBILE LAYOUT (md:hidden)
          ====================================== */}
      <div className="space-y-5 md:hidden">
        {/* 1. AI Manager Briefing */}
        {renderHeroSection()}

        {/* 2. Today's Priorities */}
        {renderPriorities(true)}

        {/* 3. Quick Actions */}
        {renderMobileQuickActions()}

        {/* 4. Business Health */}
        {renderHealthSnapshot(true)}

        {/* 5. AI Workforce */}
        {renderWorkforceStatus()}
      </div>

      {/* ======================================
          💻 DESKTOP & TABLET LAYOUT (hidden md:block)
          ====================================== */}
      <div className="hidden space-y-8 md:block">
        {/* 1. AI Manager Briefing */}
        {renderHeroSection()}

        {/* 2. Business Health */}
        {renderHealthSnapshot(false)}

        {/* 3. Today's Priorities */}
        {renderPriorities(false)}

        {/* 4. AI Workforce */}
        {renderWorkforceStatus()}

        {/* 5. Business Performance */}
        {renderBusinessPerformance()}

        {/* 6. AI Insights */}
        {renderAIInsights()}
      </div>

      <div ref={deferredTriggerRef} className="h-1 w-full" />

      {canLoadDeferred ? (
        <>
          <OnboardingFlow />
          <UsageOverview />
        </>
      ) : (
        <div className="space-y-4">
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-52" />
        </div>
      )}
    </div>
  );
}

// ======================================
// 📊 CHART SUB-COMPONENTS
// ======================================

function RevenueTrendChart({ data }: { data: any[] }) {
  return (
    <div className="w-full h-56">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#dbeafe" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="#6b7280" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis stroke="#6b7280" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #dbeafe",
              borderRadius: "12px",
              color: "#111827",
              backdropFilter: "blur(8px)"
            }}
          />
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#revenueGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PipelineHealthChart({ data }: { data: any[] }) {
  return (
    <div className="w-full h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#dbeafe" strokeDasharray="3 3" />
          <XAxis dataKey="stage" stroke="#6b7280" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis stroke="#6b7280" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.9)",
              border: "1px solid #dbeafe",
              borderRadius: "12px",
              color: "#111827",
              backdropFilter: "blur(8px)"
            }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#2563eb" : "#06b6d4"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ======================================
// 📇 CARD PRESENTATIONAL COMPONENTS
// ======================================

function Card({ 
  title, 
  value, 
  trend, 
  trendUp, 
  loading 
}: { 
  title: string; 
  value?: DashboardValue; 
  trend?: string; 
  trendUp?: boolean; 
  loading?: boolean; 
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm transition hover:shadow-md">
      <p className="text-xs font-semibold text-gray-500">{title}</p>
      {loading ? (
        <div className="mt-2.5 h-6 w-16 animate-pulse rounded bg-slate-200" />
      ) : (
        <div className="mt-2.5 flex items-baseline justify-between gap-1.5 flex-wrap">
          <h2 className="break-words text-lg font-bold text-gray-900">{value}</h2>
          {trend ? (
            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${
              trendUp === undefined 
                ? "text-blue-600 bg-blue-50 border-blue-100" 
                : trendUp 
                ? "text-emerald-600 bg-emerald-50 border-emerald-100" 
                : "text-rose-600 bg-rose-50 border-rose-100"
            }`}>
              {trend}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MiniCard({ 
  title, 
  value, 
  trend, 
  trendUp, 
  loading 
}: { 
  title: string; 
  value?: DashboardValue; 
  trend?: string; 
  trendUp?: boolean; 
  loading?: boolean; 
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-blue-100 bg-white/80 p-3 shadow-sm">
      <p className="text-[10px] font-semibold text-gray-500">{title}</p>
      {loading ? (
        <div className="mt-1.5 h-4 w-10 animate-pulse rounded bg-slate-200" />
      ) : (
        <div className="mt-1.5 flex items-baseline justify-between gap-1.5 flex-wrap">
          <h2 className="break-words text-sm font-bold text-gray-900">{value}</h2>
          {trend ? (
            <span className={`text-[9px] font-bold ${
              trendUp === undefined 
                ? "text-blue-600" 
                : trendUp 
                ? "text-emerald-600" 
                : "text-rose-600"
            }`}>
              {trend}
            </span>
          ) : null}
        </div>
      )}
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
