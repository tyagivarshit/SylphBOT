export {
  buildAbsoluteApiUrl,
  buildApiUrl,
  buildAppUrl,
  getApiBaseUrl,
} from "@/lib/url";

import { apiFetch } from "@/lib/apiClient";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  phone?: string | null;
  avatar?: string | null;
  businessId?: string | null;
  workspace?: {
    id: string;
    name?: string | null;
  } | null;
  business?: {
    id: string;
    name?: string | null;
    website?: string | null;
    industry?: string | null;
    teamSize?: string | null;
    type?: string | null;
    timezone?: string | null;
  } | null;
  connectedAccounts?: {
    instagram?: {
      connected: boolean;
      pageId?: string | null;
      healthy?: boolean;
    };
    whatsapp?: {
      connected: boolean;
      phoneNumberId?: string | null;
      healthy?: boolean;
    };
    totalConnected?: number;
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

export type ClientConnectionStatus = {
  instagram: {
    connected: boolean;
    pageId: string | null;
    healthy: boolean;
  };
  whatsapp: {
    connected: boolean;
    phoneNumberId: string | null;
    healthy: boolean;
  };
};

const requireSuccess = <T>(data: T | null, message: string) => {
  if (data == null) {
    throw new Error(message);
  }

  return data;
};

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await apiFetch<CurrentUser>("/api/user/me", {
    cache: "no-store",
    timeoutMs: 1800,
  });

  return response.success ? response.data : null;
}

export async function updateCurrentUser(body: Record<string, unknown>) {
  const response = await apiFetch<CurrentUser>("/api/user/update", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  if (!response.success) {
    throw new Error(response.message || "Update failed");
  }

  return requireSuccess(response.data, "Invalid profile response");
}

export async function uploadUserAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiFetch<CurrentUser>("/api/user/upload-avatar", {
    method: "POST",
    body: formData,
  });

  if (!response.success) {
    throw new Error(response.message || "Avatar upload failed");
  }

  return requireSuccess(response.data, "Invalid avatar response");
}

export async function changeUserPassword(body: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const response = await apiFetch<Record<string, unknown>>("/api/user/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.success) {
    throw new Error(response.message || "Password update failed");
  }

  return response.data;
}

export async function fetchWorkspaceApiKey() {
  const response = await apiFetch<{ apiKey?: string }>("/api/user/api-key", {
    cache: "no-store",
  });

  if (!response.success || !response.data?.apiKey) {
    throw new Error(response.message || "Failed to load API key");
  }

  return response.data.apiKey;
}

export async function fetchClientConnectionStatus(): Promise<ClientConnectionStatus> {
  const response = await apiFetch<ClientConnectionStatus>("/api/client/status", {
    cache: "no-store",
  });

  if (!response.success) {
    throw new Error(response.message || "Failed to load connection status");
  }

  return requireSuccess(response.data, "Failed to load connection status");
}

export async function fetchNotifications() {
  const response = await apiFetch<{
    notifications?: any[];
    unreadCount?: number;
  }>("/api/notifications", {
    cache: "no-store",
  });

  if (!response.success) {
    return { notifications: [], unreadCount: 0 };
  }

  return {
    notifications: response.data?.notifications || [],
    unreadCount: response.data?.unreadCount ?? 0,
  };
}

export async function markAllNotificationsRead() {
  const response = await apiFetch("/api/notifications/read-all", {
    method: "PATCH",
  });

  if (!response.success) {
    throw new Error(response.message || "Failed to mark notifications as read");
  }
}

export async function searchApp(query: string): Promise<SearchResult[]> {
  const value = query.trim();

  if (!value) {
    return [];
  }

  const response = await apiFetch<SearchResult[]>(
    `/api/search?q=${encodeURIComponent(value)}`,
    {
      cache: "no-store",
    }
  );

  return response.success && Array.isArray(response.data) ? response.data : [];
}
