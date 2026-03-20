"use client";

import { useSources } from "@/lib/useAnalytics";

export default function TopSources() {
  const { data, isLoading } = useSources();

  if (isLoading) return <p className="text-gray-600">Loading...</p>;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">
        Top Lead Sources
      </h2>

      <div className="space-y-3">
        {data.map((s: any, i: number) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">
              {s.name}
            </span>
            <span className="font-medium text-gray-900">
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}