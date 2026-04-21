"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bot, MessageSquare, Sparkles, Users } from "lucide-react";
import { getUsagePresentation } from "@/lib/usagePresentation";
import { TrustSignals } from "@/components/ui/feedback";

type UsageSummaryData = {
  plan: string;
  planLabel?: string;
  trialActive: boolean;
  daysLeft: number;
  warning?: boolean;
  warningMessage?: string | null;
  addonCredits?: number;
  ai: {
    usedToday: number;
    limit: number;
    remaining: number | null;
  };
  usage: {
    ai: {
      used: number;
      dailyLimit: number;
      monthlyUsed: number;
      monthlyLimit: number;
      warning?: boolean;
    };
    contacts: {
      used: number;
      limit: number;
    };
    messages: {
      used: number;
      limit: number;
    };
  };
  addons: {
    aiCredits: number;
    contacts?: number;
  };
};

type MeterItem = {
  label: string;
  helper: string;
  icon: ReactNode;
  used: number;
  limit: number;
  value?: string;
};

const toPercent = (used: number, limit: number) => {
  if (limit <= 0 || limit === -1) {
    return 0;
  }

  return Math.min(Math.round((used / limit) * 100), 100);
};

const getAccent = (percent: number) => {
  if (percent >= 90) {
    return "from-rose-500 to-orange-500";
  }

  if (percent >= 80) {
    return "from-amber-500 to-orange-500";
  }

  if (percent >= 50) {
    return "from-blue-500 to-cyan-500";
  }

  return "from-emerald-500 to-teal-500";
};

const getMessage = (percent: number, label: string) => {
  if (label === "AI replies remaining today") {
    return "Available before extra credits are needed.";
  }

  if (percent >= 90) {
    return "You are very close to the limit.";
  }

  if (percent >= 50) {
    return "Usage is healthy and visible.";
  }

  return "You still have room to grow.";
};

export default function UsageSummary({
  summary,
  ctaHref = "/billing",
}: {
  summary?: UsageSummaryData | null;
  ctaHref?: string;
}) {
  if (!summary) {
    return null;
  }

  const usageState = getUsagePresentation(summary);

  const meters: MeterItem[] = [
    {
      label: "AI replies used today",
      helper: "Credits consumed from today's AI allowance",
      icon: <Bot size={16} />,
      used: usageState.aiUsedToday,
      limit: usageState.aiLimit,
      value: `${usageState.aiUsedToday} / ${usageState.aiLimit}`,
    },
    {
      label: "AI replies remaining today",
      helper: "Available before extra credits are needed",
      icon: <Sparkles size={16} />,
      used: usageState.aiUsedToday,
      limit: usageState.aiLimit,
      value: `${usageState.aiRemaining}`,
    },
    {
      label: "Contacts",
      helper: "Audience capacity included",
      icon: <Users size={16} />,
      used: summary.usage.contacts.used,
      limit: summary.usage.contacts.limit,
    },
    {
      label: "Messages",
      helper: "Conversation delivery included",
      icon: <MessageSquare size={16} />,
      used: summary.usage.messages.used,
      limit: summary.usage.messages.limit,
    },
  ];

  return (
    <div className="brand-section-shell space-y-6 rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-gray-900">
            Usage overview
          </h3>
          <p className="text-sm text-gray-500">
            AI replies use credits. Template replies stay free.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              AI used today: {usageState.aiUsedToday}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
              Remaining: {usageState.aiRemaining}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
              Extra credits: {usageState.addonCredits}
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700">
              Plan: {usageState.planLabel}
            </span>
            {summary.trialActive ? (
              <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                Trial: {summary.daysLeft} day{summary.daysLeft === 1 ? "" : "s"} left
              </span>
            ) : null}
          </div>

          <TrustSignals />
        </div>
      </div>

      {usageState.notice ? (
        <div
          className={`rounded-[22px] border px-4 py-4 ${
            usageState.notice.tone === "danger"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <p className="text-sm font-semibold">{usageState.notice.title}</p>
          <p className="mt-1 text-sm leading-6">{usageState.notice.message}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {meters.map((item) => {
          const unlimited = item.limit === -1;
          const percent = unlimited ? 0 : toPercent(item.used, item.limit);

          return (
            <div
              key={item.label}
              className="rounded-[22px] border border-slate-200/80 bg-white/84 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="text-blue-600">{item.icon}</span>
                  {item.label}
                </div>
                <span className="text-xs font-semibold text-gray-500">
                  {item.value || (unlimited ? "Unlimited" : `${item.used} / ${item.limit}`)}
                </span>
              </div>

              <p className="mt-2 text-xs text-gray-500">{item.helper}</p>

              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${getAccent(percent)} transition-all duration-500`}
                  style={{ width: unlimited ? "100%" : `${percent}%` }}
                />
              </div>

              <p className="mt-3 text-xs font-medium text-slate-600">
                {unlimited ? "High-volume plan active." : getMessage(percent, item.label)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-[22px] border border-blue-200 bg-[linear-gradient(135deg,rgba(8,18,35,0.92),rgba(30,94,255,0.9),rgba(77,163,255,0.88))] p-5 text-white shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">Stay ready for the next wave of replies</p>
            <p className="mt-1 text-sm text-blue-50/90">
              Top up credits for immediate capacity, or jump to a higher plan for more included AI replies.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:shadow-lg"
            >
              Buy Credits
            </Link>
            <Link
              href="/billing#plans"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Upgrade Plan
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
