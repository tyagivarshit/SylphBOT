"use client";

import { useState, useRef, useEffect } from "react";
import {
  LogOut,
  Settings,
  CreditCard,
  Moon,
  Sun,
  HelpCircle,
  User,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  user: any;
}

export default function ProfileDropdown({ user }: Props) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: any) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  return (
    <div ref={ref} className="relative">

      {/* PROFILE BUTTON */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hover:bg-gray-100 transition"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#14E1C1] to-[#3b82f6] flex items-center justify-center text-xs font-semibold text-white">
          {user?.name?.[0] || "U"}
        </div>

        <span className="hidden sm:block text-sm font-medium text-gray-900">
          {user?.name || "User"}
        </span>
      </button>

      {/* DROPDOWN */}
      {open && (
        <div className="
          absolute right-0 mt-3 w-[90vw] sm:w-72
          bg-white border border-gray-200
          rounded-xl shadow-xl z-50 overflow-hidden
        ">

          {/* USER INFO */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              {user?.name || "User"}
            </p>
            <p className="text-xs text-gray-500">
              {user?.email || "email@example.com"}
            </p>
          </div>

          {/* ACCOUNT */}
          <div className="p-2">
            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800">
              <User size={16} /> Edit Profile
            </button>

            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800">
              <Settings size={16} /> Settings
            </button>
          </div>

          {/* WORKSPACE */}
          <div className="px-4 py-2 border-t border-gray-100">
            <p className="text-xs text-gray-500">Workspace</p>
            <p className="text-sm font-medium text-gray-900">
              {user?.business?.name || "My Business"}
            </p>
          </div>

          {/* BILLING */}
          <div className="p-2 border-t border-gray-100">

            <div className="flex items-center justify-between px-2 py-1 text-sm text-gray-700">
              <span>Plan</span>
              <span className="font-semibold text-[#14E1C1]">
                {user?.plan || "FREE"}
              </span>
            </div>

            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800">
              <CreditCard size={16} /> Billing
            </button>

            {/* ✅ FIXED UPGRADE BUTTON */}
            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-[#ECFEFF] text-sm text-[#14E1C1] font-medium">
              <Sparkles size={16} /> Upgrade Plan
            </button>

          </div>

          {/* EXTRA */}
          <div className="p-2 border-t border-gray-100">

            <button
              onClick={() => setDark(!dark)}
              className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {dark ? "Light Mode" : "Dark Mode"}
            </button>

            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-gray-100 text-sm text-gray-800">
              <HelpCircle size={16} /> Help & Support
            </button>

          </div>

          {/* LOGOUT */}
          <div className="p-2 border-t border-gray-100">
            <button
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                router.push("/login");
              }}
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