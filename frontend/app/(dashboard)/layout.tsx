"use client"

import { ReactNode } from "react"
import DashboardLayout from "@/components/layout/DashboardLayout"
import useAuthGuard from "@/hooks/useAuthGuard"

export default function DashboardRootLayout({
children,
}: {
children: ReactNode
}) {

useAuthGuard()

return ( <DashboardLayout>
{children} </DashboardLayout>
)

}
