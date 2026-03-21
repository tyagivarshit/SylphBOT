const API = process.env.NEXT_PUBLIC_API_URL

export async function getClients() {
  const res = await fetch(`${API}/api/clients`, {
    credentials: "include", // 🔥 MUST
  })

  if (!res.ok) {
    let errorMsg = "Failed to fetch clients"
    try {
      const err = await res.json()
      errorMsg = err.message || errorMsg
    } catch {}
    throw new Error(errorMsg)
  }

  return res.json()
}

export async function createClient(data: any) {
  const res = await fetch(`${API}/api/clients`, {
    method: "POST",
    credentials: "include", // 🔥 MUST
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    let errorMsg = "Failed to create client"
    try {
      const err = await res.json()
      errorMsg = err.message || errorMsg
    } catch {}
    throw new Error(errorMsg)
  }

  return res.json()
}