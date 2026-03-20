const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

/* 🔥 SAFE FETCH WRAPPER (timeout + errors + env check) */
async function safeFetch(url: string, options: RequestInit = {}) {
  if (!API) {
    throw new Error("API not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, {
      ...options,
      credentials: "include",
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type");

    let data: any = null;

    if (contentType?.includes("application/json")) {
      data = await res.json();
    } else {
      data = { message: "Invalid server response" };
    }

    if (!res.ok) {
      throw new Error(data?.message || "Request failed");
    }

    return data;

  } catch (err: any) {

    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }

    throw new Error(err?.message || "Network error");

  } finally {
    clearTimeout(timeout);
  }
}

/* ================= LOGIN ================= */

export async function loginUser(email: string, password: string) {
  return safeFetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

/* ================= REGISTER ================= */

export async function registerUser(
  name: string,
  email: string,
  password: string
) {
  return safeFetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
}

/* ================= VERIFY EMAIL ================= */

export async function verifyEmail(token: string) {
  return safeFetch(
    `${API}/api/auth/verify-email?token=${encodeURIComponent(token)}`
  );
}

/* ================= RESEND VERIFICATION ================= */

export async function resendVerification(email: string) {
  return safeFetch(`${API}/api/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/* ================= FORGOT PASSWORD ================= */

export async function forgotPassword(email: string) {
  return safeFetch(`${API}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

/* ================= RESET PASSWORD ================= */

export async function resetPassword(
  token: string,
  password: string
) {
  return safeFetch(`${API}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}