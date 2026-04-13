"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Crown, Flame, Lock, MessageSquareText, Target } from "lucide-react";
import { useAnalyticsDashboard } from "@/lib/useAnalytics";
import type { AnalyticsDashboard, AnalyticsMetric } from "@/lib/analytics";
import DateFilter from "./DateFilter";
import StatCard from "./StatCard";

const COLORS = ["#1E5EFF", "#0EA5E9", "#14B8A6", "#F59E0B", "#10B981", "#EF4444"];

function formatMetric(metric: AnalyticsMetric) {
  if (metric.format === "percent") return `${metric.value}%`;
  if (metric.format === "minutes") return `${metric.value}m`;
  return Intl.NumberFormat("en-US").format(metric.value);
}

function LockedPanel() {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Elite Deep Dive
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Upgrade to unlock intent diagnostics
          </h3>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
          <Lock size={14} />
          Elite
        </span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          "Intent breakdown",
          "Stage distribution",
          "Opportunity watchlist",
          "Weekday diagnostics",
        ].map((item) => (
          <div
            key={item}
            className="rounded-[22px] border border-slate-200/80 bg-slate-50 px-4 py-3 text-sm text-slate-600"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCards({ dashboard }: { dashboard: AnalyticsDashboard }) {
  const stats = [
    ["Leads Captured", "Fresh leads created in this range.", dashboard.summary.leadsCaptured],
    ["Qualified Leads", "Leads that crossed into buying intent.", dashboard.summary.qualifiedLeads],
    ["Booked Meetings", "Meetings created from the workspace.", dashboard.summary.bookedMeetings],
    ["Lead-To-Booking", "Conversion from new lead to booked meeting.", dashboard.summary.leadToBookingRate],
    ["First Response", "Average first reply delay after inbound message.", dashboard.summary.avgFirstResponseMinutes],
    ["Avg Lead Score", "Average intent score across new leads.", dashboard.summary.avgLeadScore],
    ["AI Reply Share", "Outbound reply share handled by automation.", dashboard.summary.aiReplyShare],
    ["Health Score", "Composite score from response, quality, and backlog.", dashboard.summary.healthScore],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2.5 text-xs">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 font-semibold text-rose-700">
          <Flame size={13} />
          {dashboard.summary.hotLeadCount} hot leads
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
          <MessageSquareText size={13} />
          {dashboard.summary.unreadBacklog} unread backlog
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
          <Target size={13} />
          {dashboard.summary.humanTakeoverCount} human takeovers
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map(([title, helper, metric]) => (
          <StatCard
            key={title}
            stat={{ title, helper, metric }}
          />
        ))}
      </div>
    </div>
  );
}

function TrendSection({ dashboard }: { dashboard: AnalyticsDashboard }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Performance Trend
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
          Lead, qualification, and booking momentum
        </h3>
        <div className="mt-6 h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dashboard.trends.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe5f1" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip />
              <Area type="monotone" dataKey="leads" stroke="#1E5EFF" fill="#1E5EFF22" strokeWidth={2.2} />
              <Area type="monotone" dataKey="qualified" stroke="#14B8A6" fill="#14B8A622" strokeWidth={2} />
              <Area type="monotone" dataKey="bookings" stroke="#F59E0B" fill="#F59E0B18" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Conversation Engine
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
          Inbound vs AI coverage
        </h3>
        <div className="mt-6 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                { label: "Inbound", value: dashboard.trends.totals.inboundMessages },
                { label: "AI", value: dashboard.trends.totals.aiReplies },
                { label: "Agent", value: dashboard.trends.totals.agentReplies },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe5f1" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip />
              <Bar dataKey="value" radius={[12, 12, 4, 4]}>
                {["#0EA5E9", "#1E5EFF", "#14B8A6"].map((fill) => (
                  <Cell key={fill} fill={fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">AI reply share</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{formatMetric(dashboard.summary.aiReplyShare)}</p>
          </div>
          <div className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Avg messages / lead</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{dashboard.trends.totals.avgMessagesPerLead}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeepDive({ dashboard }: { dashboard: AnalyticsDashboard }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Conversion Ladder
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
          Pipeline efficiency from lead to booking
        </h3>
        <div className="mt-6 space-y-4">
          {dashboard.funnel.map((stage) => (
            <div key={stage.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{stage.label}</p>
                  <p className="text-xs text-slate-500">{stage.conversionFromPrevious}% from previous stage</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{stage.count}</p>
                  <p className="text-xs text-slate-500">{stage.conversionFromTop}% of total</p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#081223] via-[#1E5EFF] to-[#14B8A6]"
                  style={{ width: `${Math.max(stage.conversionFromTop, 4)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {dashboard.deepDive ? (
          <div className="mt-6 rounded-[24px] border border-slate-200/80 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Stage distribution
            </p>
            <div className="mt-4 space-y-3">
              {dashboard.deepDive.stageDistribution.map((stage, index) => (
                <div key={stage.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-700">{stage.label}</span>
                    <span className="font-semibold text-slate-900">{stage.count} • {stage.share}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(stage.share, 2)}%`, backgroundColor: COLORS[index % COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
        <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Source Intelligence
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Channel quality and conversion depth
          </h3>
          <div className="mt-5 space-y-3">
            {dashboard.sourcePerformance.length === 0 ? (
              <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Selected range me abhi koi source data available nahi hai.
              </p>
            ) : (
              dashboard.sourcePerformance.map((source) => (
                <div key={source.source} className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{source.source}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {source.leads} leads • {source.bookings} bookings • {source.share}% share
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <MetricChip label="Qualified" value={String(source.qualified)} />
                      <MetricChip label="Conv." value={`${source.conversionRate}%`} />
                      <MetricChip label="Score" value={String(source.avgLeadScore)} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {dashboard.deepDive ? (
          <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Elite Diagnostics
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  Intent, temperature, and operating signals
                </h3>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <Crown size={13} />
                Elite
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {dashboard.deepDive.intentBreakdown.map((item) => (
                <span key={item.intent} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                  {item.intent} • {item.count}
                </span>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricChip label="Hot no booking" value={String(dashboard.deepDive.operationalMetrics.hotLeadsWithoutBooking)} />
              <MetricChip label="Unread qualified" value={String(dashboard.deepDive.operationalMetrics.unreadQualifiedLeads)} />
              <MetricChip label="Human takeover" value={String(dashboard.deepDive.operationalMetrics.humanTakeoverCount)} />
              <MetricChip label="Avg followups" value={String(dashboard.deepDive.operationalMetrics.avgFollowupsPerLead)} />
            </div>
            <div className="mt-5 space-y-3">
              {dashboard.deepDive.insights.map((insight) => (
                <div key={insight.title} className="rounded-[20px] border border-slate-200/80 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-950">{insight.title}</p>
                    <span className="text-sm font-semibold text-slate-900">{insight.value}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{insight.note}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <LockedPanel />
        )}
      </div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function AnalyticsEnterprise() {
  const [range, setRange] = useState("30d");
  const analyticsQuery = useAnalyticsDashboard(range);
  const dashboard = analyticsQuery.data;

  if (analyticsQuery.isPending) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="h-56 rounded-[30px] border border-slate-200 bg-white/80 animate-pulse" />
          <div className="h-56 rounded-[30px] border border-slate-200 bg-white/80 animate-pulse" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-32 rounded-[24px] border border-slate-200 bg-white/80 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (analyticsQuery.isError || !dashboard) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        Analytics dashboard load nahi ho paya. Refresh karke dobara try karo.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-gray-900">
      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="relative overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(30,94,255,0.18),transparent_35%),linear-gradient(135deg,#081223_0%,#0d274f_50%,#123e85_100%)] p-6 text-white shadow-[0_24px_65px_rgba(8,18,35,0.22)]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-50/90">
                  <Crown size={13} />
                  Enterprise Analytics
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-[2rem]">
                  {dashboard.business.name} intelligence console
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-50/78">
                  Real conversion, response, and channel analytics for {dashboard.meta.label.toLowerCase()}.
                </p>
              </div>
              <DateFilter range={range} setRange={setRange} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <HeroMini title="Health score" value={formatMetric(dashboard.summary.healthScore)} />
              <HeroMini title="Active conversations" value={String(dashboard.summary.activeConversations)} />
              <HeroMini title="Hot leads" value={String(dashboard.summary.hotLeadCount)} />
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Access Layer</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                {dashboard.meta.isElite ? "Deep diagnostics unlocked" : "Core analytics only"}
              </h3>
            </div>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${dashboard.meta.isElite ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
              {dashboard.meta.isElite ? <Crown size={14} /> : <Lock size={14} />}
              {dashboard.meta.planKey}
            </span>
          </div>
          <div className="mt-5 space-y-3 text-sm text-slate-500">
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
              Generated: {new Date(dashboard.meta.generatedAt).toLocaleString()}
            </div>
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
              Range: {new Date(dashboard.meta.start).toLocaleDateString()} - {new Date(dashboard.meta.end).toLocaleDateString()}
            </div>
            <div className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4">
              Workspace: {dashboard.business.industry || "Industry not set"} {dashboard.business.teamSize ? `• ${dashboard.business.teamSize}` : ""}
            </div>
          </div>
        </div>
      </div>

      <SummaryCards dashboard={dashboard} />
      <TrendSection dashboard={dashboard} />
      <DeepDive dashboard={dashboard} />
    </div>
  );
}

function HeroMini({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-white/12 bg-white/10 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-blue-50/65">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
