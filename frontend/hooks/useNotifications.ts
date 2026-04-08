import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/userApi";

export function useNotifications() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/notifications"), {
        credentials: "include",
      });
      return res.json();
    },
    refetchInterval: 5000, // 🔥 real-time feel
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      fetch(buildApiUrl(`/api/notifications/${id}/read`), {
        method: "PATCH",
        credentials: "include",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const clearAll = useMutation({
    mutationFn: () =>
      fetch(buildApiUrl("/api/notifications/read-all"), {
        method: "PATCH",
        credentials: "include",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    notifications: query.data || [],
    isLoading: query.isLoading,
    markRead,
    clearAll,
  };
}
