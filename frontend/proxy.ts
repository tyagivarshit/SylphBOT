import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot",
  "/auth/reset-password",
  "/auth/verify-email",
]

export function proxy(request: NextRequest) {

  const { pathname } = request.nextUrl

  /* 🔥 IGNORE STATIC */
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/images")
  ) {
    return NextResponse.next()
  }

  const accessToken = request.cookies.get("accessToken")?.value

  const isPublic = PUBLIC_ROUTES.some(route =>
    pathname.startsWith(route)
  )

  /* 🔐 NOT LOGGED IN */
  if (!accessToken && !isPublic) {
    return NextResponse.redirect(
      new URL("/auth/login", request.url)
    )
  }

  /* 🔄 LOGGED IN → BLOCK AUTH PAGES */
  if (accessToken && isPublic) {
    return NextResponse.redirect(
      new URL("/dashboard", request.url)
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/auth/:path*",
  ]
}