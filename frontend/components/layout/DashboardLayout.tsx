"use client";

import { useState, useEffect, ReactNode, useCallback } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/* ======================================
🔥 COMPONENT
====================================== */

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {

  const [open, setOpen] = useState(false);

  /* ======================================
  🔥 CLOSE HANDLERS (STABLE)
  ====================================== */

  const closeSidebar = useCallback(() => {
    setOpen(false);
  }, []);

  /* ======================================
  🔥 ESC KEY CLOSE
  ====================================== */

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [closeSidebar]);

  /* ======================================
  🔥 BODY SCROLL LOCK (MOBILE UX)
  ====================================== */

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [open]);

  /* ======================================
  🔥 OVERLAY CLICK CLOSE
  ====================================== */

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-white via-blue-50 to-cyan-50">

      {/* ===== TOPBAR ===== */}
      <div className="shrink-0">
        <Topbar setOpen={setOpen} />
      </div>

      {/* ===== BODY ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* ===== SIDEBAR ===== */}
        <div className="shrink-0">
          <Sidebar open={open} setOpen={setOpen} />
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div className="flex flex-col flex-1 min-w-0">

          <main className="flex-1 overflow-y-auto">

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
              {children}
            </div>

          </main>

        </div>

      </div>

    </div>
  );
}
