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

function AuthStateCard({ message }: { message: string }) {
  return (
    <div className="brand-app brand-shell">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="brand-panel-strong w-full max-w-md rounded-[32px] p-8 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="mt-4 text-sm text-slate-500">{message}</p>
        </div>
      </div>
    </div>
  );
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

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* 🔥 STABLE CONTEXT */
  if (loading) {
    return <AuthStateCard message="Loading your Automexia workspace..." />;
  }

  if (!user) {
    return <AuthStateCard message="Redirecting to secure sign-in..." />;
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
        <div className="brand-layout-frame lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">

        {/* 🔥 BODY */}
          <Sidebar open={open} setOpen={setOpen} />

          {/* ✅ SIDEBAR (NO WRAPPER, DIRECT) */}
          <div className="brand-page brand-main-column">

          {/* 🔥 MAIN CONTENT */}
            <Topbar setOpen={setOpen} />

            <main className="brand-content-scroll brand-scrollbar">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-6 sm:gap-6">
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
