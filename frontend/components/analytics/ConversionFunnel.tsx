"use client";

import { useFunnel } from "@/lib/useAnalytics";

export default function ConversionFunnel() {
  const { data, isLoading } = useFunnel();

  if (isLoading) return <p className="text-gray-600">Loading...</p>;

  const stages = [
    { label: "Leads", value: data.leads },
    { label: "Interested", value: data.interested },
    { label: "Qualified", value: data.qualified },
    { label: "Booked", value: data.booked }
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">
        Conversion Funnel
      </h2>

      <div className="space-y-3">
        {stages.map((s, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">{s.label}</span>
            <span className="font-medium text-gray-900">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}