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

if (!res.ok || !data?.success) {
  throw new Error(data?.message || "Checkout failed")
}

if (!data?.url) {
  throw new Error("No checkout URL received")
}

/* 🔥 AUTO REDIRECT */
window.location.href = data.url

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

if (!res.ok || !data?.success) {
  throw new Error(data?.message || "Upgrade failed")
}

if (!data?.url) {
  throw new Error("No checkout URL received")
}

/* 🔥 IMPORTANT FIX */
// Trial user ho ya paid → always go to checkout
window.location.href = data.url

return data

} catch (error: any) {

console.error("Upgrade API error:", error)

return {
  success: false,
  message: error.message || "Upgrade failed",
}

}
}
