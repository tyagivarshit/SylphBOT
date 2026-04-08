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
    function handleClick(e: any) {
      if (ref.current && !ref.current.contains(e.target)) {
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
    router.push("/support");
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
        className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl hover:bg-blue-50 transition"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-r from-blue-600 to-cyan-500 flex items-center justify-center text-xs font-semibold text-white shadow-sm">
          
          {user?.avatar ? (
            <img src={user.avatar} className="w-full h-full object-cover" />
          ) : (
            user?.name?.[0] || "U"
          )}

        </div>

        <span className="hidden sm:block text-sm font-semibold text-gray-900">
          {user?.name || "User"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[90vw] sm:w-72 bg-white/80 backdrop-blur-xl border border-blue-100 rounded-2xl shadow-xl z-[1000] overflow-hidden">

          <div className="px-4 py-3 border-b border-blue-100">
            <p className="text-sm font-semibold text-gray-900">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-gray-500">
              {user?.email || "email@example.com"}
            </p>
          </div>

          <div className="p-2 space-y-1">

            <button
              onClick={goToProfile}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-blue-50 text-sm text-gray-800 transition"
            >
              <User size={16} /> Profile
            </button>

            <button
              onClick={goToSettings}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-blue-50 text-sm text-gray-800 transition"
            >
              <Settings size={16} /> Settings
            </button>

            <button
              onClick={goToUpgrade}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-blue-50 text-gray-800 text-sm font-semibold hover:shadow-sm transition"
            >
              <Sparkles size={16} /> Upgrade Plan
            </button>

            <button
              onClick={goToSupport}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl hover:bg-blue-50 text-sm text-gray-800 transition"
            >
              <HelpCircle size={16} /> Help & Support
            </button>

          </div>

          <div className="p-2 border-t border-blue-100">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 text-sm font-medium transition"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
