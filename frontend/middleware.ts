import { NextRequest, NextResponse } from "next/server";

const LEGACY_HOSTS = new Set([
  "automexiaai.in",
  "www.automexiaai.in",
]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0];

  if (!LEGACY_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = "app.automexiaai.in";

  if (redirectUrl.protocol !== "https:") {
    redirectUrl.protocol = "https:";
  }

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

