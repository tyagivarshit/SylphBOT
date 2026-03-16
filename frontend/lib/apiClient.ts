const API = process.env.NEXT_PUBLIC_API_URL

export async function apiFetch(url: string, options: any = {}) {

  const res = await fetch(`${API}${url}`, {

    ...options,

    credentials: "include",

    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }

  })

  if (res.status === 401) {

    if (typeof window !== "undefined") {
      window.location.href = "/auth/login"
    }

    return
  }

  return res.json()
}