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
  }, [queryClient, recordMetric]);

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
