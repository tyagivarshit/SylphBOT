"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/* ================= MOCK DATA ================= */

const stats = {
  leads: 124,
  conversations: 892,
  aiReplies: 3421,
  bookings: 32,
};

const recentLeads = [
  { name: "Rahul Sharma", platform: "Instagram", time: "2 min ago" },
  { name: "Amit Verma", platform: "WhatsApp", time: "10 min ago" },
  { name: "Sneha Jain", platform: "Instagram", time: "30 min ago" },
];

/* ================= COMPONENT ================= */

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  if (!user) return null;

  return (
    <div className="p-6 space-y-8">

      {/* ================= HEADER ================= */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Welcome back 👋 Here's what's happening today
        </p>
      </div>

      {/* ================= STATS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <Card title="Leads" value={stats.leads} />
        <Card title="Conversations" value={stats.conversations} />
        <Card title="AI Replies" value={stats.aiReplies} />
        <Card title="Bookings" value={stats.bookings} />

      </div>

      {/* ================= AUTOMATION STATUS ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <div className="bg-white rounded-xl p-5 shadow">
          <h2 className="font-semibold mb-4">Automation Status</h2>

          <div className="space-y-2 text-sm">
            <Status label="Instagram Automation" active />
            <Status label="WhatsApp Automation" active={false} />
            <Status label="Workflows Running" active extra="4 active" />
          </div>
        </div>

        {/* ================= QUICK ACTIONS ================= */}
        <div className="bg-white rounded-xl p-5 shadow">
          <h2 className="font-semibold mb-4">Quick Actions</h2>

          <div className="grid grid-cols-2 gap-3">
            <ActionBtn label="Connect Instagram" />
            <ActionBtn label="Create Workflow" />
            <ActionBtn label="Add Follow-up" />
            <ActionBtn label="Setup Booking" />
          </div>
        </div>

      </div>

      {/* ================= RECENT LEADS ================= */}
      <div className="bg-white rounded-xl p-5 shadow">
        <h2 className="font-semibold mb-4">Recent Leads</h2>

        <div className="space-y-3">
          {recentLeads.map((lead, i) => (
            <div
              key={i}
              className="flex justify-between items-center border-b pb-2 last:border-none"
            >
              <div>
                <p className="text-sm font-medium">{lead.name}</p>
                <p className="text-xs text-gray-500">{lead.platform}</p>
              </div>
              <span className="text-xs text-gray-400">{lead.time}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ================= REUSABLE COMPONENTS ================= */

function Card({ title, value }: any) {
  return (
    <div className="bg-white rounded-xl p-5 shadow">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="text-2xl font-semibold mt-1">{value}</h2>
    </div>
  );
}

function Status({ label, active, extra }: any) {
  return (
    <div className="flex justify-between items-center">
      <span>{label}</span>
      <span
        className={`text-xs px-2 py-1 rounded ${
          active
            ? "bg-green-100 text-green-600"
            : "bg-gray-200 text-gray-600"
        }`}
      >
        {extra || (active ? "Active" : "Inactive")}
      </span>
    </div>
  );
}

function ActionBtn({ label }: any) {
  return (
    <button className="bg-black text-white text-sm py-2 rounded-lg hover:bg-gray-900">
      {label}
    </button>
  );
}