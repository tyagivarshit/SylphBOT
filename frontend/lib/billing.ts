const API = process.env.NEXT_PUBLIC_API_URL

/* ======================================
CHECKOUT
====================================== */

export const createCheckout = async (
  plan: string,
  billing: "monthly" | "yearly"
) => {

  try {

    const res = await fetch(`${API}/api/billing/checkout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan, billing }),
    })

    const data = await res.json()

    /* ✅ BETTER ERROR HANDLING */
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || "Checkout failed")
    }

    /* ✅ IMPORTANT: Stripe redirect URL */
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

    const res = await fetch(`${API}/api/billing/upgrade`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plan, billing }),
    })

    const data = await res.json()

    /* ✅ SAME FIX */
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || "Upgrade failed")
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