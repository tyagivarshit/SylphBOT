"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getDashboardStats } from "@/lib/dashboard";

interface Stats {
  totalLeads: number;
  leadsToday: number;
  leadsThisMonth: number;
}

export default function DashboardPage() {

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const loadStats = async () => {

      try {

        const data = await getDashboardStats();

        setStats(data);

      } catch (error) {

        toast.error("Failed to load dashboard");

      } finally {

        setLoading(false);

      }

    };

    loadStats();

  }, []);

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center text-gray-500">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-10">

      <h1 className="text-3xl font-bold text-gray-900">
        Dashboard
      </h1>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-8">

        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
          <p className="text-gray-600 mb-2">
            Total Leads
          </p>
          <h2 className="text-3xl font-bold text-gray-900">
            {stats?.totalLeads ?? 0}
          </h2>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
          <p className="text-gray-600 mb-2">
            Leads Today
          </p>
          <h2 className="text-3xl font-bold text-gray-900">
            {stats?.leadsToday ?? 0}
          </h2>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
          <p className="text-gray-600 mb-2">
            Leads This Month
          </p>
          <h2 className="text-3xl font-bold text-gray-900">
            {stats?.leadsThisMonth ?? 0}
          </h2>
        </div>

      </div>

      {/* Workflow Canvas Placeholder */}
      <div className="bg-white p-10 rounded-2xl shadow-lg border border-gray-200">

        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          AI Workflows
        </h2>

        <div className="h-[350px] bg-gradient-to-br from-blue-50 to-white rounded-xl flex items-center justify-center text-gray-400">
          Workflow Canvas Preview
        </div>

      </div>

    </div>
  );
}