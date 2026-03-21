const API = process.env.NEXT_PUBLIC_API_URL

/* ======================================
HELPER (FETCH WITH TIMEOUT)
====================================== */

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 10000) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    const data = await res.json()

    if (!res.ok || !data?.success) {
      throw new Error(data?.message || "Request failed")
    }

    return data

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

    const data = await fetchWithTimeout(`${API}/api/billing/checkout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan, billing }),
    })

    if (!data?.url) {
      throw new Error("No checkout URL received")
    }

    return data

  } catch (error: any) {

    console.error("Checkout API error:", error)

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

    const data = await fetchWithTimeout(`${API}/api/billing/upgrade`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan, billing }),
    })

    if (!data?.url) {
      throw new Error("No checkout URL received")
    }

    return data

  } catch (error: any) {

    console.error("Upgrade API error:", error)

    return {
      success: false,
      message: error.message || "Upgrade failed",
    }

  }
}