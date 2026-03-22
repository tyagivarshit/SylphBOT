"use client";

import useAuthGuard from "@/hooks/useAuthGuard";

export default function DashboardPage() {
  const { user, loading } = useAuthGuard();

  /* ⏳ LOADING */
  if (loading) {
    return (
      <div className="p-6 text-gray-500">
        Checking authentication...
      </div>
    );
  }

  /* 🚫 WAIT FOR REDIRECT */
  if (!user) {
    return null; // 🔥 VERY IMPORTANT
  }

  /* ✅ DASHBOARD UI */
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">
        Dashboard Loaded 🚀
      </h1>
    </div>
  );
}