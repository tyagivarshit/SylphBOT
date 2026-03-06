export function getToken() {
  if (typeof window === "undefined") return null
  return localStorage.getItem("accessToken")
}

export function setToken(token: string) {
  if (typeof window === "undefined") return
  localStorage.setItem("accessToken", token)
}

export function removeToken() {
  if (typeof window === "undefined") return
  localStorage.removeItem("accessToken")
}