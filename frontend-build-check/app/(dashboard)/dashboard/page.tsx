"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  AlertTriangle, 
  ChevronRight, 
  ChevronLeft,
  ShieldCheck, 
  Coins, 
  Bot,
  Brain,
  MessageCircle,
  Calendar,
  Users,
  Workflow,
  CreditCard,
  Settings,
  Clock,
  Heart,
  Pause,
  AlertCircle,
  CheckCircle2,
  Info,
  HelpCircle,
  Activity
} from "lucide-react";
import { EmptyState, RetryState, SkeletonCard } from "@/components/ui/feedback";
import { getDashboardStats } from "@/lib/dashboard.api";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { useAuth } from "@/context/AuthContext";

type BriefingData = {
  greeting: string;
  summary: string;
  statusIndicator: string;
};

type PriorityItem = {
  id: string;
  level: "Critical" | "High" | "Medium" | string;
  source: string;
  explanation: string;
  action: string;
  href: string;
};

type HumanAlertItem = {
  id: string;
  title: string;
  details: string;
  action: string;
  href: string;
};

type CriticalNotification = {
  id: string;
  timestamp: string;
  type: string;
  module: string;
  message: string;
};

type WorkforceItem = {
  name: string;
  role: string;
  status: "Healthy" | "Busy" | "Needs Attention" | "Paused" | string;
  lastActivity: string;
  focus: string;
  escalations: number;
};

type DashboardStatsResponse = {
  totalLeads: number;
  leadsToday: number;
  leadsThisMonth: number;
  messagesToday: number;
  qualifiedLeads: number;
  aiCallsUsed: number;
  aiCallsLimit: number;
  usagePercent: number;
  nearLimit: boolean;
  isUnlimited: boolean;
  plan: string;
  planKey: string;
  premiumLocked: boolean;
  chartData: any[];
  messagesChart: any[];
  recentActivity: any[];
  
  // V3 custom briefing center payload
  briefing?: BriefingData;
  priorities?: PriorityItem[];
  humanAttentionAlerts?: HumanAlertItem[];
  criticalNotifications?: CriticalNotification[];
  workforceHealth?: WorkforceItem[];
};

