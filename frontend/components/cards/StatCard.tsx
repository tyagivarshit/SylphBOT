"use client";

import React from "react";

type Props = {
  title: string;
  value: number | string | null | undefined;
  icon?: React.ReactNode;
  trend?: string | number; // 🔥 support number also
};

export default function StatCard({
  title,
  value,
  icon,
  trend,
}: Props) {

  /* ================================
  🔥 SAFE VALUE
  ================================ */

  const displayValue =
    value === null ||
    value === undefined ||
    value === "" ||
    Number.isNaN(value)
      ? 0
      : value;

  /* ================================
  🔥 TREND LOGIC (SMART)
  ================================ */

  let trendValue: number | null = null;

  if (typeof trend === "number") {
    trendValue = trend;
  } else if (typeof trend === "string") {
    const parsed = parseFloat(trend.replace("%", ""));
    if (!isNaN(parsed)) trendValue = parsed;
  }

  const isNegative = trendValue !== null && trendValue < 0;

  const trendText =
    trendValue !== null
      ? `${trendValue > 0 ? "+" : ""}${trendValue}%`
      : trend;

  /* ================================
  🚀 UI
  ================================ */

  return (
    <div
      className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-lg transition flex items-center justify-between"
      aria-label={`${title} stat`}
    >

      {/* LEFT */}
      <div className="min-w-0">

        <p className="text-sm text-gray-500 truncate">
          {title}
        </p>

        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mt-1">
          {displayValue}
        </h2>

        {trendText && (
          <p
            className={`text-xs mt-1 font-medium ${
              isNegative ? "text-red-600" : "text-green-700"
            }`}
          >
            {trendText}
          </p>
        )}

      </div>

      {/* RIGHT ICON */}
      {icon && (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
          {icon}
        </div>
      )}

    </div>
  );
}