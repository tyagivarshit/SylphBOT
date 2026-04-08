import { buildApiUrl } from "@/lib/url";

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

async function coreFetch<T>(
  url: string,
  options: RequestInit,
  retry = false
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;

    const res = await fetch(url, {
      ...options,
      credentials: "include",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
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

    if (res.status === 401) {
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

    if (!res.ok) {
      console.error("API ERROR:", {
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

    console.error("FETCH FAILED:", error);

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

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const cleanPath = path.startsWith("/api")
    ? path.replace(/^\/api/, "")
    : path;

  const url = buildApiUrl(cleanPath);

  return coreFetch<T>(url, options);
}
