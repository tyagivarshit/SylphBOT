"use client"

import { ReactNode, createContext, useContext, useState } from "react"
import DashboardLayout from "@/components/layout/DashboardLayout"
import useAuthGuard from "@/hooks/useAuthGuard"
import UpgradeModal from "@/components/UpgradeModal"

/* ======================================
GLOBAL CONTEXT (🔥 NEW)
====================================== */

const UpgradeContext = createContext<{
  openUpgrade: () => void
} | null>(null)

export const useUpgrade = () => {
  const ctx = useContext(UpgradeContext)
  if (!ctx) throw new Error("useUpgrade must be used inside provider")
  return ctx
}

/* ======================================
LAYOUT
====================================== */

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {

  const loading = useAuthGuard()

  const [open,setOpen] = useState(false)

  /* while checking session */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading dashboard...
      </div>
    )
  }

  return (

    <UpgradeContext.Provider value={{
      openUpgrade: ()=>setOpen(true) // ✅ GLOBAL TRIGGER
    }}>

      <DashboardLayout>
        {children}
      </DashboardLayout>

      {/* 🔥 GLOBAL MODAL (IMPORTANT) */}
      <UpgradeModal open={open} setOpen={setOpen} />

    </UpgradeContext.Provider>

  )

}