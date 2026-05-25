import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";
import { recordLifecycleEvent } from "@/lib/lifecycleTelemetry";

export function useNotifications() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const response = await apiFetch<{
        notifications?: unknown[];
        unreadCount?: number;
      }>("/api/notifications", {
        credentials: "include",
      });

      if (!response.success || !response.data) {
        throw new Error(response.message || "Failed to load notifications");
      }

      return response.data;
    },
    refetchInterval: (query) => {
      const failureCount = query.state.fetchFailureCount || 0;

      if (failureCount > 0) {
        const delayMs = Math.min(
          120_000,
          15_000 * 2 ** Math.min(failureCount - 1, 3) +
            Math.floor(Math.random() * 250)
        );
        recordLifecycleEvent("polling_backoff_applied", {
          area: "notifications",
          failureCount,
          delayMs,
        });
        return delayMs;
      }

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return 120_000;
      }

      return 30_000;
    },
    refetchIntervalInBackground: false,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });

      if (!response.success) {
        throw new Error(response.message || "Failed to mark notification as read");
      }

      return response.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/api/notifications/read-all", {
        method: "PATCH",
        credentials: "include",
      });

      if (!response.success) {
        throw new Error(response.message || "Failed to clear notifications");
      }

      return response.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    notifications: query.data || [],
    isLoading: query.isLoading,
    markRead,
    clearAll,
  };
}
