import { buildApiUrl } from "@/lib/url"

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout = 10000
) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, {
      ...options,
      credentials: "include",
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

    if (res.status === 401) {
      throw new Error("Unauthorized")
    }

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

export const createCheckoutSession = async (
  plan: string,
  billing: "monthly" | "yearly"
) => {
  try {
    const data = await fetchWithTimeout(
      buildApiUrl("/billing/create-checkout-session"),
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
    console.error("Checkout API error:", error)

    return {
      success: false,
      message: error.message || "Checkout failed",
    }
  }
}

export const createCheckout = async (
  plan: string,
  billing: "monthly" | "yearly"
) => createCheckoutSession(plan, billing)

export const upgradePlan = async (
  plan: string,
  billing: "monthly" | "yearly"
) => createCheckoutSession(plan, billing)

export const confirmCheckout = async (sessionId: string) => {
  try {
    return await fetchWithTimeout(
      `${buildApiUrl("/billing/checkout/confirm")}?session_id=${encodeURIComponent(
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
