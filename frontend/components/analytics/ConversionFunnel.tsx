"use client";

import { useFunnel } from "@/lib/useAnalytics";

export default function ConversionFunnel() {
  const { data, isLoading } = useFunnel();

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const stages = (data ?? []).map((stage) => ({
    label: stage.label,
    value: stage.count,
  }));

  const max = Math.max(...stages.map(s => s.value || 0));

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
      
      <h2 className="text-sm font-semibold text-gray-800 mb-4">
        Conversion Funnel
      </h2>

      <div className="space-y-4">
        {stages.map((s, i) => {
          const percent = max ? (s.value / max) * 100 : 0;

          return (
            <div key={i} className="space-y-1">
              
              {/* LABEL + VALUE */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{s.label}</span>
                <span className="font-semibold text-gray-900">
                  {s.value}
                </span>
              </div>

              {/* 🔥 PROGRESS BAR */}
              <div className="w-full h-2 bg-blue-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
