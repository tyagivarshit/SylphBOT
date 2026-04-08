const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

const buildApiUrl = (path: string) =>
  `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  businessId?: string | null;
  business?: {
    id: string;
    name?: string | null;
    website?: string | null;
    industry?: string | null;
    teamSize?: string | null;
    type?: string | null;
    timezone?: string | null;
  } | null;
};

export type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  searchUrl?: string;
  preferredUrl?: string;
  type: "page" | "lead" | "message";
};

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch(buildApiUrl("/api/user/me"), {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  return readJson<CurrentUser>(res);
}

export async function updateCurrentUser(body: Record<string, unknown>) {
  const res = await fetch(buildApiUrl("/api/user/update"), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error("Update failed");
  }

  const data = await readJson<CurrentUser>(res);

  if (!data) {
    throw new Error("Invalid profile response");
  }

  return data;
}

export async function uploadUserAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(buildApiUrl("/api/user/upload-avatar"), {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Avatar upload failed");
  }

  const data = await readJson<CurrentUser>(res);

  if (!data) {
    throw new Error("Invalid avatar response");
  }

  return data;
}

export async function fetchNotifications() {
  const res = await fetch(buildApiUrl("/api/notifications"), {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    return { notifications: [], unreadCount: 0 };
  }

  return (await readJson<{
    notifications: any[];
    unreadCount: number;
  }>(res)) || { notifications: [], unreadCount: 0 };
}

export async function markAllNotificationsRead() {
  const res = await fetch(buildApiUrl("/api/notifications/read-all"), {
    method: "PATCH",
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to mark notifications as read");
  }
}

export async function searchApp(query: string): Promise<SearchResult[]> {
  const q = query.trim();

  if (!q) {
    return [];
  }

  const res = await fetch(
    `${buildApiUrl("/api/search")}?q=${encodeURIComponent(q)}`,
    {
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!res.ok) {
    return [];
  }

  return (await readJson<SearchResult[]>(res)) || [];
}
