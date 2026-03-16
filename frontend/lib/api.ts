import axios from "axios"
import { getToken, removeToken } from "./token"

export const api = axios.create({
baseURL: process.env.NEXT_PUBLIC_API_URL,
withCredentials: true,
headers: {
"Content-Type": "application/json"
}
})

/* REQUEST INTERCEPTOR */

api.interceptors.request.use(
(config) => {

const token = getToken()

if (token) {
  config.headers.Authorization = `Bearer ${token}`
}

return config


},
(error) => {
return Promise.reject(error)
}
)

/* RESPONSE INTERCEPTOR */

api.interceptors.response.use(
(response) => response,

(error) => {

const status = error?.response?.status

/* Auto logout if token expired */

if (status === 401) {

  removeToken()

  if (typeof window !== "undefined") {
    window.location.href = "/auth/login"
  }

}

return Promise.reject(error)
}
)
