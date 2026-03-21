const API = process.env.NEXT_PUBLIC_API_URL;

/* ======================================
🔥 API FETCH (FINAL 10/10)
====================================== */

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {

  if (!API) {
    throw new Error("API URL not configured");
  }

  const fullUrl = url.startsWith("http")
    ? url
    : `${API}${url}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {

    const res = await fetch(fullUrl, {
      ...options,
      credentials: "include",
      cache: "no-store", // 🔥 prevent 304 issues
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    /* =============================
    HANDLE EMPTY RESPONSE
    ============================= */

    if (res.status === 204) {
      return {} as T;
    }

    const contentType = res.headers.get("content-type");
    let data: any = null;

    if (contentType?.includes("application/json")) {
      data = await res.json();
    }

    /* =============================
    ERROR HANDLING (CRITICAL)
    ============================= */

    if (!res.ok) {

      console.error("❌ API ERROR:", {
        status: res.status,
        url: fullUrl,
        data,
      });

      // 🔥 AUTH ERROR (handled in hooks)
      if (res.status === 401) {
        throw new Error("UNAUTHORIZED");
      }

      // 🔥 RATE LIMIT
      if (res.status === 429) {
        throw new Error("Too many requests");
      }

      // 🔥 SERVER ERROR
      if (res.status >= 500) {
        throw new Error("Server error, try again later");
      }

      // 🔥 FALLBACK
      throw new Error(data?.message || "API Error");
    }

    return data;

  } catch (err: any) {

    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }

    console.error("🔥 FETCH FAILED:", err.message);

    throw err;

  } finally {
    clearTimeout(timeout);
  }
}