export default function DashboardPage() {
  const { user, lifecycleState } = useAuth();
  const { openUpgrade } = useUpgrade();
  const router = useRouter();
  
  const prioritiesRef = useRef<HTMLDivElement | null>(null);
  const workforceRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const isHydrated = (lifecycleState as string) === "hydrated" || lifecycleState === "authenticated";
  const authStable = Boolean(user) && isHydrated;
  const workspaceKey = user?.businessId || user?.workspace?.id || user?.id || "none";

  const statsQuery = useQuery({
    queryKey: ["dashboard", "critical", "stats", workspaceKey],
    enabled: authStable,
    staleTime: 15_000,
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

      return response.data as DashboardStatsResponse;
    },
  });

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

  const stats = statsQuery.data;
  const limited = Boolean(statsQuery.data?.nearLimit);
  const premiumLocked = Boolean(stats?.premiumLocked);
  const userName = user?.name || "Leader";

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollSlider = (direction: "left" | "right") => {
    if (sliderRef.current) {
      const cardWidth = sliderRef.current.firstElementChild?.getBoundingClientRect().width || 320;
      const scrollOffset = direction === "left" ? -(cardWidth + 16) : (cardWidth + 16);
      sliderRef.current.scrollBy({ left: scrollOffset, behavior: "smooth" });
    }
  };

  // Fallback structures if the backend fails to supply them
  const fallbackBriefing: BriefingData = {
    greeting: "Good Morning",
    summary: "Your AI workforce is operating within expected conditions. No active blockers have been identified.",
    statusIndicator: "Normal"
  };

  const fallbackPriorities: PriorityItem[] = [];
  const fallbackHumanAlerts: HumanAlertItem[] = [];
  const fallbackNotifications: CriticalNotification[] = [];
  const fallbackWorkforce: WorkforceItem[] = [
    { name: "Manager AI", role: "👑 AI Manager", status: "Healthy", lastActivity: "Updated 2 minutes ago", focus: "Reviewing founder priorities.", escalations: 0 },
    { name: "Sales AI", role: "💰 Sales AI", status: "Healthy", lastActivity: "Updated 5 minutes ago", focus: "Monitoring active conversations.", escalations: 0 },
    { name: "Marketing AI", role: "📈 Marketing AI", status: "Healthy", lastActivity: "Updated 12 minutes ago", focus: "Optimizing campaign performance.", escalations: 0 },
    { name: "Success AI", role: "❤️ Success AI", status: "Healthy", lastActivity: "Updated 24 minutes ago", focus: "Monitoring customer satisfaction.", escalations: 0 },
    { name: "Operations AI", role: "⚙️ Operations AI", status: "Healthy", lastActivity: "Updated 30 minutes ago", focus: "Managing upcoming bookings.", escalations: 0 },
    { name: "Finance AI", role: "📊 Finance AI", status: "Paused", lastActivity: "Updated 1 hour ago", focus: "Tracking outstanding invoices.", escalations: 0 }
  ];

  const briefing = stats?.briefing || fallbackBriefing;
  const priorities = stats?.priorities || fallbackPriorities;
  const humanAlerts = stats?.humanAttentionAlerts || fallbackHumanAlerts;
  const notifications = stats?.criticalNotifications || fallbackNotifications;
  const workforce = stats?.workforceHealth || fallbackWorkforce;

  // Compute dynamic workforce health summary header derived from actual AI states
  const totalAgentsCount = workforce.length;
  const needsAttentionCount = workforce.filter(ai => ai.status === "Needs Attention" || ai.status === "Paused").length;
  const normalAgentsCount = totalAgentsCount - needsAttentionCount;

  let workforceSummaryText = "All active AI systems are functioning within expected conditions.";
  if (needsAttentionCount > 0) {
    workforceSummaryText = needsAttentionCount === 1
      ? "One AI system may benefit from additional review."
      : `${normalAgentsCount} AI agents operating normally. ${needsAttentionCount} agents awaiting review.`;
  }

  if (statsQuery.isPending) {
    return (
      <div className="space-y-6">
        <SkeletonCard className="h-44 rounded-[30px]" />
        <div className="grid gap-6 md:grid-cols-2">
          <SkeletonCard className="h-96 rounded-2xl" />
          <SkeletonCard className="h-96 rounded-2xl" />
        </div>
        <SkeletonCard className="h-64 rounded-2xl" />
        <SkeletonCard className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="relative min-w-0 space-y-8 pb-12">
      {/* Premium Notification Strip (Usage limit warning or locking warning) */}
      {limited && (
        <div className="flex items-center justify-between gap-4 rounded-[22px] border border-amber-200 bg-amber-50/90 px-5 py-3.5 text-sm text-amber-800 backdrop-blur-md shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={18} />
            <p className="font-medium">You are approaching your daily AI reply threshold limits.</p>
          </div>
          <button
            onClick={() => openUpgrade()}
            className="brand-button-primary bg-amber-600 hover:bg-amber-700 text-white text-xs py-1.5 px-3.5 rounded-lg font-semibold shadow-sm transition"
          >
            Upgrade Plan
          </button>
        </div>
      )}

      {premiumLocked && (
        <div className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-white/90 px-5 py-4 text-sm text-slate-700 shadow-sm">
          <Info className="text-blue-500 shrink-0" size={18} />
          <p className="font-medium">Premium briefing modules are currently locked. Upgrade to unlock full access.</p>
        </div>
      )}

      {/* =========================================================================
          SECTION 1 – AI MANAGER BRIEFING (Hero Command)
          ========================================================================= */}
      <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0a182c] via-[#07111e] to-[#03070d] p-7 md:p-9 text-white shadow-xl border border-blue-950/60">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-blue-500/10 blur-[80px]" />
        <div className="absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-cyan-500/5 blur-[80px]" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-sans flex items-center gap-2.5">
              {briefing.greeting}, {userName} 👋
            </h1>
            <p className="mt-2 text-sm text-slate-400 font-medium">
              Here's what your AI workforce needs you to know today.
            </p>
          </div>

          {/* System Status Glow Badge */}
          <div className="flex items-center gap-3 shrink-0 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                briefing.statusIndicator === "Attention Needed" ? "bg-amber-400" : "bg-emerald-400"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                briefing.statusIndicator === "Attention Needed" ? "bg-amber-500" : "bg-emerald-500"
              }`}></span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              {briefing.statusIndicator === "Attention Needed" ? "Attention Needed" : "Normal Operations"}
            </span>
          </div>
        </div>

        {/* AI summary statement quotes block */}
        <div className="mt-8">
          <p className="text-base md:text-lg text-slate-300 font-medium leading-relaxed italic border-l-2 border-cyan-500/50 pl-4 py-1">
            "{briefing.summary}"
          </p>
        </div>

        {/* Hero actions */}
        <div className="mt-8 flex flex-wrap gap-4">
          <button
            onClick={() => scrollTo(prioritiesRef)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:brightness-110 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-blue-950/40 transition duration-200 cursor-pointer"
          >
            <AlertCircle size={15} />
            View Priorities
          </button>
          <button
            onClick={() => scrollTo(workforceRef)}
            className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/15 hover:bg-white/15 px-5 py-3 text-xs font-bold text-slate-200 transition duration-200 cursor-pointer"
          >
            <Activity size={15} />
            View Workforce
          </button>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* =========================================================================
            SECTION 2 – TOP PRIORITIES
            ========================================================================= */}
        <section 
          id="priorities-section" 
          ref={prioritiesRef} 
          className="scroll-mt-6 brand-section-shell rounded-2xl p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Sparkles size={16} />
              </span>
              <h2 className="text-base font-bold text-gray-900">Top Priorities</h2>
            </div>
            <p className="text-xs text-slate-500 mb-6 font-medium">
              Founder-specific actions required to maintain business momentum.
            </p>

            <div className="space-y-4">
              {priorities.length > 0 ? (
                priorities.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white/70 hover:bg-white p-4 transition duration-200 shadow-sm"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide border uppercase ${
                          item.level === "Critical"
                            ? "bg-rose-50 text-rose-700 border-rose-100"
                            : item.level === "High"
                            ? "bg-amber-50 text-amber-700 border-amber-100"
                            : "bg-blue-50 text-blue-700 border-blue-100"
                        }`}>
                          {item.level}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                          <Bot size={11} className="text-slate-400" />
                          {item.source}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-900 leading-snug">
                        {item.explanation}
                      </p>
                    </div>

                    <button
                      onClick={() => router.push(item.href as any)}
                      className="inline-flex items-center justify-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:translate-x-0.5 transition duration-150 py-1.5 px-3 rounded-lg bg-blue-50/50 hover:bg-blue-50 font-sans cursor-pointer self-start sm:self-auto"
                    >
                      {item.action}
                      <ChevronRight size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40 p-5 text-slate-600">
                  <p className="text-xs font-bold text-slate-800 mb-3.5">
                    No founder actions are currently required.
                  </p>
                  <ul className="space-y-2.5 text-[11px] font-semibold leading-relaxed list-disc pl-4 text-slate-500">
                    <li>Your team and AI workforce are progressing without blockers.</li>
                    <li>All active priorities are being managed appropriately.</li>
                    <li>There are currently no outstanding actions awaiting review.</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 3 – HUMAN ATTENTION ALERTS
            ========================================================================= */}
        <section className="brand-section-shell rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <AlertTriangle size={16} />
              </span>
              <h2 className="text-base font-bold text-gray-900">Human Attention Alerts</h2>
            </div>
            <p className="text-xs text-slate-500 mb-6 font-medium">
              Situations where AI models need takeover or manual business review.
            </p>

            <div className="space-y-4">
              {humanAlerts.length > 0 ? (
                humanAlerts.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white/70 hover:bg-white p-4 transition duration-200 shadow-sm"
                  >
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        {item.details}
                      </p>
                    </div>

                    <button
                      onClick={() => router.push(item.href as any)}
                      className="inline-flex items-center justify-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:translate-x-0.5 transition duration-150 py-1.5 px-3 rounded-lg bg-rose-50/50 hover:bg-rose-50 font-sans cursor-pointer self-start sm:self-auto"
                    >
                      Resolve
                      <ChevronRight size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40 p-5 text-slate-600">
                  <p className="text-xs font-bold text-slate-800 mb-3.5">
                    No critical alerts have been detected.
                  </p>
                  <ul className="space-y-2.5 text-[11px] font-semibold leading-relaxed list-disc pl-4 text-slate-500">
                    <li>Business operations are proceeding without notable exceptions.</li>
                    <li>All monitored systems remain within expected conditions.</li>
                    <li>There are currently no issues requiring immediate awareness.</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* =========================================================================
          SECTION 4 – CRITICAL NOTIFICATIONS
          ========================================================================= */}
      <section className="brand-section-shell rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
            <Clock size={16} />
          </span>
          <h2 className="text-base font-bold text-gray-900">Critical Notifications</h2>
        </div>
        <p className="text-xs text-slate-500 mb-6 font-medium">
          Awareness events without the noise. Showing only the 5 most recent activities.
        </p>

        {notifications.length > 0 ? (
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {notifications.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-xl border border-slate-100 bg-white/60 p-4 shadow-sm hover:shadow-md transition duration-150"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 uppercase">
                      {item.type}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">
                      {item.timestamp}
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-600 leading-normal">
                    {item.message}
                  </p>
                </div>

                <div className="mt-4 pt-2 border-t border-slate-100/50 flex items-center justify-between text-[10px] font-bold text-slate-400">
                  <span>Module:</span>
                  <span className="text-slate-500 uppercase tracking-wider">{item.module}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40 p-5 text-slate-600">
            <p className="text-xs font-bold text-slate-800 mb-3.5">
              There are no recent business updates requiring review.
            </p>
            <ul className="space-y-2.5 text-[11px] font-semibold leading-relaxed list-disc pl-4 text-slate-500">
              <li>Your notification feed is currently clear.</li>
              <li>No important events have been recorded since your previous review.</li>
              <li>No new developments have been identified at this time.</li>
            </ul>
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTION 5 – AI WORKFORCE HEALTH (V3 Compact Slider)
          ========================================================================= */}
      <section 
        id="workforce-section" 
        ref={workforceRef} 
        className="scroll-mt-6 brand-section-shell rounded-2xl p-6"
      >
        {/* 1. Workforce Summary Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <Heart size={16} />
              </span>
              <h2 className="text-base font-bold text-gray-900">AI Workforce Health</h2>
            </div>
            <p className="text-xs font-semibold text-slate-500 leading-snug">
              {workforceSummaryText}
            </p>
          </div>

          {/* Slider controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => scrollSlider("left")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-sm cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => scrollSlider("right")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-sm cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* 2. Compact Workforce Slider */}
        {workforce.length > 0 ? (
          <div className="relative overflow-hidden w-full">
            <div
              ref={sliderRef}
              className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory scrollbar-none gap-4 pb-3"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {workforce.map((ai) => (
                <div
                  key={ai.name}
                  className="snap-start shrink-0 w-full sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)] flex flex-col justify-between rounded-xl border border-slate-150 bg-white/85 p-5 shadow-sm transition hover:shadow-md border-t-2 border-t-slate-200"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
                      <h3 className="text-xs font-bold text-slate-900">{ai.role}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase ${
                        ai.status === "Healthy"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : ai.status === "Busy"
                          ? "bg-blue-50 text-blue-700 border-blue-100"
                          : ai.status === "Needs Attention"
                          ? "bg-amber-50 text-amber-700 border-amber-100"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          ai.status === "Healthy"
                            ? "bg-emerald-500"
                            : ai.status === "Busy"
                            ? "bg-blue-500"
                            : ai.status === "Needs Attention"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-slate-400"
                        }`} />
                        {ai.status}
                      </span>
                    </div>
                    
                    <p className="text-[11px] font-semibold text-slate-700 leading-snug">
                      {ai.focus}
                    </p>
                  </div>

                  <div className="mt-4.5 pt-3 border-t border-slate-100/60 flex items-center justify-between text-[10px] font-bold text-slate-400">
                    <span className={ai.status === "Needs Attention" ? "text-amber-600 font-semibold" : "text-slate-500"}>
                      {ai.escalations > 0 ? `${ai.escalations} escalations awaiting review` : "0 escalations pending"}
                    </span>
                    <span className="text-slate-500 font-medium">{ai.lastActivity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-250 bg-slate-50/45 p-5 text-slate-600">
            <p className="text-xs font-bold text-slate-850 mb-2">
              Your AI workforce is ready to support future business activity.
            </p>
            <p className="text-[11px] font-semibold text-slate-500">
              Configure your first AI workflows to begin delegation.
            </p>
          </div>
        )}

        {/* 3. View Workforce CTA */}
        <div className="mt-6 border-t border-slate-100/60 pt-4 flex justify-end">
          <button
            onClick={() => router.push("/ai-training?tab=workforce" as any)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 hover:translate-x-0.5 transition duration-150 py-1.5 px-3 rounded-lg bg-blue-50/50 hover:bg-blue-50 font-sans cursor-pointer"
          >
            View Full Workforce
            <ChevronRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}
