import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiClient";

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
    refetchInterval: 5000,
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
