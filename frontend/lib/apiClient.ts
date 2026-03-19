const API = process.env.NEXT_PUBLIC_API_URL

export async function apiFetch(url: string, options: any = {}) {

  try{

    const res = await fetch(`${API}${url}`, {

      ...options,

      credentials: "include",

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }

    })

    /* -------- UNAUTHORIZED -------- */

    if (res.status === 401) {

      if (typeof window !== "undefined") {
        window.location.href = "/auth/login"
      }

      return null
    }

    /* -------- HANDLE NON-JSON -------- */

    const contentType = res.headers.get("content-type")

    if (!contentType?.includes("application/json")) {
      return null
    }

    const data = await res.json()

    /* -------- ERROR HANDLING -------- */

    if (!res.ok) {
      throw new Error(data?.message || "API Error")
    }

    return data

  }catch(error:any){

    console.error("API ERROR:", error.message)

    throw error

  }

}