"use client";

import { useEffect, useState } from "react";
import { getUsageOverview, type UsageOverviewData } from "@/lib/usage.service";

export default function UsageMeter() {
  const [usage, setUsage] = useState<UsageOverviewData | null>(null);

  useEffect(() => {
    void getUsageOverview()
      .then((payload) => {
        if (payload) {
          setUsage(payload);
        }
      })
      .catch(() => undefined);
  }, []);

  if (!usage) {
    return null;
  }

  const used = usage.ai.usedToday || 0;
  const limit = usage.ai.limit || 0;
  const remaining = usage.ai.remaining ?? 0;
  const extraCredits = usage.addonCredits ?? usage.addons.aiCredits ?? 0;
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  return (
    <div className="rounded-lg border bg-gray-50 p-3 text-xs">
      <p className="font-medium">AI Used Today: {used} / {limit}</p>
      <p className="mt-1 text-gray-500">AI Remaining: {remaining}</p>
      <p className="mt-1 text-gray-500">Extra Credits: {extraCredits}</p>

      <div className="mt-2 h-2 w-full rounded bg-gray-200">
        <div
          className="h-2 rounded bg-blue-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
