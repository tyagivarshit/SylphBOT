"use client";

import { useState, useRef, useEffect } from "react";
import {
  LogOut,
  Settings,
  HelpCircle,
  User,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl, fetchCurrentUser } from "@/lib/userApi";

export default function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: fetchCurrentUser,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target;

      if (ref.current && target instanceof Node && !ref.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const goToProfile = () => {
    router.push("/settings/profile");
    setOpen(false);
  };

  const goToSettings = () => {
    router.push("/settings");
    setOpen(false);
  };

  const goToUpgrade = () => {
    router.push("/billing");
    setOpen(false);
  };

  const goToSupport = () => {
    window.location.assign("/support");
    setOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch(buildApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });

      localStorage.clear();
      sessionStorage.clear();

      window.location.href = "/auth/login";
    } catch (err) {
      console.error("Logout error:", err);
      window.location.href = "/auth/login";
    }
  };

  return (
    <div ref={ref} className="relative z-[999]"> {/* 🔥 FIX */}

      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/72 px-2 py-1.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl sm:px-3 sm:py-2"
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-[linear-gradient(135deg,#0b2a5b_0%,#1e5eff_55%,#7dd3fc_100%)] text-[11px] font-semibold text-white shadow-[0_14px_30px_rgba(30,94,255,0.22)] sm:h-9 sm:w-9 sm:rounded-2xl sm:text-xs">
          
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user?.name ? `${user.name} avatar` : "User avatar"}
              className="h-full w-full object-cover"
            />
          ) : (
            user?.name?.[0] || "U"
          )}

        </div>

        <span className="hidden sm:block text-sm font-semibold text-slate-900">
          {user?.name || "User"}
        </span>
      </button>

      {open && (
        <div className="brand-panel-strong absolute right-0 z-[1000] mt-3 w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-[28px] sm:w-72">

          <div className="border-b border-slate-200/70 px-4 py-4">
            <p className="text-sm font-semibold text-slate-900">
              {user?.name || "User"}
            </p>
            <p className="break-all text-xs text-slate-500">
              {user?.email || "email@example.com"}
            </p>
          </div>

          <div className="p-2 space-y-1">

            <button
              onClick={goToProfile}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50/80 hover:text-slate-950"
            >
              <User size={16} /> Profile
            </button>

            <button
              onClick={goToSettings}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50/80 hover:text-slate-950"
            >
              <Settings size={16} /> Settings
            </button>

            <button
              onClick={goToUpgrade}
              className="flex w-full items-center gap-2 rounded-2xl bg-blue-50/90 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-blue-100"
            >
              <Sparkles size={16} /> Upgrade Plan
            </button>

            <button
              onClick={goToSupport}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-blue-50/80 hover:text-slate-950"
            >
              <HelpCircle size={16} /> Help & Support
            </button>

          </div>

          <div className="border-t border-slate-200/70 p-2">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
