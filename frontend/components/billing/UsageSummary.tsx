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
};

/* ================= HELPERS ================= */

const getColor = (percent: number) => {
  if (percent < 60) return "bg-green-500";
  if (percent < 85) return "bg-yellow-500";
  return "bg-red-500";
};

/* ================= COMPONENT ================= */

export default function UsageSummary({
  aiUsed = 0,
  aiLimit = null,
  msgUsed = 0,
  msgLimit = null,
}: Props) {
  const items: Item[] = [
    {
      label: "AI Calls",
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

  return (
    <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-sm space-y-6">

      {/* HEADER */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Usage Overview
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Track your monthly usage limits
        </p>
      </div>

      {/* ITEMS */}
      <div className="space-y-5">
        {items.map((item) => {
          const percent = item.limit
            ? Math.min((item.used / item.limit) * 100, 100)
            : 100;

          return (
            <div key={item.label} className="space-y-2">

              {/* TOP ROW */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-800 font-medium">
                  <span className="text-gray-500">{item.icon}</span>
                  {item.label}
                </div>

                <span className="text-xs text-gray-600">
                  {item.limit
                    ? `${item.used}/${item.limit}`
                    : "Unlimited"}
                </span>
              </div>

              {/* PROGRESS */}
              <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getColor(percent)} transition-all duration-500`}
                  style={{ width: `${percent}%` }}
                />
              </div>

              {/* FOOT */}
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>
                  {item.limit ? `${Math.round(percent)}% used` : "No limits"}
                </span>

                {!item.limit && (
                  <span className="text-green-600 font-medium">
                    Unlimited
                  </span>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}