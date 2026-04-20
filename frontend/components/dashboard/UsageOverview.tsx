"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bot, MessageSquare, Sparkles, Users } from "lucide-react";
import { buildApiUrl } from "@/lib/url";

type UsagePayload = {
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
      dailyRemaining?: number | null;
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
  if (percent >= 85) {
    return "from-amber-500 to-orange-500";
  }

  if (percent >= 60) {
    return "from-blue-500 to-cyan-500";
  }

  return "from-emerald-500 to-teal-500";
};

export default function UsageOverview() {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadUsage = async () => {
      try {
        const res = await fetch(buildApiUrl("/api/usage"), {
          credentials: "include",
          cache: "no-store",
        });

        const payload = await res.json().catch(() => null);

        if (!mounted || !res.ok || !payload || payload.success === false) {
          return;
        }

        setUsage(payload);
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
  }, []);

  if (loading) {
    return (
      <div className="brand-panel overflow-hidden rounded-[26px] p-6 text-sm text-slate-500">
        Loading usage...
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const aiPercent = getPercent(usage.ai.usedToday, usage.ai.limit);
  const cards: UsageCardItem[] = [
    {
      label: "Remaining AI today",
      value: `${usage.ai.remaining ?? 0}`,
      helper: `${usage.ai.usedToday} / ${usage.ai.limit} used`,
      percent: aiPercent,
      icon: <Bot size={16} />,
    },
    {
      label: "AI this month",
      value: `${usage.usage.ai.monthlyUsed} / ${usage.usage.ai.monthlyLimit}`,
      helper: "Monthly runway available",
      percent: getPercent(
        usage.usage.ai.monthlyUsed,
        usage.usage.ai.monthlyLimit
      ),
      icon: <Sparkles size={16} />,
    },
    {
      label: "Contacts",
      value: `${usage.usage.contacts.used} / ${usage.usage.contacts.limit}`,
      helper: "Audience capacity in your plan",
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

  const showWarning = Boolean(usage.warning || usage.usage.ai.warning);
  const planLabel = usage.planLabel || usage.plan;

  return (
    <div className="brand-section-shell space-y-5 rounded-[28px] p-5 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Monetization
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            AI and growth usage
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {usage.trialActive
              ? `${usage.daysLeft} day${usage.daysLeft === 1 ? "" : "s"} left in your trial`
              : showWarning
                ? usage.warningMessage || "You have used 80% of your daily AI limit."
                : "Smart AI usage included with room to grow."}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Remaining AI calls today: {usage.ai.remaining ?? 0}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Plan {planLabel}
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            AI credits {usage.addonCredits ?? usage.addons.aiCredits}
          </span>
        </div>
      </div>

      {showWarning ? (
        <div className="rounded-[22px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-medium text-amber-900">
          {usage.warningMessage || "You have used 80% of your daily AI limit."}
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
              Need more? Buy AI credits anytime
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Current AI usage: {usage.ai.usedToday} / {usage.ai.limit} today
            </p>
          </div>

          <Link
            href="/billing"
            className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,#081223_0%,#0b2a5b_55%,#1e5eff_100%)] px-4 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg"
          >
            Buy extra AI calls
          </Link>
        </div>
      </div>
    </div>
  );
}
