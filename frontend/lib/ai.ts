import { buildApiUrl } from "@/lib/url"

export async function getAISettings(clientId: string) {
  if (!clientId || clientId === "default") {
    throw new Error("Client not connected")
  }

  const res = await fetch(buildApiUrl(`/clients/${clientId}`), {
    credentials: "include",
  })

  if (!res.ok) {
    let errorMsg = "Failed to fetch AI settings"
    try {
      const err = await res.json()
      errorMsg = err.message || errorMsg
    } catch {}
    throw new Error(errorMsg)
  }

  return res.json()
}

export async function updateAISettings(clientId: string, data: any) {
  const res = await fetch(buildApiUrl(`/clients/${clientId}`), {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    let errorMsg = "Failed to update AI settings"
    try {
      const err = await res.json()
      errorMsg = err.message || errorMsg
    } catch {}
    throw new Error(errorMsg)
  }

  return res.json()
}
