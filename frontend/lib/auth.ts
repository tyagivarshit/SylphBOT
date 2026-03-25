/* ======================================
🔥 IMPORTS
====================================== */

import { apiFetch, ApiResponse } from "./apiClient";

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

/* ======================================
🔥 UTILS
====================================== */

export function clearUserCache() {
  currentUserCache = null;
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
      const res = await apiFetch<CurrentUserResponse>(`/auth/me`, {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      /* 🔐 UNAUTHORIZED */
      if (res.unauthorized) {
        currentUserCache = null;
        return res;
      }

      /* ❌ FAILED */
      if (!res.success) {
        currentUserCache = null;
        return res;
      }

      /* ✅ SUCCESS */
      currentUserCache = res.data?.user || null;

      return res;

    } catch (err: any) {
      console.error("❌ getCurrentUser error:", err?.message);

      currentUserCache = null;

      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: false,
        networkError: true,
        message: err?.message || "Auth fetch failed",
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

  const res = await apiFetch<{ user: User }>(`/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  /* 🔥 CLEAR CACHE AFTER LOGIN */
  clearUserCache();

  /* 🔥 GLOBAL REFRESH */
  if (typeof window !== "undefined") {
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
  return apiFetch(`/auth/register`, {
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
  return apiFetch(
    `/auth/verify-email?token=${encodeURIComponent(token)}`
  );
}

/* ======================================
🔥 RESEND VERIFICATION
====================================== */

export async function resendVerification(email: string) {
  return apiFetch(`/auth/resend-verification`, {
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
  return apiFetch(`/auth/forgot-password`, {
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
  return apiFetch(`/auth/reset-password`, {
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

  return apiFetch(`/auth/logout`, {
    method: "POST",
  });
}