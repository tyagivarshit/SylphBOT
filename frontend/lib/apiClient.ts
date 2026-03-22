const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

/* ======================================
🔥 TYPES
====================================== */

export type ApiResponse<T = any> = {
  success: boolean;
  data: T | null;

  limited: boolean;
  upgradeRequired: boolean;
  unauthorized: boolean;

  message?: string;
  code?: string;
  networkError?: boolean;
};

/* ======================================
🔥 CORE FETCH (PRODUCTION SAFE)
====================================== */

async function coreFetch<T>(
  url: string,
  options: RequestInit,
  retry = false
): Promise<ApiResponse<T>> {

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      ...options,

      /* 🔥 CRITICAL FOR COOKIES */
      credentials: "include",
      mode: "cors", 

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },

      signal: controller.signal,
    });

    clearTimeout(timeout);

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    /* ======================================
    🔐 UNAUTHORIZED (TRY ONCE AGAIN)
    ====================================== */

    if (res.status === 401) {

      // optional retry (helps in edge cases)
      if (!retry) {
        return coreFetch<T>(url, options, true);
      }

      return {
        success: false,
        data: null,
        unauthorized: true,
        limited: false,
        upgradeRequired: false,
        message: data?.message || "Unauthorized",
      };
    }

    /* ======================================
    🚫 LIMITED MODE
    ====================================== */

    if (res.status === 403) {
      return {
        success: true,
        data: data?.data ?? null,
        limited: true,
        upgradeRequired: data?.upgradeRequired ?? true,
        unauthorized: false,
        message: data?.message,
        code: data?.code,
      };
    }

    /* ======================================
    ❌ ERROR
    ====================================== */

    if (!res.ok) {
      console.error("❌ API ERROR:", {
        url,
        status: res.status,
        data,
      });

      return {
        success: false,
        data: null,
        limited: false,
        upgradeRequired: false,
        unauthorized: false,
        message: data?.message || "Request failed",
        code: data?.code,
      };
    }

    /* ======================================
    ✅ SUCCESS
    ====================================== */

    return {
      success: true,
      data: data?.data ?? data,
      limited: data?.limited ?? false,
      upgradeRequired: data?.upgradeRequired ?? false,
      unauthorized: false,
    };

  } catch (error: any) {

    clearTimeout(timeout);

    const isAbort = error?.name === "AbortError";

    console.error("❌ FETCH FAILED:", error);

    return {
      success: false,
      data: null,
      limited: false,
      upgradeRequired: false,
      unauthorized: false,
      networkError: true,
      message: isAbort
        ? "Request timeout"
        : error?.message || "Network error",
    };
  }
}

/* ======================================
🔥 PUBLIC API
====================================== */

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {

  if (!API) {
    console.error("❌ API URL NOT DEFINED");

    return {
      success: false,
      data: null,
      limited: false,
      upgradeRequired: false,
      unauthorized: false,
      networkError: true,
      message: "API URL not configured",
    };
  }

  const url = `${API}${path}`;

  return coreFetch<T>(url, options);
}