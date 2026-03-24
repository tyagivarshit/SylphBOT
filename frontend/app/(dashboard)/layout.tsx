"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

export default function DashboardLayout({ children }: any) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f9fcff]">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#14E1C1] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f9fcff] flex flex-col">

      {/* 🔥 TOPBAR FULL WIDTH */}
      <Topbar setOpen={setOpen} />

      {/* 🔥 BELOW AREA */}
      <div className="flex flex-1">

        {/* SIDEBAR (NOW BELOW TOPBAR) */}
        <Sidebar open={open} setOpen={setOpen} />

        {/* CONTENT */}
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>

      </div>

    </div>
  );
}