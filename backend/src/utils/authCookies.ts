import { Request, Response } from "express";

const isProd = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN_SUFFIX = "automexiaai.in";

const normalizeHost = (value?: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }

  // Some proxy chains can send a comma-separated host list.
  const first = raw.split(",")[0]?.trim();
  if (!first) {
    return null;
  }

  // IPv6 host header can be bracketed: [::1]:3000
  if (first.startsWith("[")) {
    const endBracketIndex = first.indexOf("]");
    if (endBracketIndex > 1) {
      return first.slice(1, endBracketIndex).trim().toLowerCase() || null;
    }
    return null;
  }

  return first.split(":")[0]?.trim().toLowerCase() || null;
};

const getConfiguredHost = () => {
  const candidates = [process.env.BACKEND_URL, process.env.FRONTEND_URL];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = normalizeHost(new URL(candidate).hostname);
      if (parsed) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const getRequestHost = (req?: Request) => {
  if (!req) return null;

  const forwardedHost = req.headers["x-forwarded-host"];
  const forwarded = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost;

  return (
    normalizeHost(forwarded) ||
    normalizeHost(req.hostname) ||
    normalizeHost(req.headers.host) ||
    null
  );
};

const resolveCookieDomain = (req?: Request) => {
  const host = getRequestHost(req) || getConfiguredHost();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.includes("127.0.0.1") ||
    host === "::1"
  ) {
    return undefined;
  }

  // Do not attach Domain for IP literals or unknown hosts.
  if (/^[0-9.]+$/.test(host) || host.includes(":")) {
    return undefined;
  }

  // Set a shared domain cookie only for our trusted production suffix.
  if (
    host === COOKIE_DOMAIN_SUFFIX ||
    host.endsWith(`.${COOKIE_DOMAIN_SUFFIX}`)
  ) {
    return `.${COOKIE_DOMAIN_SUFFIX}`;
  }

  return undefined;
};

export const getAuthCookieOptions = (req?: Request) => {
  const domain = resolveCookieDomain(req);
  const sameSite: "none" | "lax" = domain ? "lax" : (isProd ? "none" : "lax");

  return {
    httpOnly: true,
    secure: isProd,
    sameSite,
    ...(domain ? { domain } : {}),
    path: "/",
  };
};

export const setAuthCookies = (
  res: Response,
  req: Request,
  accessToken: string,
  refreshToken: string
) => {
  const options = getAuthCookieOptions(req);

  res.cookie("accessToken", accessToken, {
    ...options,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    ...options,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const clearAuthCookies = (res: Response, req?: Request) => {
  const options = getAuthCookieOptions(req);
  const { domain, ...hostOnlyOptions } = options;

  res.clearCookie("accessToken", options);
  res.clearCookie("refreshToken", options);

  if (domain) {
    res.clearCookie("accessToken", hostOnlyOptions);
    res.clearCookie("refreshToken", hostOnlyOptions);
  }
};
