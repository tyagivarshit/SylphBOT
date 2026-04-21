"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ChevronUp, Search, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchAuditLogs,
  isSecurityRequestError,
  type AuditLogEntry,
} from "@/lib/security";
import {
  formatActionLabel,
  formatDateTime,
  formatStructuredData,
  formatUserLabel,
  formatUserSecondary,
  matchesAuditSearch,
} from "./securityUtils";

const PAGE_SIZE = 12;
const EMPTY_AUDIT_LOGS: AuditLogEntry[] = [];

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function AuditLogsTab() {
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [actionSearch, setActionSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const deferredUserSearch = useDeferredValue(userSearch);
  const deferredActionSearch = useDeferredValue(actionSearch);

  const auditLogsQuery = useQuery({
    queryKey: ["security", "audit-logs", { page, fromDate, toDate }],
    queryFn: () =>
      fetchAuditLogs({
        page,
        limit: PAGE_SIZE,
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
  });

  useEffect(() => {
    if (!auditLogsQuery.error) {
      return;
    }

    if (
      isSecurityRequestError(auditLogsQuery.error) &&
      auditLogsQuery.error.status === 403
    ) {
      return;
    }

    toast.error(getErrorMessage(auditLogsQuery.error, "Failed to load audit logs"));
  }, [auditLogsQuery.error]);

  const accessDenied = Boolean(
    auditLogsQuery.error &&
    isSecurityRequestError(auditLogsQuery.error) &&
    auditLogsQuery.error.status === 403
  );

  const logs = auditLogsQuery.data?.logs ?? EMPTY_AUDIT_LOGS;
  const pagination = auditLogsQuery.data?.pagination;

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) =>
        matchesAuditSearch(log, deferredUserSearch, deferredActionSearch)
      ),
    [deferredActionSearch, deferredUserSearch, logs]
  );

  const pageButtons = useMemo(() => {
    const totalPages = pagination?.totalPages ?? 1;

    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (page <= 3) {
      return [1, 2, 3, 4, totalPages];
    }

    if (page >= totalPages - 2) {
      return [1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, page - 1, page, page + 1, totalPages];
  }, [page, pagination?.totalPages]);

  const toggleExpanded = (logId: string) => {
    setExpandedRows((currentState) => ({
      ...currentState,
      [logId]: !currentState[logId],
    }));
  };

  const clearFilters = () => {
    setPage(1);
    setFromDate("");
    setToDate("");
    setUserSearch("");
    setActionSearch("");
    setExpandedRows({});
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          Event trace
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          Audit logs
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Review security-sensitive activity across the workspace with searchable
          operator context, timestamps, and structured metadata.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_220px_auto]">
        <SearchInput
          label="User"
          placeholder="Name, email, or user ID"
          value={userSearch}
          onChange={(value) => setUserSearch(value)}
        />

        <SearchInput
          label="Action"
          placeholder="Filter visible results"
          value={actionSearch}
          onChange={(value) => setActionSearch(value)}
        />

        <DateInput
          label="From"
          value={fromDate}
          onChange={(value) => {
            setPage(1);
            setFromDate(value);
          }}
        />

        <DateInput
          label="To"
          value={toDate}
          onChange={(value) => {
            setPage(1);
            setToDate(value);
          }}
        />

        <div className="flex items-end">
          <button
            type="button"
            onClick={clearFilters}
            className="brand-button-secondary w-full xl:w-auto"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        Date filters query the server. User and action filters refine the
        currently loaded page for faster incident review.
      </div>

      {auditLogsQuery.isLoading ? <AuditLoadingState /> : null}

      {accessDenied ? (
        <PanelState
          title="Access limited"
          description="Audit log visibility requires a security-management permission set."
        />
      ) : null}

      {!auditLogsQuery.isLoading && auditLogsQuery.isError && !accessDenied ? (
        <PanelState
          title="Audit logs unavailable"
          description="The audit feed could not be loaded for this workspace."
          actionLabel="Retry"
          onAction={() => void auditLogsQuery.refetch()}
        />
      ) : null}

      {!auditLogsQuery.isLoading &&
      !auditLogsQuery.isError &&
      logs.length === 0 ? (
        <PanelState
          title="No audit logs found"
          description="No audit activity was returned for the selected date range."
        />
      ) : null}

      {!auditLogsQuery.isLoading &&
      !auditLogsQuery.isError &&
      logs.length > 0 &&
      filteredLogs.length === 0 ? (
        <PanelState
          title="No results on this page"
          description="Adjust the user or action filters to expand the currently loaded results."
        />
      ) : null}

      {!auditLogsQuery.isLoading &&
      !auditLogsQuery.isError &&
      filteredLogs.length > 0 ? (
        <>
          <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {filteredLogs.length} of {logs.length} logs on page {page}.
            </p>
            <p>
              Total indexed events: {pagination?.total ?? filteredLogs.length}
            </p>
          </div>

          <div className="space-y-3 lg:hidden">
            {filteredLogs.map((log) => (
              <AuditLogCard
                key={log.id}
                log={log}
                expanded={Boolean(expandedRows[log.id])}
                onToggle={() => toggleExpanded(log.id)}
              />
            ))}
          </div>

          <div className="brand-table-wrap hidden rounded-[28px] lg:block">
            <div className="overflow-x-auto">
              <table className="brand-table min-w-full text-sm">
                <thead className="border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                      Action
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                      User
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                      Timestamp
                    </th>
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em]">
                      Metadata
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white/72">
                  {filteredLogs.map((log) => {
                    const expanded = Boolean(expandedRows[log.id]);

                    return (
                      <Fragment key={log.id}>
                        <tr>
                          <td className="px-5 py-4 align-top">
                            <p className="font-semibold text-slate-950">
                              {formatActionLabel(log.action)}
                            </p>
                            <p className="mt-1 font-mono text-xs text-slate-400">
                              {log.action}
                            </p>
                            {log.requestId ? (
                              <p className="mt-2 text-xs text-slate-400">
                                Request ID: {log.requestId}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-5 py-4 align-top">
                            <p className="font-semibold text-slate-950">
                              {formatUserLabel(log)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatUserSecondary(log)}
                            </p>
                            {log.ip ? (
                              <p className="mt-2 text-xs text-slate-400">
                                IP: {log.ip}
                              </p>
                            ) : null}
                          </td>

                          <td className="px-5 py-4 align-top text-slate-600">
                            {formatDateTime(log.createdAt)}
                          </td>

                          <td className="px-5 py-4 align-top">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(log.id)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              {expanded ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                              {expanded ? "Hide metadata" : "View metadata"}
                            </button>
                          </td>
                        </tr>

                        {expanded ? (
                          <tr>
                            <td colSpan={4} className="px-5 pb-5">
                              <pre className="overflow-x-auto rounded-[22px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-slate-100 whitespace-pre-wrap break-all">
                                {formatStructuredData(log.metadata)}
                              </pre>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {(pagination?.totalPages ?? 1) > 1 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Page {pagination?.page ?? page} of {pagination?.totalPages ?? 1}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={page === 1}
                  className="brand-button-secondary px-4 py-2.5 text-sm"
                >
                  Previous
                </button>

                {pageButtons.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={`inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition ${
                      pageNumber === page
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setPage((currentPage) =>
                      Math.min(pagination?.totalPages ?? currentPage, currentPage + 1)
                    )
                  }
                  disabled={page === (pagination?.totalPages ?? page)}
                  className="brand-button-secondary px-4 py-2.5 text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SearchInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="brand-field-label">{label}</span>
      <span className="brand-input-shell mt-2">
        <span className="brand-input-icon">
          <Search size={16} />
        </span>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="brand-field-label">{label}</span>
      <span className="brand-input-shell mt-2">
        <span className="brand-input-icon">
          <CalendarDays size={16} />
        </span>
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function AuditLogCard({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="brand-panel rounded-[24px] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-950">
            {formatActionLabel(log.action)}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-slate-400">
            {log.action}
          </p>
        </div>

        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {formatDateTime(log.createdAt)}
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-slate-200 bg-white/80 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              User
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {formatUserLabel(log)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatUserSecondary(log)}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? "Hide metadata" : "View metadata"}
          </button>
        </div>

        {log.ip || log.requestId ? (
          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
            <span>{log.ip ? `IP: ${log.ip}` : "IP: Not captured"}</span>
            <span>
              {log.requestId ? `Request ID: ${log.requestId}` : "Request ID: Not captured"}
            </span>
          </div>
        ) : null}

        {expanded ? (
          <pre className="mt-4 overflow-x-auto rounded-[18px] border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-xs leading-6 text-slate-100 whitespace-pre-wrap break-all">
            {formatStructuredData(log.metadata)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function AuditLoadingState() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="brand-panel animate-pulse rounded-[24px] p-5"
        >
          <div className="h-5 w-48 rounded-full bg-slate-200" />
          <div className="mt-3 h-4 w-60 rounded-full bg-slate-100" />
          <div className="mt-5 h-24 rounded-[20px] bg-slate-100" />
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
        <ShieldCheck size={18} />
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
