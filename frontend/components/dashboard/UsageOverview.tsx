"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Bot, MessageSquare, Sparkles, Users } from "lucide-react";
import { useUpgrade } from "@/app/(dashboard)/layout";
import { getUsageOverview, type UsageOverviewData } from "@/lib/usage.service";
import { getUsagePresentation } from "@/lib/usagePresentation";
import {
  RetryState,
  SkeletonCard,
  TrustSignals,
} from "@/components/ui/feedback";

type UsageCardItem = {
  label: string;
  value: string;
  helper: string;
  percent: number;
  icon: ReactNode;
};

const getPercent = (used: number, limit: number) => {
  if (!limit || limit < 0) {
    return 0;
  }

  return Math.min(Math.round((used / limit) * 100), 100);
};

const getTone = (percent: number) => {
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

export default function UsageOverview() {
  const { openUpgrade } = useUpgrade();
  const [usage, setUsage] = useState<UsageOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadUsage = async () => {
      try {
        setLoading(true);
        setError("");

        const payload = await getUsageOverview();

        if (!mounted) {
          return;
        }

        if (!payload) {
          throw new Error("We couldn't load your usage overview right now.");
        }

        setUsage(payload);
      } catch (loadError) {
        if (!mounted) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "We couldn't load your usage overview right now."
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadUsage();

    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} className="h-36" />
          ))}
        </div>
        <SkeletonCard className="h-28" />
      </div>
    );
  }

  if (error) {
    return (
      <RetryState
        title="Usage overview unavailable"
        description={error}
        onRetry={() => setReloadKey((current) => current + 1)}
      />
    );
  }

  if (!usage) {
    return null;
  }

  const usageState = getUsagePresentation(usage);

  const cards: UsageCardItem[] = [
    {
      label: "AI replies used today",
      value: `${usageState.aiUsedToday} / ${usageState.aiLimit}`,
      helper: `${usageState.aiPercent}% of today's AI allowance`,
      percent: usageState.aiPercent,
      icon: <Bot size={16} />,
    },
    {
      label: "AI replies remaining",
      value: `${usageState.aiRemaining}`,
      helper: "Left before extra credits are needed",
      percent: usageState.aiPercent,
      icon: <Sparkles size={16} />,
    },
    {
      label: "Contacts",
      value: `${usage.usage.contacts.used} / ${usage.usage.contacts.limit}`,
      helper: "Audience capacity included in your plan",
      percent: getPercent(usage.usage.contacts.used, usage.usage.contacts.limit),
      icon: <Users size={16} />,
    },
    {
      label: "Messages",
      value:
        usage.usage.messages.limit === -1
          ? `${usage.usage.messages.used} / Unlimited`
          : `${usage.usage.messages.used} / ${usage.usage.messages.limit}`,
      helper: "Conversation delivery included",
      percent:
        usage.usage.messages.limit === -1
          ? 0
          : getPercent(usage.usage.messages.used, usage.usage.messages.limit),
      icon: <MessageSquare size={16} />,
    },
  ];

  return (
    <div className="brand-section-shell space-y-5 rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Monetization
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            AI usage visibility
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {usage.trialActive
              ? `${usage.daysLeft} day${usage.daysLeft === 1 ? "" : "s"} left in your trial`
              : "AI replies use credits. Template replies stay free."}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">{usageState.notice.title}</p>
              <p className="mt-1 text-sm leading-6">
                {usageState.notice.message}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/billing" className="brand-button-secondary">
                Buy Credits
              </Link>
              <button
                type="button"
                onClick={() =>
                  openUpgrade({
                    variant:
                      usageState.notice?.tone === "danger"
                        ? "usage_limit"
                        : "feature",
                    title: usageState.notice?.title,
                    description: usageState.notice?.message,
                    remainingCredits: usageState.aiRemaining,
                    addonCredits: usageState.addonCredits,
                  })
                }
                className="brand-button-primary"
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-[22px] border border-slate-200/80 bg-white/84 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
              <span className="flex items-center gap-2">
                <span className="text-blue-600">{card.icon}</span>
                {card.label}
              </span>
              <span className="text-xs text-slate-500">{card.value}</span>
            </div>

            <p className="mt-3 text-xs text-slate-500">{card.helper}</p>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${getTone(card.percent)} transition-all duration-500`}
                style={{
                  width:
                    card.label === "Messages" && usage.usage.messages.limit === -1
                      ? "100%"
                      : `${card.percent}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] border border-slate-200/80 bg-white/84 p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">
              Stay ahead of reply limits
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Keep replies flowing with extra credits now, or upgrade for a larger daily allowance.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/billing" className="brand-button-secondary">
              Buy Credits
            </Link>
            <button
              type="button"
              onClick={() =>
                openUpgrade({
                  variant: usageState.aiDisabled ? "usage_limit" : "feature",
                  title: usageState.notice?.title,
                  description: usageState.notice?.message,
                  remainingCredits: usageState.aiRemaining,
                  addonCredits: usageState.addonCredits,
                })
              }
              className="brand-button-primary"
            >
              Upgrade Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
