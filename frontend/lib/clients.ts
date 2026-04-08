import { buildApiUrl } from "@/lib/url"

export async function getClients() {
  const res = await fetch(buildApiUrl("/clients"), {
    credentials: "include",
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
  const res = await fetch(buildApiUrl("/clients"), {
    method: "POST",
    credentials: "include",
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
