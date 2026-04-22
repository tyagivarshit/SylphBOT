"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchSecurityAlerts,
  isSecurityRequestError,
  type SecurityAlertRecord,
} from "@/lib/security";
import {
  describeAlert,
  formatDateTime,
  formatStructuredData,
  getAlertMeta,
} from "./securityUtils";

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function SecurityAlertsTab() {
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>(
    {}
  );

  const alertsQuery = useQuery({
    queryKey: ["security", "alerts"],
    queryFn: fetchSecurityAlerts,
    retry: false,
  });

  useEffect(() => {
    if (!alertsQuery.error) {
      return;
    }

    if (
      isSecurityRequestError(alertsQuery.error) &&
      alertsQuery.error.status === 403
    ) {
      return;
    }

    toast.error(
      getErrorMessage(alertsQuery.error, "Failed to load security alerts")
    );
  }, [alertsQuery.error]);

  const accessDenied = Boolean(
    alertsQuery.error &&
    isSecurityRequestError(alertsQuery.error) &&
    alertsQuery.error.status === 403
  );

  const toggleExpanded = (alertId: string) => {
    setExpandedAlerts((currentState) => ({
      ...currentState,
      [alertId]: !currentState[alertId],
    }));
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Live monitoring
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          Security alerts
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Review high-signal events such as failed login spikes, invalid API key
          usage, and suspicious activity captured by the security pipeline.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Failed login attempts"
          description="Repeated sign-in failures are surfaced for review."
          tone="amber"
        />
        <SummaryCard
          label="Invalid API usage"
          description="Bad or revoked key usage is raised as an incident signal."
          tone="rose"
        />
        <SummaryCard
          label="Suspicious activity"
          description="Unusual patterns are flagged for deeper investigation."
          tone="red"
        />
      </div>

      {alertsQuery.isLoading ? <AlertsLoadingState /> : null}

      {accessDenied ? (
        <PanelState
          title="Access limited"
          description="Security alert visibility is restricted to roles with security-management access."
        />
      ) : null}

      {!alertsQuery.isLoading && alertsQuery.isError && !accessDenied ? (
        <PanelState
          title="Security alerts unavailable"
          description="The alert feed could not be loaded for this workspace."
          actionLabel="Retry"
          onAction={() => void alertsQuery.refetch()}
        />
      ) : null}

      {!alertsQuery.isLoading &&
      !alertsQuery.isError &&
      alertsQuery.data?.unsupported ? (
        <PanelState
          title="Alert feed not exposed in this environment"
          description="This environment is generating security alerts server-side, but it does not currently expose a readable alert feed endpoint to the frontend."
        />
      ) : null}

      {!alertsQuery.isLoading &&
      !alertsQuery.isError &&
      !alertsQuery.data?.unsupported &&
      (alertsQuery.data?.alerts.length ?? 0) === 0 ? (
        <PanelState
          title="No active alerts"
          description="No security alerts were returned for this workspace. Continue monitoring API keys and audit activity from the adjacent tabs."
        />
      ) : null}

      {!alertsQuery.isLoading &&
      !alertsQuery.isError &&
      !alertsQuery.data?.unsupported &&
      (alertsQuery.data?.alerts.length ?? 0) > 0 ? (
        <div className="grid gap-3">
          {alertsQuery.data?.alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              expanded={Boolean(expandedAlerts[alert.id])}
              onToggle={() => toggleExpanded(alert.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AlertCard({
  alert,
  expanded,
  onToggle,
}: {
  alert: SecurityAlertRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const alertMeta = getAlertMeta(alert.type);

  return (
    <div className="brand-panel rounded-[26px] p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${alertMeta.severityClass}`}
            >
              {alertMeta.severity}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {formatDateTime(alert.createdAt)}
            </span>
          </div>

          <h3 className="mt-3 text-lg font-semibold text-slate-950">
            {alertMeta.label}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            {describeAlert(alert)}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? "Hide details" : "View details"}
        </button>
      </div>

      {expanded ? (
        <pre className="mt-4 overflow-x-auto rounded-[22px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-slate-100 whitespace-pre-wrap break-all">
          {formatStructuredData(alert.metadata)}
        </pre>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  description,
  tone,
}: {
  label: string;
  description: string;
  tone: "amber" | "rose" | "red";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "rose"
        ? "bg-rose-50 text-rose-700"
        : "bg-red-50 text-red-700";

  const icon =
    tone === "amber" ? (
      <BellRing size={16} />
    ) : tone === "rose" ? (
      <AlertTriangle size={16} />
    ) : (
      <ShieldAlert size={16} />
    );

  return (
    <div className="brand-kpi-card rounded-[24px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Signal
          </p>
          <p className="mt-3 text-base font-semibold text-slate-950">{label}</p>
        </div>

        <div className={`flex h-10 w-10 items-center justify-center rounded-[16px] ${toneClass}`}>
          {icon}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function AlertsLoadingState() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="brand-panel animate-pulse rounded-[24px] p-5"
        >
          <div className="h-5 w-32 rounded-full bg-slate-200" />
          <div className="mt-3 h-6 w-56 rounded-full bg-slate-100" />
          <div className="mt-4 h-16 rounded-[20px] bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function PanelState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="brand-empty-state rounded-[28px] px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-blue-50 text-blue-700">
        <ShieldAlert size={18} />
      </div>
      <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
        {description}
      </p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="brand-button-secondary mt-5"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
