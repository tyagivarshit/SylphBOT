"use client";

import type { AnalyticsMetric } from "@/lib/analytics";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

type StatCardProps = {
  stat: {
    title: string;
    helper: string;
    metric: AnalyticsMetric;
  };
};

function formatMetric(metric: AnalyticsMetric) {
  if (metric.format === "percent") {
    return `${metric.value}%`;
  }

  if (metric.format === "minutes") {
    return `${metric.value}m`;
  }

  return Intl.NumberFormat("en-US").format(metric.value);
}

function formatDelta(metric: AnalyticsMetric) {
  const prefix = metric.delta > 0 ? "+" : "";
  return `${prefix}${metric.delta}% vs prev`;
}

export default function StatCard({ stat }: StatCardProps) {
  const isGood =
    stat.metric.trend === "flat"
      ? null
      : stat.metric.improvedWhen === "higher"
      ? stat.metric.trend === "up"
      : stat.metric.trend === "down";

  const deltaTone =
    isGood === null
      ? "bg-slate-100 text-slate-600"
      : isGood
      ? "bg-emerald-100 text-emerald-700"
      : "bg-rose-100 text-rose-700";

  const Icon =
    stat.metric.trend === "up"
      ? ArrowUpRight
      : stat.metric.trend === "down"
      ? ArrowDownRight
      : Minus;

  return (
    <div className="relative bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition overflow-hidden">
      
      {/* 🔥 subtle gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 pointer-events-none" />

      {/* 🔥 CONTENT */}
      <div className="relative z-10">
        
        {/* TITLE */}
        <p className="text-xs font-medium text-gray-500">
          {stat.title}
        </p>

        {/* VALUE + CHANGE */}
        <div className="flex items-end justify-between mt-2 gap-3">
          
          <p className="text-2xl font-bold text-gray-900 tracking-tight">
            {formatMetric(stat.metric)}
          </p>

          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md ${deltaTone}`}
          >
            <Icon size={12} />
            {formatDelta(stat.metric)}
          </span>

        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          {stat.helper}
        </p>

      </div>
    </div>
  );
}
