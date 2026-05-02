import { Request, Response } from "express";

const isProd = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN_SUFFIX = "automexiaai.in";

const getConfiguredHost = () => {
  const candidates = [process.env.BACKEND_URL, process.env.FRONTEND_URL];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      return new URL(candidate).hostname.toLowerCase();
    } catch {
      continue;
    }
  }

  return null;
};

const getRequestHost = (req?: Request) => {
  if (!req) return null;

  const forwardedHost = req.headers["x-forwarded-host"];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.hostname;

  return rawHost?.split(":")[0]?.toLowerCase() || null;
};

const resolveCookieDomain = (req?: Request) => {
  const host = getRequestHost(req) || getConfiguredHost();

  if (
    host &&
    (host === COOKIE_DOMAIN_SUFFIX ||
      host.endsWith(`.${COOKIE_DOMAIN_SUFFIX}`))
  ) {
    return `.${COOKIE_DOMAIN_SUFFIX}`;
  }

  return undefined;
};

export const getAuthCookieOptions = (req?: Request) => {
  const domain = resolveCookieDomain(req);
  const sameSite: "none" | "lax" = isProd ? "none" : "lax";

  return {
    httpOnly: true,
    secure: isProd,
    // Production sign-in can happen across app/api subdomains, so use `none`
    // there while preserving local HTTP development compatibility.
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
