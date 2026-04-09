"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ShieldCheck, Sparkles } from "lucide-react";

import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

/* =========================
   🔥 UPGRADE CONTEXT (STABLE)
========================= */
type UpgradeContextValue = {
  openUpgrade: () => void;
  closeUpgrade: () => void;
};

const UpgradeContext = createContext<UpgradeContextValue | null>(null);

export function useUpgrade() {
  const context = useContext(UpgradeContext);

  if (!context) {
    throw new Error("useUpgrade must be used within DashboardLayout");
  }

  return context;
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /* 🔥 AUTH REDIRECT FIX */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, router, user]);

  /* 🔥 STABLE CONTEXT */
  if (loading) {
    return (
      <div className="brand-app brand-shell">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="brand-panel-strong w-full max-w-md rounded-[32px] p-8 text-center">
            <div className="mx-auto h-10 w-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500">
              Loading your Automexia workspace...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="brand-app brand-shell">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="brand-panel-strong w-full max-w-md rounded-[32px] p-8 text-center">
            <div className="mx-auto h-10 w-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500">
              Redirecting to secure sign-in...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <UpgradeContext.Provider
      value={{
        openUpgrade: () => setUpgradeOpen(true),
        closeUpgrade: () => setUpgradeOpen(false),
      }}
    >
      <div className="brand-app brand-shell">

        {/* 🔥 TOPBAR */}
        <div className="brand-layout-frame">

        {/* 🔥 BODY */}
          <Sidebar open={open} setOpen={setOpen} />

          {/* ✅ SIDEBAR (NO WRAPPER, DIRECT) */}
          <div className="brand-page flex min-h-[calc(100vh-2rem)] flex-1 flex-col gap-4 overflow-hidden">

          {/* 🔥 MAIN CONTENT */}
            <Topbar setOpen={setOpen} />

            <main className="brand-scrollbar flex-1 overflow-y-auto overflow-x-clip">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-2">
                {children}
              </div>
            </main>

        </div>
      </div>
      </div>

      {/* =========================
         🔥 UPGRADE MODAL
      ========================= */}
      {upgradeOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">

          <div className="brand-panel-strong w-full max-w-md rounded-[32px] p-6 sm:p-7">

            <span className="brand-chip brand-chip-success">
              <ShieldCheck size={14} />
              Premium access control
            </span>

            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
              Upgrade Required 🚀
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              This feature is available on a higher plan. Upgrade to unlock
              CRM, automation, and AI growth features with the full Automexia
              product experience.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">

              <button
                onClick={() => setUpgradeOpen(false)}
                className="brand-button-secondary flex-1"
              >
                Maybe later
              </button>

              <button
                onClick={() => {
                  setUpgradeOpen(false);
                  router.push("/billing");
                }}
                className="brand-button-primary flex-1"
              >
                <Sparkles size={15} />
                View plans
              </button>

            </div>

          </div>

        </div>
      )}
    </UpgradeContext.Provider>
  );
}
