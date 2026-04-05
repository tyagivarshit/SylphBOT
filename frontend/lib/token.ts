export function getToken(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem("token");
  } catch (error) {
    console.error("Token fetch error:", error);
    return null;
  }
}