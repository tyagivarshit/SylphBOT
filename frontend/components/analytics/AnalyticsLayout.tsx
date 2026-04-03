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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-semibold text-gray-800">
          Analytics
        </h1>

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