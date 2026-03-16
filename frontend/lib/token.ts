export function getToken() {
  if (typeof window === "undefined") return null

  return (
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken")
  )
}

export function setToken(token: string, remember?: boolean) {
  if (typeof window === "undefined") return

  if (remember) {
    localStorage.setItem("accessToken", token)
  } else {
    sessionStorage.setItem("accessToken", token)
  }
}

export function removeToken() {
  if (typeof window === "undefined") return

  localStorage.removeItem("accessToken")
  sessionStorage.removeItem("accessToken")
}