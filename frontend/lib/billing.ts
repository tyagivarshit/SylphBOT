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

    if (!res.ok) {
      throw new Error("Checkout failed")
    }

    return await res.json()

  } catch (error) {

    console.error("Checkout API error:", error)

    return {
      success: false,
      message: "Checkout failed",
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

    if (!res.ok) {
      throw new Error("Upgrade failed")
    }

    return await res.json()

  } catch (error) {

    console.error("Upgrade API error:", error)

    return {
      success: false,
      message: "Upgrade failed",
    }
  }
}