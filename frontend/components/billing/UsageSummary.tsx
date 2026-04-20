"use client";

import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, Bot, MessageSquare, Users } from "lucide-react";

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
    return "from-amber-500 to-orange-500";
  }

  if (percent >= 75) {
    return "from-blue-500 to-cyan-500";
  }

  return "from-emerald-500 to-teal-500";
};

const getMessage = (percent: number) => {
  if (percent >= 85) {
    return "Daily AI usage is close to the plan limit.";
  }

  if (percent >= 50) {
    return "Smart AI usage included for steady growth.";
  }

  return "Plenty of room to keep momentum high.";
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

  const meters: MeterItem[] = [
    {
      label: "Remaining AI today",
      helper: `${summary.ai.usedToday} / ${summary.ai.limit} used`,
      icon: <Bot size={16} />,
      used: summary.ai.usedToday,
      limit: summary.ai.limit,
      value: `${summary.ai.remaining ?? 0}`,
    },
    {
      label: "AI this month",
      helper: "Monthly AI runway",
      icon: <BarChart3 size={16} />,
      used: summary.usage.ai.monthlyUsed,
      limit: summary.usage.ai.monthlyLimit,
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

  const aiDailyPercent = toPercent(summary.ai.usedToday, summary.ai.limit);
  const showWarning = Boolean(summary.warning || summary.usage.ai.warning);
  const planLabel = summary.planLabel || summary.plan;

  return (
    <div className="brand-section-shell space-y-6 rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900">
            Usage overview
          </h3>
          <p className="text-sm text-gray-500">
            Remaining AI calls today: {summary.ai.remaining ?? 0}. Add-on credits are used once the daily plan limit is exhausted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
            Plan: {planLabel}
          </span>
          {summary.trialActive && (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
              Trial: {summary.daysLeft} day{summary.daysLeft === 1 ? "" : "s"} left
            </span>
          )}
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
            AI add-ons: {summary.addonCredits ?? summary.addons.aiCredits}
          </span>
        </div>
      </div>

      {showWarning ? (
        <div className="flex items-start gap-3 rounded-[22px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {summary.warningMessage || "You have used 80% of your daily AI limit."}
          </span>
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
                {unlimited ? "High-volume plan active." : getMessage(percent)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="rounded-[22px] border border-blue-200 bg-[linear-gradient(135deg,rgba(8,18,35,0.92),rgba(30,94,255,0.9),rgba(77,163,255,0.88))] p-5 text-white shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {summary.trialActive
                ? `${summary.daysLeft} day${summary.daysLeft === 1 ? "" : "s"} left in your trial`
                : "Need more? Buy AI credits anytime"}
            </p>
            <p className="mt-1 text-sm text-blue-50/90">
              AI usage today: {summary.ai.usedToday} / {summary.ai.limit}
            </p>
          </div>

          <a
            href={ctaHref}
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:shadow-lg"
          >
            {aiDailyPercent >= 80 || !summary.trialActive ? "Buy extra AI calls" : "See billing"}
          </a>
        </div>
      </div>
    </div>
  );
}
