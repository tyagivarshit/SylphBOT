"use client";

import { useOverview } from "@/lib/useAnalytics";
import StatCard from "./StatCard";

export default function AnalyticsOverview({ range }: any) {
  const { data, isLoading } = useOverview(range);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const summary = data ?? {
    totalLeads: 0,
    messages: 0,
    aiReplies: 0,
    bookings: 0,
  };

  const stats = [
    { title: "Total Leads", value: summary.totalLeads, change: "+0%" },
    { title: "Messages", value: summary.messages, change: "+0%" },
    { title: "AI Replies", value: summary.aiReplies, change: "+0%" },
    { title: "Bookings", value: summary.bookings, change: "+0%" }
  ];

  return (
    <div className="grid md:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <StatCard key={i} stat={s} />
      ))}
    </div>
  );
}
