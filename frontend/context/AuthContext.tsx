"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUser, type CurrentUser } from "@/lib/userApi";
import { apiFetch } from "@/lib/apiClient";

export type AuthUser = CurrentUser & {
  role?: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  refreshUser: async () => null,
});

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hasFetched = useRef(false);
  const bootHydrationInFlight = useRef<Promise<void> | null>(null);
  const bootHydrationUserIdRef = useRef<string | null>(null);

  const recordMetric = useCallback(
    (name: string, valueMs: number, metadata?: Record<string, unknown>) => {
      if (typeof window === "undefined") {
        return;
      }

      const payload = {
        valueMs: Math.max(0, Math.round(valueMs)),
        metadata: metadata || {},
        recordedAt: new Date().toISOString(),
      };

      console.info(name, payload);
    },
    []
  );

  const warmWorkspaceHydration = useCallback(
    async (nextUser: AuthUser) => {
      if (!nextUser?.id) {
        return;
      }

      if (
        bootHydrationInFlight.current &&
        bootHydrationUserIdRef.current === nextUser.id
      ) {
        return bootHydrationInFlight.current;
      }

      const task = (async () => {
        const startedAt = performance.now();

        const [dashboard, billing, automation, integrations, profile] =
          await Promise.allSettled([
            apiFetch("/api/dashboard/stats", {
              cache: "no-store",
              timeoutMs: 3600,
            }),
            apiFetch("/api/billing", {
              cache: "no-store",
              timeoutMs: 3800,
            }),
            apiFetch("/api/automation/flows", {
              cache: "no-store",
              timeoutMs: 3200,
            }),
            apiFetch("/api/clients", {
              cache: "no-store",
              timeoutMs: 3200,
            }),
            apiFetch("/api/user/profile", {
              cache: "no-store",
              timeoutMs: 2800,
            }),
          ]);

        if (
          billing.status === "fulfilled" &&
          billing.value.success &&
          billing.value.data
        ) {
          queryClient.setQueryData(["billing"], billing.value.data);
        }

        if (
          integrations.status === "fulfilled" &&
          integrations.value.success &&
          Array.isArray(integrations.value.data)
        ) {
          queryClient.setQueryData(["integrations"], integrations.value.data);
        }

        if (
          profile.status === "fulfilled" &&
          profile.value.success &&
          profile.value.data &&
          typeof profile.value.data === "object"
        ) {
          queryClient.setQueryData(["profile"], profile.value.data);
        }

        const hydratedSections = [
          dashboard.status === "fulfilled" && dashboard.value.success
            ? "dashboard"
            : null,
          billing.status === "fulfilled" && billing.value.success
            ? "billing"
            : null,
          automation.status === "fulfilled" && automation.value.success
            ? "automation"
            : null,
          integrations.status === "fulfilled" && integrations.value.success
            ? "integrations"
            : null,
          profile.status === "fulfilled" && profile.value.success
            ? "profile"
            : null,
        ].filter(Boolean);

        recordMetric("APP_BOOT_MS", performance.now() - startedAt, {
          userId: nextUser.id,
          hydratedSections,
        });
      })()
        .catch(() => undefined)
        .finally(() => {
          if (bootHydrationInFlight.current === task) {
            bootHydrationInFlight.current = null;
          }
        });

      bootHydrationUserIdRef.current = nextUser.id;
      bootHydrationInFlight.current = task;
      return task;
    },
    [queryClient, recordMetric]
  );

  const persistAuthState = (nextUser: AuthUser | null) => {
    if (typeof window === "undefined") {
      return;
    }

    if (!nextUser) {
      sessionStorage.removeItem("auth_state");
      sessionStorage.removeItem("auth_tenant_id");
      sessionStorage.removeItem("auth_workspace_id");
      sessionStorage.removeItem("auth_token_transport");
      return;
    }

    const workspaceId = nextUser.workspace?.id || nextUser.business?.id || null;
    const tenantId = nextUser.businessId || workspaceId || null;

    sessionStorage.setItem(
      "auth_state",
      JSON.stringify({
        status: "authenticated",
        userId: nextUser.id,
        tenantId,
        workspaceId,
        hydratedAt: new Date().toISOString(),
      })
    );

    sessionStorage.setItem("auth_tenant_id", tenantId || "");
    sessionStorage.setItem("auth_workspace_id", workspaceId || "");
    sessionStorage.setItem("auth_token_transport", "cookie_http_only");
  };

  const fetchUser = useCallback(async (options?: { isInitial?: boolean }) => {
    const startedAt = performance.now();

    try {
      const nextUser = await fetchCurrentUser();

      if (!nextUser) {
        setUser(null);
        persistAuthState(null);
        return null;
      }

      setUser(nextUser);
      persistAuthState(nextUser);
      queryClient.setQueryData(["me"], nextUser);
      void warmWorkspaceHydration(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      persistAuthState(null);
      return null;
    } finally {
      recordMetric("AUTH_MS", performance.now() - startedAt, {
        initial: Boolean(options?.isInitial),
      });
      if (options?.isInitial) {
        setLoading(false);
      }
    }
  }, [queryClient, recordMetric, warmWorkspaceHydration]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    void fetchUser({
      isInitial: true,
    });
  }, [fetchUser]);

  useEffect(() => {
    const handler = () => void fetchUser();

    window.addEventListener("auth:refresh", handler);
    return () =>
      window.removeEventListener("auth:refresh", handler);
  }, [fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
