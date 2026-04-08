/* ======================================
CONFIG
====================================== */

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")

/* ======================================
HELPER (FETCH WITH TIMEOUT + SAFE)
====================================== */

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout = 10000
) => {

  if (!API) {
    throw new Error("API URL not configured")
  }

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {

    const res = await fetch(url, {
      ...options,
      credentials: "include", // 🔥 ALWAYS INCLUDE
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })

    let data: any = null

    try {
      data = await res.json()
    } catch {
      data = null
    }

    /* 🔐 UNAUTHORIZED */
    if (res.status === 401) {
      throw new Error("Unauthorized")
    }

    /* ❌ ERROR */
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || "Request failed")
    }

    return data

  } catch (error: any) {

    const isAbort = error?.name === "AbortError"

    throw new Error(
      isAbort
        ? "Request timeout"
        : error?.message || "Network error"
    )

  } finally {
    clearTimeout(id)
  }
}

/* ======================================
CHECKOUT
====================================== */

export const createCheckout = async (
  plan: string,
  billing: "monthly" | "yearly"
) => {

  try {

    const data = await fetchWithTimeout(
      `${API}/api/billing/checkout`,
      {
        method: "POST",
        body: JSON.stringify({ plan, billing }),
      }
    )

    if (!data?.url) {
      throw new Error("No checkout URL received")
    }

    return data

  } catch (error: any) {

    console.error("❌ Checkout API error:", error)

    return {
      success: false,
      message: error.message || "Checkout failed",
    }

  }
}

/* ======================================
UPGRADE PLAN
====================================== */

export const upgradePlan = async (
  plan: string,
  billing: "monthly" | "yearly"
) => {

  try {

    const data = await fetchWithTimeout(
      `${API}/api/billing/upgrade`,
      {
        method: "POST",
        body: JSON.stringify({ plan, billing }),
      }
    )

    if (!data?.url) {
      throw new Error("No checkout URL received")
    }

    return data

  } catch (error: any) {

    console.error("❌ Upgrade API error:", error)

    return {
      success: false,
      message: error.message || "Upgrade failed",
    }

  }
}

/* ======================================
CONFIRM CHECKOUT
====================================== */

export const confirmCheckout = async (sessionId: string) => {

  try {

    return await fetchWithTimeout(
      `${API}/api/billing/checkout/confirm?session_id=${encodeURIComponent(
        sessionId
      )}`,
      {
        method: "GET",
      },
      15000
    )

  } catch (error: any) {

    console.error("Checkout confirmation error:", error)

    return {
      success: false,
      message: error.message || "Checkout confirmation failed",
    }

  }
}
