"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LeadsChart from "@/components/charts/LeadsCharts";
import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  withCredentials: true,
});

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<any>(null);
  const [convo, setConvo] = useState<any>(null);
  const [limited, setLimited] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [statsRes, convoRes] = await Promise.all([
          api.get("/api/dashboard/stats"),
          api.get("/api/dashboard/active-conversations"),
        ]);

        setStats(statsRes.data.data);
        setConvo(convoRes.data.data);

        if (statsRes.data.limited || convoRes.data.limited) {
          setLimited(true);
        }
      } catch (err) {
        console.error("Dashboard error", err);
      }
    };

    fetchData();
  }, [user]);

  if (loading || !stats)
    return <div className="p-4 text-gray-900">Loading...</div>;
  if (!user) return null;

  const usagePercent = Math.min(
    Math.round(stats.usagePercent * 100),
    100
  );

  return (
    <div className="w-full bg-gradient-to-br from-white via-blue-50 to-cyan-50 min-h-screen relative">

      {/* 🔒 LIMIT OVERLAY */}
      {limited && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-white/80 backdrop-blur-xl border border-blue-100 p-6 rounded-2xl text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Upgrade Required 🔒
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              You’ve reached your plan limit
            </p>
            <button className="mt-4 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition">
              Upgrade Plan
            </button>
          </div>
        </div>
      )}

      {/* ================= MOBILE ================= */}
      <div className="md:hidden p-3 space-y-4">

        <div className="grid grid-cols-2 gap-3">
          <MiniCard title="Leads" value={stats.totalLeads} />
          <MiniCard title="Today" value={stats.leadsToday} />
          <MiniCard title="Month" value={stats.leadsThisMonth} />
          <MiniCard title="Msgs" value={stats.messagesToday} />
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 font-medium">AI Usage</p>
          <h2 className="text-base font-bold text-gray-900">
            {stats.aiCallsUsed} /{" "}
            {stats.isUnlimited ? "∞" : stats.aiCallsLimit}
          </h2>

          <div className="w-full h-2 bg-blue-50 rounded-full mt-3">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>

        {convo && (
          <div className="grid grid-cols-3 gap-3">
            <MiniCard title="Active" value={convo.active} />
            <MiniCard title="Waiting" value={convo.waitingReplies} />
            <MiniCard title="Done" value={convo.resolved} />
          </div>
        )}

        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4">
          <LeadsChart data={stats.chartData} />
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Activity
          </h2>

          {stats.recentActivity.map((item: any) => (
            <div key={item.id} className="py-2 border-b border-blue-100 last:border-none">
              <p className="text-xs text-gray-900">{item.text}</p>
              <span className="text-[10px] text-gray-500">
                {new Date(item.time).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>

      </div>

      {/* ================= DESKTOP ================= */}
      <div className="hidden md:block p-6 space-y-8">

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <Card title="Total Leads" value={stats.totalLeads} />
          <Card title="Today" value={stats.leadsToday} />
          <Card title="This Month" value={stats.leadsThisMonth} />
          <Card title="Messages" value={stats.messagesToday} />
          <Card title="Qualified" value={stats.qualifiedLeads} />
          <Card title="Plan" value={stats.plan} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">
              Leads Growth
            </h2>
            <LeadsChart data={stats.chartData} />
          </div>

          <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
            <p className="text-sm text-gray-500 font-medium">
              AI Usage
            </p>
            <h2 className="text-2xl font-bold text-gray-900">
              {stats.aiCallsUsed} /{" "}
              {stats.isUnlimited ? "∞" : stats.aiCallsLimit}
            </h2>

            <div className="w-full h-2 bg-blue-50 rounded-full mt-3">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-full"
                style={{ width: `${usagePercent}%` }}
              />
            </div>

            {stats.nearLimit && (
              <p className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md inline-block mt-3">
                Near usage limit ⚠️
              </p>
            )}
          </div>

        </div>

        {convo && (
          <div className="grid grid-cols-3 gap-4">
            <Card title="Active" value={convo.active} />
            <Card title="Waiting Replies" value={convo.waitingReplies} />
            <Card title="Resolved" value={convo.resolved} />
          </div>
        )}

        <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">
            Recent Activity
          </h2>

          {stats.recentActivity.map((item: any) => (
            <div key={item.id} className="flex justify-between py-3 border-b border-blue-100 last:border-none">
              <p className="text-gray-900 text-sm">{item.text}</p>
              <span className="text-sm text-gray-500">
                {new Date(item.time).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* COMPONENTS */

function Card({ title, value }: any) {
  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <h2 className="text-xl font-semibold text-gray-900 mt-1">{value}</h2>
    </div>
  );
}

function MiniCard({ title, value }: any) {
  return (
    <div className="bg-white/80 backdrop-blur-xl border border-blue-100 rounded-xl p-3 shadow-sm">
      <p className="text-[10px] text-gray-500 font-medium">{title}</p>
      <h2 className="text-sm font-semibold text-gray-900">{value}</h2>
    </div>
  );
}