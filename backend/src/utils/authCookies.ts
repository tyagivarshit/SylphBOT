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

  return {
    httpOnly: true,
    secure: isProd,
    // Frontend and API run on the same site, so Lax avoids Chrome's flaky
    // third-party cookie handling while still preserving the OAuth redirect.
    sameSite: "lax" as const,
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

  res.clearCookie("accessToken", options);
  res.clearCookie("refreshToken", options);
};
