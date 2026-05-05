import type { ApiRequestInit, ApiResponse } from "./apiClient";
import { apiFetch } from "./apiClient";
import { buildAbsoluteApiUrl } from "./url";

type User = {
  id: string;
  email: string;
  role: string;
  businessId: string | null;
};

type CurrentUserResponse = {
  user: User;
};

let currentUserCache: User | null = null;
let fetchingPromise: Promise<ApiResponse<CurrentUserResponse>> | null = null;
const AUTH_RETRY_DELAY_MS = 120;

export function clearUserCache() {
  currentUserCache = null;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const authRequest = <T>(path: string, options: ApiRequestInit = {}) =>
  apiFetch<T>(`/api/auth${path.startsWith("/") ? path : `/${path}`}`, {
    cache: "no-store",
    timeoutMs: 9000,
    ...options,
  });

export function buildGoogleAuthUrl(redirectTo?: string) {
  const url = new URL(buildAbsoluteApiUrl("/api/auth/google"));

  if (redirectTo) {
    url.searchParams.set("redirectTo", redirectTo);
  }

  return url.toString();
}

const shouldRetryCurrentUser = (
  response: ApiResponse<CurrentUserResponse>
) => response.networkError;

const fetchCurrentUserWithRetry = async () => {
  const firstAttempt = await authRequest<CurrentUserResponse>("/me");

  if (firstAttempt.success || !shouldRetryCurrentUser(firstAttempt)) {
    return firstAttempt;
  }

  await sleep(AUTH_RETRY_DELAY_MS);

  return authRequest<CurrentUserResponse>("/me");
};

export async function getCurrentUser(): Promise<ApiResponse<CurrentUserResponse>> {
  if (currentUserCache) {
    return {
      success: true,
      data: { user: currentUserCache },
      limited: false,
      upgradeRequired: false,
      unauthorized: false,
    };
  }

  if (fetchingPromise) {
    return fetchingPromise;
  }

  fetchingPromise = (async () => {
    try {
      const response = await fetchCurrentUserWithRetry();

      if (response.unauthorized || !response.success) {
        currentUserCache = null;
        return response;
      }

      currentUserCache = response.data?.user || null;
      return response;
    } catch (error) {
      currentUserCache = null;

      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: false,
        networkError: true,
        message: getErrorMessage(error, "Auth fetch failed"),
      };
    } finally {
      fetchingPromise = null;
    }
  })();

  return fetchingPromise;
}

export async function loginUser(
  email: string,
  password: string
): Promise<ApiResponse<{ user: User }>> {
  const response = await authRequest<{ user: User }>("/login", {
    method: "POST",
    timeoutMs: 15000,
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  clearUserCache();

  if (typeof window !== "undefined" && response.success) {
    window.dispatchEvent(new Event("auth:refresh"));
  }

  return response;
}

export async function registerUser(
  name: string,
  email: string,
  password: string
) {
  return authRequest("/register", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    }),
  });
}

export async function verifyEmail(token: string) {
  return authRequest(`/verify-email?token=${encodeURIComponent(token)}`);
}

export async function resendVerification(email: string) {
  return authRequest("/resend-verification", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

export async function forgotPassword(email: string) {
  return authRequest("/forgot-password", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

export async function resetPassword(token: string, password: string) {
  return authRequest("/reset-password", {
    method: "POST",
    body: JSON.stringify({
      token,
      password,
    }),
  });
}

export async function logoutUser() {
  clearUserCache();
  const response = await authRequest("/logout", {
    method: "POST",
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth:refresh"));
  }

  return response;
}
