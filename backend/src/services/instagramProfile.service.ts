import { decrypt } from "../utils/encrypt";

export async function fetchInstagramUsername(
  instagramUserId?: string | null,
  accessTokenEncrypted?: string | null
) {
  if (!instagramUserId || !accessTokenEncrypted) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const accessToken = decrypt(accessTokenEncrypted);
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${instagramUserId}?fields=username,name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const username =
      typeof data?.username === "string"
        ? data.username.trim()
        : typeof data?.name === "string"
          ? data.name.trim()
          : "";

    return username || null;
  } catch (error) {
    console.warn("Instagram username fetch failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
