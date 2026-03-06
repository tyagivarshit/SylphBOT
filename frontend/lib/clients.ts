import { getToken } from "./token"

const API = process.env.NEXT_PUBLIC_API_URL

export async function getClients() {

  const token = getToken()

  const res = await fetch(`${API}/api/clients`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  return res.json()
}

export async function createClient(data: any) {

  const token = getToken()

  const res = await fetch(`${API}/api/clients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(data)
  })

  return res.json()
}