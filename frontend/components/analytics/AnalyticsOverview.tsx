"use client";

import { useOverview } from "@/lib/useAnalytics";
import StatCard from "./StatCard";

export default function AnalyticsOverview({ range }: any) {
  const { data, isLoading } = useOverview(range);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const stats = [
    { title: "Total Leads", value: data.totalLeads, change: "+0%" },
    { title: "Messages", value: data.messages, change: "+0%" },
    { title: "AI Replies", value: data.aiReplies, change: "+0%" },
    { title: "Bookings", value: data.bookings, change: "+0%" }
  ];

  return (
    <div className="grid md:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <StatCard key={i} stat={s} />
      ))}
    </div>
  );
}