import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LEGACY_HOSTS = new Set([
  "automexiaai.in",
  "www.automexiaai.in",
]);

const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot",
  "/auth/reset-password",
  "/auth/verify-email",
];

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0];
  const { pathname } = request.nextUrl;

  if (LEGACY_HOSTS.has(host)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.hostname = "app.automexiaai.in";
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/images")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("accessToken")?.value;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!accessToken && !isPublic) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  if (accessToken && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
