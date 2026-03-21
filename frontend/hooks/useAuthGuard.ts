"use client"

import { useEffect, useRef, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/context/AuthContext"

type Options = {
  redirectTo?: string
  requireAuth?: boolean
  redirectIfAuth?: string
}

export default function useAuthGuard(options: Options = {}) {

  const {
    redirectTo = "/auth/login",
    requireAuth = true,
    redirectIfAuth = "/dashboard",
  } = options

  const router = useRouter()
  const pathname = usePathname()

  const { user, loading } = useAuth()

  const hasRedirected = useRef(false)
  const mounted = useRef(true)

  /* ======================================
  CLEANUP
  ====================================== */

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  /* ======================================
  REDIRECT LOGIC (PRODUCTION SAFE)
  ====================================== */

  useEffect(() => {

    if (loading || hasRedirected.current || !mounted.current) return

    // 🔐 Protected route
    if (requireAuth && !user) {
      hasRedirected.current = true

      const next = encodeURIComponent(pathname || "/")

      router.replace(`${redirectTo}?next=${next}`)
      return
    }

    // 🔓 Public route (logged in)
    if (!requireAuth && user) {
      hasRedirected.current = true

      router.replace(redirectIfAuth)
      return
    }

  }, [
    user,
    loading,
    router,
    requireAuth,
    redirectTo,
    redirectIfAuth,
    pathname,
  ])

  /* ======================================
  STATE
  ====================================== */

  const state = useMemo(() => {
    return {
      user,
      loading,
      isAuthenticated: !!user,
      isGuest: !user && !loading,
      isReady: !loading,
    }
  }, [user, loading])

  return state
}