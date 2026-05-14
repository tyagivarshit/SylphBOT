"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bot, Play, Radar, ShieldAlert, Sparkles, TimerReset } from "lucide-react";
import {
  getAutonomousDashboard,
  runAutonomousScheduler,
  type AutonomousDashboard as AutonomousDashboardData,
} from "@/lib/autonomous";
import { EmptyState, RetryState, SkeletonCard } from "@/components/ui/feedback";

const ENGINE_LABELS: Record<string, string> = {
  lead_revival: "Lead Revival",
  winback: "Winback",
  expansion: "Expansion",
  retention: "Retention",
  referral: "Referral",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  QUEUED: "bg-blue-50 text-blue-700",
  DISPATCHED: "bg-emerald-50 text-emerald-700",
  BLOCKED: "bg-rose-50 text-rose-700",
  FAILED: "bg-slate-100 text-slate-700",
};

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: typeof Bot;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {title}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
        </div>
        <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Date(value).toLocaleString();
}

export default function AutonomousDashboard() {
  const [dashboard, setDashboard] = useState<AutonomousDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, startRunning] = useTransition();

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getAutonomousDashboard();
      setDashboard(data);
    } catch (loadError) {
      console.error("Autonomous dashboard error", loadError);
      setError("We couldn't load the autonomous engine right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const topBlockedReason = useMemo(() => {
    if (!dashboard?.observability.blockedReasons.length) {
      return "No dominant guardrail block yet";
    }

    const first = dashboard.observability.blockedReasons[0];
    return `${first.reason.replace(/_/g, " ")} • ${first.count}`;
  }, [dashboard]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonCard key={index} className="h-32" />
          ))}
        </div>
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <RetryState
        title="Autonomous dashboard unavailable"
        description={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!dashboard) {
    return (
      <EmptyState
        title="No autonomous data yet"
        description="Run the scheduler once to generate opportunities."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Autonomous Selling Engine
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Opportunity discovery, ethical outreach, and dispatch observability
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              The engine scans CRM intelligence, scores proactive opportunities,
              applies guardrails, and routes approved outreach back through Revenue Brain.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              startRunning(async () => {
                await runAutonomousScheduler(true);
                await load();
              })
            }
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Play size={15} />
            {running ? "Running scan..." : "Run scan now"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Pending"
          value={dashboard.summary.pending}
          helper="Eligible leads waiting for dispatch."
          icon={Radar}
        />
        <MetricCard
          title="Queued"
          value={dashboard.summary.queued}
          helper="Campaigns already handed to the AI queue."
          icon={Bot}
        />
        <MetricCard
          title="Dispatched Today"
          value={dashboard.summary.dispatchedToday}
          helper="Confirmed proactive sends today."
          icon={Sparkles}
        />
        <MetricCard
          title="Blocked"
          value={dashboard.summary.blocked}
          helper={topBlockedReason}
          icon={ShieldAlert}
        />
        <MetricCard
          title="Avg Score"
          value={dashboard.summary.avgScore}
          helper="Average opportunity quality across active leads."
          icon={TimerReset}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Engine Mix
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Which autonomous strategies are active
          </h3>
          <div className="mt-5 space-y-3">
            {dashboard.engines.map((engine) => (
              <div
                key={engine.engine}
                className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {ENGINE_LABELS[engine.engine] || engine.engine}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {engine.pending} pending • {engine.queued} queued •{" "}
                      {engine.blocked} blocked • {engine.dispatchedToday} sent today
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                    {engine.pending + engine.queued + engine.blocked} tracked
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Guardrail Watch
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Why outreach is being held back
          </h3>
          <div className="mt-5 space-y-3">
            {dashboard.observability.blockedReasons.length === 0 ? (
              <EmptyState
                title="No guardrail pressure yet"
                description="Once the scheduler blocks outreach, the dominant reasons show up here."
              />
            ) : (
              dashboard.observability.blockedReasons.map((item) => (
                <div
                  key={item.reason}
                  className="flex items-center justify-between rounded-[22px] border border-slate-200/80 bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {item.reason.replace(/_/g, " ")}
                  </p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {item.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Opportunities
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Current proactive queue
          </h3>
          <div className="mt-5 space-y-3">
            {dashboard.opportunities.length === 0 ? (
              <EmptyState
                title="No active opportunities"
                description="Run the scheduler to discover which leads are eligible for proactive motion."
              />
            ) : (
              dashboard.opportunities.map((item) => (
                <div
                  key={item.leadId}
                  className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {item.leadName || item.leadId}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {ENGINE_LABELS[item.engine] || item.engine}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        Score {item.score}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          STATUS_STYLES[item.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{item.objective}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Updated {formatDate(item.updatedAt)}</span>
                    {item.nextEligibleAt ? (
                      <span>Next eligible {formatDate(item.nextEligibleAt)}</span>
                    ) : null}
                  </div>
                  {item.blockedReasons.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.blockedReasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700"
                        >
                          {reason.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Campaign Stream
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
            Queue and delivery trail
          </h3>
          <div className="mt-5 space-y-3">
            {dashboard.campaigns.length === 0 ? (
              <EmptyState
                title="No campaigns dispatched yet"
                description="Queued and delivered autonomous outreach will show up here."
              />
            ) : (
              dashboard.campaigns.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[22px] border border-slate-200/80 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {item.leadName || item.leadId}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {ENGINE_LABELS[item.engine] || item.engine}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        STATUS_STYLES[item.status] || "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.objective}</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <span>Queued {formatDate(item.queuedAt)}</span>
                    <span>Dispatched {formatDate(item.dispatchedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Observability
        </p>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
          Recent scheduler and campaign events
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Last scheduler run: {formatDate(dashboard.observability.lastSchedulerRunAt)}
        </p>
        <div className="mt-5 space-y-3">
          {dashboard.observability.recentEvents.length === 0 ? (
            <EmptyState
              title="No events recorded"
              description="Observability events are persisted as the scheduler evaluates and dispatches."
            />
          ) : (
            dashboard.observability.recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-[22px] border border-slate-200/80 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {event.type.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Lead {event.leadId || "n/a"} • {formatDate(event.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-700">
                  {Object.keys(event.meta || {}).length} signals
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
