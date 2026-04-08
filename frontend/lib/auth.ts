/* ======================================
🔥 IMPORTS
====================================== */

import type { ApiResponse } from "./apiClient";
import { buildAbsoluteApiUrl } from "./url";

/* ======================================
🔥 TYPES (STRICT)
====================================== */

type User = {
  id: string;
  email: string;
  role: string;
  businessId: string | null;
};

type CurrentUserResponse = {
  user: User;
};

/* ======================================
🔥 AUTH STATE (SAFE CACHE)
====================================== */

let currentUserCache: User | null = null;
let fetchingPromise: Promise<ApiResponse<CurrentUserResponse>> | null = null;
const AUTH_TIMEOUT_MS = 15000;

/* ======================================
🔥 UTILS
====================================== */

export function clearUserCache() {
  currentUserCache = null;
}

const toAuthUrl = (path: string) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return buildAbsoluteApiUrl(normalized);
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function authFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const hasJsonBody =
      options.body !== undefined &&
      options.body !== null &&
      !(options.body instanceof FormData);

    const res = await fetch(toAuthUrl(path), {
      ...options,
      credentials: "include",
      mode: "cors",
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const data = await readJson<Record<string, unknown>>(res);
    const payload =
      data && "data" in data ? (data.data as T | null) : (data as T | null);

    if (res.status === 401) {
      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: true,
        message:
          typeof data?.message === "string" ? data.message : "Unauthorized",
        code: typeof data?.code === "string" ? data.code : undefined,
      };
    }

    if (!res.ok) {
      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: false,
        message:
          typeof data?.message === "string" ? data.message : "Request failed",
        code: typeof data?.code === "string" ? data.code : undefined,
      };
    }

    return {
      success: true,
      data: payload ?? null,
      limited: data?.limited === true,
      upgradeRequired: data?.upgradeRequired === true,
      unauthorized: false,
    };
  } catch (error: unknown) {
    return {
      success: false,
      data: null,
      limited: false,
      upgradeRequired: false,
      unauthorized: false,
      networkError: true,
      message:
        error instanceof Error && error.name === "AbortError"
          ? "Authentication request timed out"
          : getErrorMessage(error, "Authentication request failed"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function buildGoogleAuthUrl(redirectTo?: string) {
  const url = new URL(toAuthUrl("/auth/google"));

  if (redirectTo) {
    url.searchParams.set("redirectTo", redirectTo);
  }

  return url.toString();
}

/* ======================================
🔥 CURRENT USER (FINAL FIXED)
====================================== */

export async function getCurrentUser(): Promise<
  ApiResponse<CurrentUserResponse>
> {
  /* ✅ RETURN CACHE */
  if (currentUserCache) {
    return {
      success: true,
      data: { user: currentUserCache },
      limited: false,
      upgradeRequired: false,
      unauthorized: false,
    };
  }

  /* 🔥 PREVENT PARALLEL CALLS (PROMISE SHARING) */
  if (fetchingPromise) {
    return fetchingPromise;
  }

  fetchingPromise = (async () => {
    try {
      const res = await authFetch<CurrentUserResponse>("/auth/me", {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (res.unauthorized || !res.success) {
        currentUserCache = null;
        return res;
      }
      currentUserCache = res.data?.user || null;

      return res;

    } catch (err: unknown) {
      currentUserCache = null;

      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: false,
        networkError: true,
        message: getErrorMessage(err, "Auth fetch failed"),
      };

    } finally {
      fetchingPromise = null;
    }
  })();

  return fetchingPromise;
}

/* ======================================
🔥 LOGIN
====================================== */

export async function loginUser(
  email: string,
  password: string
): Promise<ApiResponse<{ user: User }>> {

  const res = await authFetch<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  /* 🔥 CLEAR CACHE AFTER LOGIN */
  clearUserCache();

  if (typeof window !== "undefined" && res.success) {
    window.dispatchEvent(new Event("auth:refresh"));
  }

  return res;
}

/* ======================================
🔥 REGISTER
====================================== */

export async function registerUser(
  name: string,
  email: string,
  password: string
) {
  return authFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    }),
  });
}

/* ======================================
🔥 VERIFY EMAIL
====================================== */

export async function verifyEmail(token: string) {
  return authFetch(
    `/auth/verify-email?token=${encodeURIComponent(token)}`
  );
}

/* ======================================
🔥 RESEND VERIFICATION
====================================== */

export async function resendVerification(email: string) {
  return authFetch("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

/* ======================================
🔥 FORGOT PASSWORD
====================================== */

export async function forgotPassword(email: string) {
  return authFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

/* ======================================
🔥 RESET PASSWORD
====================================== */

export async function resetPassword(
  token: string,
  password: string
) {
  return authFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token,
      password,
    }),
  });
}

/* ======================================
🔥 LOGOUT
====================================== */

export async function logoutUser() {

  clearUserCache();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth:refresh"));
  }

  return authFetch("/auth/logout", {
    method: "POST",
  });
}
