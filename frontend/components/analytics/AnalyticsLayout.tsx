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
      {/* 🔥 text default dark */}

      <DateFilter range={range} setRange={setRange} />

      <AnalyticsOverview range={range} />
      <AnalyticsCharts range={range} />

      <div className="grid md:grid-cols-2 gap-6">
        <ConversionFunnel />
        <TopSources />
      </div>
    </div>
  );
}