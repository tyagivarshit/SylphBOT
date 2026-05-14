"use client";

import { useState } from "react";
import DateFilter from "./DateFilter";
import AnalyticsOverview from "./AnalyticsOverview";
import AnalyticsCharts from "./AnalyticsCharts";
import ConversionFunnel from "./ConversionFunnel";
import TopSources from "./TopSources";

export default function AnalyticsLayout() {
  const [range, setRange] = useState("7d");

  return (
    <div className="space-y-6 text-gray-900">

      {/* 🔥 HEADER WRAPPER (optional feel upgrade) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Reporting range
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Compare short-term spikes and longer trend lines without repeating
            the page title.
          </p>
        </div>

        <DateFilter range={range} setRange={setRange} />
      </div>

      {/* 🔥 OVERVIEW */}
      <AnalyticsOverview range={range} />

      {/* 🔥 CHARTS */}
      <AnalyticsCharts range={range} />

      {/* 🔥 BOTTOM GRID */}
      <div className="grid md:grid-cols-2 gap-6">
        <ConversionFunnel />
        <TopSources />
      </div>

    </div>
  );
}
