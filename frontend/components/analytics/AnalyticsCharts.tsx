"use client";

import { useCharts } from "@/lib/useAnalytics";
import LeadsChart from "@/components/charts/LeadsCharts";

export default function AnalyticsCharts({ range }: any) {
  const { data, isLoading } = useCharts(range);

  if (isLoading) return <p className="text-gray-600">Loading...</p>;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Lead Growth
        </h2>
        <LeadsChart data={data} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Message Activity
        </h2>
        <LeadsChart data={data} />
      </div>
    </div>
  );
}