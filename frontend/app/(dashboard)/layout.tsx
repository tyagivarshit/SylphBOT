"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, createContext, useContext, useMemo } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

/* =========================
   🔥 UPGRADE CONTEXT (STABLE)
========================= */
const UpgradeContext = createContext<any>(null);

export function useUpgrade() {
  return useContext(UpgradeContext);
}

export default function DashboardLayout({ children }: any) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /* 🔥 AUTH REDIRECT FIX */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user]);

  /* 🔥 STABLE CONTEXT */
  const upgradeValue = useMemo(
    () => ({
      openUpgrade: () => setUpgradeOpen(true),
      closeUpgrade: () => setUpgradeOpen(false),
    }),
    []
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fcff]">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#14E1C1] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <UpgradeContext.Provider value={upgradeValue}>
      <div className="min-h-screen bg-[#f9fcff] flex flex-col overflow-hidden">

        {/* 🔥 TOPBAR */}
        <Topbar setOpen={setOpen} />

        {/* 🔥 BODY */}
        <div className="flex flex-1 relative">

          {/* ✅ SIDEBAR (NO WRAPPER, DIRECT) */}
          <Sidebar open={open} setOpen={setOpen} />

          {/* 🔥 MAIN CONTENT */}
          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            {children}
          </main>

        </div>
      </div>

      {/* =========================
         🔥 UPGRADE MODAL
      ========================= */}
      {upgradeOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100]">

          <div className="bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-xl">

            <h2 className="text-lg font-bold text-gray-900">
              Upgrade Required 🚀
            </h2>

            <p className="text-sm text-gray-700 mt-2">
              This feature is locked in your current plan.
              Upgrade to unlock CRM & automation features.
            </p>

            <div className="flex gap-3 mt-5">

              <button
                onClick={() => setUpgradeOpen(false)}
                className="flex-1 border rounded-lg py-2 text-sm"
              >
                Cancel
              </button>

              <button
                className="flex-1 bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] text-white rounded-lg py-2 text-sm font-medium"
              >
                Upgrade Plan
              </button>

            </div>

          </div>

        </div>
      )}
    </UpgradeContext.Provider>
  );
}