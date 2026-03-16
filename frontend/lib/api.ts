import axios from "axios"

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  }
})

/* RESPONSE INTERCEPTOR */

api.interceptors.response.use(
  (response) => response,

  (error) => {

    const status = error?.response?.status

    /* redirect if unauthorized */

    if (status === 401) {

      if (typeof window !== "undefined") {
        window.location.href = "/auth/login"
      }

    }

    return Promise.reject(error)
  }
)