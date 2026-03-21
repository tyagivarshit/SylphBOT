/* ======================================
TYPES
====================================== */

type AuthResponse = {
  success?: boolean;
  message?: string;
  user?: any;
};

/* ======================================
🔥 SAFE FETCH (FINAL FIXED)
====================================== */

async function safeFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      ...options,
      credentials: "include",
      cache: "no-store", // 🔥 FIX 304
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (res.status === 204) return {} as T;

    const contentType = res.headers.get("content-type");
    let data: any = null;

    if (contentType?.includes("application/json")) {
      data = await res.json();
    }

    if (!res.ok) {
      if (res.status === 401) throw new Error("UNAUTHORIZED");
      if (res.status === 429) throw new Error("Too many requests");
      throw new Error(data?.message || "Request failed");
    }

    return data;

  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/* ======================================
AUTH STATE
====================================== */

let currentUserCache: any = null;

/* ======================================
CURRENT USER
====================================== */

export async function getCurrentUser(): Promise<AuthResponse | null> {
  try {
    const res = await safeFetch<AuthResponse>(`/api/auth/me`);
    currentUserCache = res?.user || null;
    return res;
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      currentUserCache = null;
      return null;
    }
    return null;
  }
}

/* ======================================
LOGIN
====================================== */

export async function loginUser(
  email: string,
  password: string
): Promise<AuthResponse> {

  const res = await safeFetch<AuthResponse>(`/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  await new Promise((r) => setTimeout(r, 100)); // cookie settle

  return res;
}

/* ======================================
REGISTER
====================================== */

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {

  return safeFetch<AuthResponse>(`/api/auth/register`, {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    }),
  });
}

/* ======================================
VERIFY EMAIL
====================================== */

export async function verifyEmail(token: string) {
  return safeFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
}

/* ======================================
RESEND VERIFICATION
====================================== */

export async function resendVerification(email: string) {
  return safeFetch(`/api/auth/resend-verification`, {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

/* ======================================
FORGOT PASSWORD
====================================== */

export async function forgotPassword(email: string) {
  return safeFetch(`/api/auth/forgot-password`, {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
    }),
  });
}

/* ======================================
RESET PASSWORD
====================================== */

export async function resetPassword(
  token: string,
  password: string
) {
  return safeFetch(`/api/auth/reset-password`, {
    method: "POST",
    body: JSON.stringify({
      token,
      password,
    }),
  });
}

/* ======================================
LOGOUT
====================================== */

export async function logoutUser() {
  currentUserCache = null;

  return safeFetch(`/api/auth/logout`, {
    method: "POST",
  });
}