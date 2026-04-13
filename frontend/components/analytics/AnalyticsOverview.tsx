"use client";

import { useOverview } from "@/lib/useAnalytics";
import type { AnalyticsMetric } from "@/lib/analytics";
import StatCard from "./StatCard";

const EMPTY_METRIC: AnalyticsMetric = {
  value: 0,
  previous: 0,
  delta: 0,
  trend: "flat",
  format: "number",
  improvedWhen: "higher",
};

export default function AnalyticsOverview({ range }: any) {
  const { data, isLoading } = useOverview(range);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const stats = [
    {
      title: "Total Leads",
      helper: "All captured leads in the selected range.",
      metric: data?.leadsCaptured ?? EMPTY_METRIC,
    },
    {
      title: "Qualified Leads",
      helper: "Leads that moved into a qualified state.",
      metric: data?.qualifiedLeads ?? EMPTY_METRIC,
    },
    {
      title: "Bookings",
      helper: "Meetings booked from active conversations.",
      metric: data?.bookedMeetings ?? EMPTY_METRIC,
    },
    {
      title: "AI Reply Share",
      helper: "Share of replies handled by AI.",
      metric: data?.aiReplyShare ?? EMPTY_METRIC,
    }
  ];

  return (
    <div className="grid md:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <StatCard key={i} stat={s} />
      ))}
    </div>
  );
}
