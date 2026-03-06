"use client"

import DashboardLayout from "@/components/layout/DashboardLayout"
import useAuthGuard  from "@/hooks/useAuthGuard"

export default function Layout({ children }: any) {

  useAuthGuard()

  return <DashboardLayout>{children}</DashboardLayout>

}