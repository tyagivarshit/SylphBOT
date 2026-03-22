"use client";

import  useAuthGuard  from "@/hooks/useAuthGuard";

export default function DashboardEntryPage() {

  const loading = useAuthGuard();

  /* 🔥 LOADING STATE */
  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        Checking authentication...
      </div>
    );
  }

  /* 🔥 FALLBACK (redirect already handled in hook) */
  return (
    <div style={{ padding: 20 }}>
      Redirecting...
    </div>
  );
}