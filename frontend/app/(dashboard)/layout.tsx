"use client"

import { ReactNode } from "react"
import DashboardLayout from "@/components/layout/DashboardLayout"
import useAuthGuard from "@/hooks/useAuthGuard"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {

  const loading = useAuthGuard()

  /* while checking session */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        Loading dashboard...
      </div>
    )
  }

  /* authenticated */

  return (
    <DashboardLayout>
      {children}
    </DashboardLayout>
  )

}