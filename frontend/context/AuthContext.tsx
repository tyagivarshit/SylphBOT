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
import {
  fetchCurrentUserLifecycle,
  type AuthCurrentUserFetchResult,
  type CurrentUser,
} from "@/lib/userApi";

export type AuthUser = CurrentUser & {
  role?: string;
};

export type AuthLifecycleState =
  | "authenticating"
  | "session_stabilizing"
  | "authenticated"
  | "retrying"
  | "failed_terminal"
  | "anonymous";

type RefreshUserMode = "default" | "stabilize";

type RefreshUserOptions = {
  mode?: RefreshUserMode;
  source?: string;
  isInitial?: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  lifecycleState: AuthLifecycleState;
  lifecycleReason: string | null;
  beginAuthentication: () => void;
  refreshUser: (options?: RefreshUserOptions) => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  lifecycleState: "anonymous",
  lifecycleReason: null,
  beginAuthentication: () => undefined,
  refreshUser: async () => null,
});

const STABILIZATION_ATTEMPTS = 5;
const DEFAULT_ATTEMPTS = 2;
const STABILIZATION_DELAY_MS = 150;
const DEFAULT_DELAY_MS = 90;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lifecycleState, setLifecycleState] = useState<AuthLifecycleState>("anonymous");
  const [lifecycleReason, setLifecycleReason] = useState<string | null>(null);

  const hasFetched = useRef(false);
  const currentUserRef = useRef<AuthUser | null>(null);
  const inflightBootstrapRef = useRef<Promise<AuthUser | null> | null>(null);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

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

  const markLifecycle = useCallback(
    (
      state: AuthLifecycleState,
      reason: string | null,
      metadata?: Record<string, unknown>
    ) => {
      setLifecycleState(state);
      setLifecycleReason(reason);
      recordMetric("auth_processing_state", 1, {
        state: state.toUpperCase(),
        reason,
        lifecycleState: state,
        ...(metadata || {}),
      });
    },
    [recordMetric]
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

  const beginAuthentication = useCallback(() => {
    markLifecycle("authenticating", "AUTHENTICATING", {
      source: "login_submit",
    });
  }, [markLifecycle]);

  const fetchUser = useCallback(
    async (options?: RefreshUserOptions) => {
      const mode = options?.mode || "default";
      const source = options?.source || "manual";

      if (inflightBootstrapRef.current) {
        recordMetric("auth_inflight_reused", 1, {
          mode,
          source,
        });
        recordMetric("auth_parallel_me_collapsed", 1, {
          mode,
          source,
        });
        return inflightBootstrapRef.current;
      }

      const run = (async () => {
        const startedAt = performance.now();
        const maxAttempts = mode === "stabilize" ? STABILIZATION_ATTEMPTS : DEFAULT_ATTEMPTS;
        const baseDelayMs = mode === "stabilize" ? STABILIZATION_DELAY_MS : DEFAULT_DELAY_MS;

        if (mode === "stabilize") {
          markLifecycle("session_stabilizing", "STABILIZING", {
            source,
          });
        } else if (!currentUserRef.current) {
          markLifecycle("authenticating", "PROCESSING", {
            source,
          });
        }

        let attempt = 0;
        let result: AuthCurrentUserFetchResult | null = null;
        let recoveredFromTimeout = false;

        while (attempt < maxAttempts) {
          result = await fetchCurrentUserLifecycle();

          if (result.state === "AUTHENTICATED" && result.user) {
            const nextUser = result.user;
            setUser(nextUser);
            persistAuthState(nextUser);
            queryClient.setQueryData(["me"], nextUser);
            markLifecycle("authenticated", "AUTHENTICATED", {
              source,
              mode,
              attempts: attempt + 1,
            });

            recordMetric("auth_session_ready", performance.now() - startedAt, {
              source,
              mode,
              attempts: attempt + 1,
            });
            recordMetric("auth_bootstrap_ms", performance.now() - startedAt, {
              source,
              mode,
            });
            if (mode === "stabilize") {
              recordMetric("auth_stabilization_ms", performance.now() - startedAt, {
                source,
                attempts: attempt + 1,
              });
            }

            if (recoveredFromTimeout || attempt > 0) {
              recordMetric("auth_timeout_recovered", performance.now() - startedAt, {
                source,
                attempts: attempt + 1,
              });
            }
            return nextUser;
          }

          if (result.state === "FAILED_TERMINAL") {
            break;
          }

          recoveredFromTimeout = true;
          attempt += 1;

          if (attempt >= maxAttempts) {
            break;
          }

          markLifecycle("retrying", "RETRYING", {
            source,
            mode,
            attempt,
            reason: result.reason || null,
          });
          await wait(baseDelayMs + attempt * 120);
        }

        if (
          result &&
          (result.state === "PROCESSING" ||
            result.state === "RETRYING" ||
            result.state === "STABILIZING")
        ) {
          markLifecycle(
            currentUserRef.current ? "retrying" : "session_stabilizing",
            result.state,
            {
              source,
              mode,
              reason: result.reason || null,
              preservedExistingSession: Boolean(currentUserRef.current),
            }
          );

          if (currentUserRef.current) {
            recordMetric("auth_timeout_recovered", performance.now() - startedAt, {
              source,
              mode,
              preservedExistingSession: true,
            });
          } else if (typeof window !== "undefined") {
            window.setTimeout(() => {
              window.dispatchEvent(new Event("auth:refresh"));
            }, 420);
          }
          return currentUserRef.current;
        }

        if (mode === "stabilize") {
          setUser(null);
          persistAuthState(null);
          markLifecycle("failed_terminal", "FAILED_TERMINAL", {
            source,
            reason: result?.reason || null,
          });
          recordMetric("auth_terminal_failure", performance.now() - startedAt, {
            source,
            mode,
            reason: result?.reason || null,
            code: result?.code || null,
          });
        } else {
          setUser(null);
          persistAuthState(null);
          markLifecycle("anonymous", "FAILED_TERMINAL", {
            source,
            reason: result?.reason || null,
          });
        }

        return null;
      })();

      let settled: Promise<AuthUser | null>;
      settled = run.finally(() => {
        if (inflightBootstrapRef.current === settled) {
          inflightBootstrapRef.current = null;
        }
      });

      inflightBootstrapRef.current = settled;

      try {
        return await settled;
      } finally {
        if (options?.isInitial) {
          setLoading(false);
        }
      }
    },
    [markLifecycle, queryClient, recordMetric]
  );

  useEffect(() => {
    if (hasFetched.current) {
      return;
    }
    hasFetched.current = true;

    void fetchUser({
      isInitial: true,
      mode: "default",
      source: "initial_bootstrap",
    });
  }, [fetchUser]);

  useEffect(() => {
    const handler = () =>
      void fetchUser({
        mode:
          lifecycleState === "session_stabilizing" ||
          lifecycleState === "retrying"
            ? "stabilize"
            : "default",
        source: "event_refresh",
      });

    window.addEventListener("auth:refresh", handler);
    return () => window.removeEventListener("auth:refresh", handler);
  }, [fetchUser, lifecycleState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        lifecycleState,
        lifecycleReason,
        beginAuthentication,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
