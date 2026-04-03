"use client";

import { useSources } from "@/lib/useAnalytics";

export default function TopSources() {
  const { data, isLoading } = useSources();

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const max = Math.max(...data.map((s: any) => s.value || 0));

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-blue-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition">
      
      <h2 className="text-sm font-semibold text-gray-800 mb-4">
        Top Lead Sources
      </h2>

      <div className="space-y-4">
        {data.map((s: any, i: number) => {
          const percent = max ? (s.value / max) * 100 : 0;

          return (
            <div key={i} className="space-y-1">
              
              {/* LABEL + VALUE */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {s.name}
                </span>
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