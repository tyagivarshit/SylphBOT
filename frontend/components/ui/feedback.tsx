"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bot, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";

export function LoadingSpinner({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[24px] border border-slate-200/80 bg-white/80 shadow-sm ${className}`}
    />
  );
}

export function EmptyState({
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const action = actionLabel
    ? actionHref
      ? (
          <Link href={actionHref as any} className="brand-button-primary mt-5">
            {actionLabel}
          </Link>
        )
      : onAction
        ? (
            <button type="button" onClick={onAction} className="brand-button-primary mt-5">
              {actionLabel}
            </button>
          )
        : null
    : null;

  return (
    <div className="brand-empty-state rounded-[28px] px-6 py-8 text-center">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {eyebrow}
        </p>
      ) : null}
      <p className="mt-2 text-base font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function RetryState({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
}: {
  title: string;
  description: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="rounded-[24px] border border-red-200 bg-red-50/92 px-5 py-5 text-red-900 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-red-600">
            <TriangleAlert size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-1 text-sm leading-6 text-red-700/90">
              {description}
            </p>
          </div>
        </div>

        <button type="button" onClick={onRetry} className="brand-button-secondary shrink-0">
          {retryLabel}
        </button>
      </div>
    </div>
  );
}

export function TrustSignals({
  items = [
    {
      label: "Secure API",
      icon: <ShieldCheck size={14} />,
    },
    {
      label: "Encrypted data",
      icon: <LockKeyhole size={14} />,
    },
    {
      label: "AI-powered replies",
      icon: <Bot size={14} />,
    },
  ],
  className = "",
}: {
  items?: Array<{
    label: string;
    icon?: ReactNode;
  }>;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => (
        <span
          key={item.label}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/86 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"
        >
          <span className="text-blue-600">{item.icon}</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}
