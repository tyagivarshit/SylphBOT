"use client";

import { useCharts } from "@/lib/useAnalytics";
import LeadsChart from "@/components/charts/LeadsCharts";

export default function AnalyticsCharts({ range }: any) {
  const { data, isLoading } = useCharts(range);

  if (isLoading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="grid md:grid-cols-2 gap-6">

      {/* 🔥 CARD 1 */}
      <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">
          Lead Growth
        </h2>
        <LeadsChart data={data ?? []} />
      </div>

      {/* 🔥 CARD 2 */}
      <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">
          Message Activity
        </h2>
        <LeadsChart data={data ?? []} />
      </div>

    </div>
  );
}
