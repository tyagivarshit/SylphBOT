export type AuthRouteContext =
  | "PUBLIC_AUTH_ROUTE"
  | "AUTHENTICATED_APP_ROUTE"
  | "OAUTH_CALLBACK_ROUTE";

const AUTHENTICATED_APP_ROUTE_PREFIXES: string[][] = [
  ["dashboard"],
  ["crm"],
  ["conversations"],
  ["automation"],
  ["settings"],
  ["clients"],
  ["leads"],
  ["booking"],
  ["booking-calendar"],
  ["analytics"],
  ["autonomous"],
  ["comment-automation"],
  ["knowledge-base"],
  ["ai-training"],
  ["support"],
  ["help"],
  ["billing"],
];

const OAUTH_CALLBACK_ROUTE_PREFIXES: string[][] = [
  ["integrations", "meta", "callback"],
  ["oauth", "callback"],
  ["auth", "callback"],
];

const normalizePathname = (pathname?: string | null) => {
  const normalized = String(pathname || "").trim();
  if (!normalized) {
    return "/";
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};

const splitPathSegments = (pathname?: string | null) =>
  normalizePathname(pathname)
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

const startsWithSegments = (segments: string[], prefix: string[]) =>
  prefix.every((part, index) => segments[index] === part);

const matchesAnyPrefix = (segments: string[], prefixes: string[][]) =>
  prefixes.some((prefix) => startsWithSegments(segments, prefix));

export const classifyAuthRouteContext = (
  pathname?: string | null
): AuthRouteContext => {
  const segments = splitPathSegments(pathname);

  if (matchesAnyPrefix(segments, OAUTH_CALLBACK_ROUTE_PREFIXES)) {
    return "OAUTH_CALLBACK_ROUTE";
  }

  if (matchesAnyPrefix(segments, AUTHENTICATED_APP_ROUTE_PREFIXES)) {
    return "AUTHENTICATED_APP_ROUTE";
  }

  return "PUBLIC_AUTH_ROUTE";
};

export const isPublicRouteContext = (routeContext: AuthRouteContext) =>
  routeContext === "PUBLIC_AUTH_ROUTE" || routeContext === "OAUTH_CALLBACK_ROUTE";
