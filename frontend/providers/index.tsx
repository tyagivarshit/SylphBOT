"use client"

import React from "react"
import ReactQueryProvider from "./ReactQueryProvider"
import { AuthProvider } from "@/context/AuthContext"

/* ======================================
PROVIDERS (SINGLE SOURCE OF TRUTH)
====================================== */

export default function Providers({
  children,
}: {
  children: React.ReactNode
}) {

  console.log("🚀 Providers MOUNTED")

  return (
    <ReactQueryProvider>

      {/* 🔥 React Query ready */}
      <AuthProvider>

        {/* 🔥 Auth ready */}
        {children}

      </AuthProvider>

    </ReactQueryProvider>
  )
}