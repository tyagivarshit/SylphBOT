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

export default function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* =========================
     🔥 REAL USER DATA
  ========================= */
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("http://localhost:5000/api/user/me", {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  /* =========================
     🔥 OUTSIDE CLICK
  ========================= */
  useEffect(() => {
    function handleClick(e: any) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  /* =========================
     🔥 ACTIONS
  ========================= */

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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      localStorage.clear();
      sessionStorage.clear();

      window.location.href = "/login";
    } catch (err) {
      console.error("Logout error:", err);
      window.location.href = "/login";
    }
  };

  return (
    <div ref={ref} className="relative">

      {/* PROFILE BUTTON */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-gray-100 transition"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] flex items-center justify-center text-xs font-semibold text-white">
          
          {user?.avatar ? (
            <img src={user.avatar} className="w-full h-full object-cover" />
          ) : (
            user?.name?.[0] || "U"
          )}

        </div>

        <span className="hidden sm:block text-sm font-medium text-gray-900">
          {user?.name || "User"}
        </span>
      </button>

      {/* DROPDOWN */}
      {open && (
        <div className="absolute right-0 mt-3 w-[90vw] sm:w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">

          {/* USER INFO */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-gray-500">
              {user?.email || "email@example.com"}
            </p>
          </div>

          {/* MENU */}
          <div className="p-2">

            <button
              onClick={goToProfile}
              className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800"
            >
              <User size={16} /> Profile
            </button>

            <button
              onClick={goToSettings}
              className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800"
            >
              <Settings size={16} /> Settings
            </button>

            <button
              onClick={goToUpgrade}
              className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-[#ECFEFF] text-sm text-[#14E1C1] font-medium"
            >
              <Sparkles size={16} /> Upgrade Plan
            </button>

            <button
              onClick={goToSupport}
              className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800"
            >
              <HelpCircle size={16} /> Help & Support
            </button>

          </div>

          {/* LOGOUT */}
          <div className="p-2 border-t border-gray-100">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full p-2 rounded-lg text-red-500 hover:bg-red-50 text-sm"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>

        </div>
      )}
    </div>
  );
}