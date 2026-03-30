"use client";

import { ReactNode } from "react";
import { Zap, MessageSquare } from "lucide-react";

/* ================= TYPES ================= */

type Item = {
  label: string;
  icon: ReactNode;
  used: number;
  limit: number | null;
};

type Props = {
  aiUsed?: number;
  aiLimit?: number | null;
  msgUsed?: number;
  msgLimit?: number | null;
  planKey?: string; // 🔥 NEW (backend aligned)
};

/* ================= HELPERS ================= */

const getColor = (percent: number) => {
  if (percent < 60) return "from-green-400 to-green-600";
  if (percent < 85) return "from-yellow-400 to-yellow-600";
  return "from-red-400 to-red-600";
};

/* ================= COMPONENT ================= */

export default function UsageSummary({
  aiUsed = 0,
  aiLimit = null,
  msgUsed = 0,
  msgLimit = null,
  planKey = "FREE_LOCKED",
}: Props) {
  const items: Item[] = [
    {
      label: "AI Usage",
      icon: <Zap size={16} />,
      used: aiUsed,
      limit: aiLimit,
    },
    {
      label: "Messages",
      icon: <MessageSquare size={16} />,
      used: msgUsed,
      limit: msgLimit,
    },
  ];

  const isFreeLocked = planKey === "FREE_LOCKED";

  return (
    <div className="bg-white/80 backdrop-blur border border-gray-200 rounded-2xl p-5 md:p-6 shadow-sm space-y-6">

      {/* HEADER */}
      <div>
        <h3 className="text-sm md:text-base font-semibold text-gray-900">
          Usage Overview
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Monitor your usage based on your current plan
        </p>
      </div>

      {/* ITEMS */}
      <div className="space-y-6">

        {items.map((item) => {
          const percent = item.limit
            ? Math.min((item.used / item.limit) * 100, 100)
            : 0;

          const nearLimit = percent >= 80;

          return (
            <div
              key={item.label}
              className="space-y-3 p-4 rounded-xl bg-white border border-gray-100 shadow-sm"
            >

              {/* TOP */}
              <div className="flex items-center justify-between">

                <div className="flex items-center gap-2 text-gray-800 font-medium text-sm">
                  <span className="text-gray-400">{item.icon}</span>
                  {item.label}
                </div>

                <span className="text-xs text-gray-600 font-medium">
                  {isFreeLocked
                    ? "Locked"
                    : item.limit
                    ? `${item.used}/${item.limit}`
                    : "Unlimited"}
                </span>

              </div>

              {/* PROGRESS BAR */}
              <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${getColor(
                    percent
                  )} transition-all duration-700 ${
                    isFreeLocked ? "opacity-40" : ""
                  }`}
                  style={{ width: `${isFreeLocked ? 0 : percent}%` }}
                />
              </div>

              {/* FOOT */}
              <div className="flex justify-between items-center text-[11px] text-gray-500">

                <span>
                  {isFreeLocked
                    ? "Upgrade to unlock usage"
                    : item.limit
                    ? `${Math.round(percent)}% used`
                    : "No limits"}
                </span>

                {item.limit && nearLimit && !isFreeLocked && (
                  <span className="text-red-500 font-medium">
                    ⚠ Near limit
                  </span>
                )}

                {!item.limit && !isFreeLocked && (
                  <span className="text-green-600 font-medium">
                    Unlimited
                  </span>
                )}

              </div>

            </div>
          );
        })}

      </div>

      {/* 🔥 UPSELL BOX */}
      {isFreeLocked && (
        <div className="bg-gradient-to-r from-[#14E1C1]/10 to-blue-500/10 border border-[#14E1C1]/30 rounded-xl p-4 text-xs text-gray-700 flex items-center justify-between">

          <span>
            Unlock full access by choosing a plan 🚀
          </span>

          <span className="font-semibold text-[#14E1C1] cursor-pointer">
            View Plans →
          </span>

        </div>
      )}

      {!isFreeLocked && (
        <div className="bg-gradient-to-r from-[#14E1C1]/10 to-blue-500/10 border border-[#14E1C1]/30 rounded-xl p-4 text-xs text-gray-700 flex items-center justify-between">

          <span>
            Need higher limits? Upgrade your plan 🚀
          </span>

          <span className="font-semibold text-[#14E1C1] cursor-pointer">
            Upgrade →
          </span>

        </div>
      )}

    </div>
  );
}