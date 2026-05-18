"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchCurrentUserLifecycle,
  type AuthCurrentUserFetchResult,
  type CurrentUser,
} from "@/lib/userApi";
import {
  classifyAuthRouteContext,
  type AuthRouteContext,
} from "@/lib/authRouteContext";

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
  routeContext: AuthRouteContext;
  beginAuthentication: () => void;
  refreshUser: (options?: RefreshUserOptions) => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  lifecycleState: "anonymous",
  lifecycleReason: null,
  routeContext: "PUBLIC_AUTH_ROUTE",
  beginAuthentication: () => undefined,
  refreshUser: async () => null,
});

const STABILIZATION_ATTEMPTS = 4;
const DEFAULT_ATTEMPTS = 2;
const STABILIZATION_DELAY_MS = 240;
const DEFAULT_DELAY_MS = 120;
const AUTH_REFRESH_DEBOUNCE_MS = 640;
const AUTH_STABILIZE_EVENT_COOLDOWN_MS = 1400;
const PUBLIC_ROUTE_DEFERRED_PROBE_DELAY_MS = 640;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const pathname = usePathname();
  const routeContext = useMemo(
    () => classifyAuthRouteContext(pathname),
    [pathname]
  );
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lifecycleState, setLifecycleState] = useState<AuthLifecycleState>("anonymous");
  const [lifecycleReason, setLifecycleReason] = useState<string | null>(null);

  const hasFetched = useRef(false);
  const currentUserRef = useRef<AuthUser | null>(null);
  const inflightBootstrapRef = useRef<Promise<AuthUser | null> | null>(null);
  const lastRefreshProbeAtRef = useRef(0);
  const lastStabilizeEventDispatchAtRef = useRef(0);
  const pendingPublicProbeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  useEffect(() => {
    return () => {
      if (
        pendingPublicProbeTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(pendingPublicProbeTimeoutRef.current);
        pendingPublicProbeTimeoutRef.current = null;
      }
    };
  }, []);

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
    if (
      pendingPublicProbeTimeoutRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(pendingPublicProbeTimeoutRef.current);
      pendingPublicProbeTimeoutRef.current = null;
    }
    markLifecycle("authenticating", "AUTHENTICATING", {
      source: "login_submit",
    });
  }, [markLifecycle]);

  const fetchUser = useCallback(
    async (options?: RefreshUserOptions) => {
      const mode = options?.mode || "default";
      const source = options?.source || "manual";
      const now = Date.now();
      if (source === "event_refresh") {
        const deltaSinceLastProbe = now - lastRefreshProbeAtRef.current;
        if (
          deltaSinceLastProbe >= 0 &&
          deltaSinceLastProbe < AUTH_REFRESH_DEBOUNCE_MS
        ) {
          recordMetric("auth_duplicate_probe_count", 1, {
            source,
            mode,
            routeContext,
            deltaSinceLastProbe,
            debounceMs: AUTH_REFRESH_DEBOUNCE_MS,
          });
          return inflightBootstrapRef.current || currentUserRef.current;
        }
      }
      lastRefreshProbeAtRef.current = now;
      const canUseTransientRetry =
        mode === "stabilize" || routeContext === "AUTHENTICATED_APP_ROUTE";
      const requestRouteContext: AuthRouteContext =
        mode === "stabilize" ? "AUTHENTICATED_APP_ROUTE" : routeContext;

      if (inflightBootstrapRef.current) {
        recordMetric("auth_inflight_reused", 1, {
          mode,
          source,
          routeContext,
        });
        recordMetric("auth_parallel_me_collapsed", 1, {
          mode,
          source,
          routeContext,
        });
        recordMetric("auth_singleflight_hits", 1, {
          mode,
          source,
          routeContext,
        });
        return inflightBootstrapRef.current;
      }

      const run = (async () => {
        const startedAt = performance.now();
        const maxAttempts = canUseTransientRetry
          ? mode === "stabilize"
            ? STABILIZATION_ATTEMPTS
            : DEFAULT_ATTEMPTS
          : 1;
        const baseDelayMs = mode === "stabilize" ? STABILIZATION_DELAY_MS : DEFAULT_DELAY_MS;

        if (mode === "stabilize") {
          markLifecycle("session_stabilizing", "STABILIZING", {
            source,
            routeContext,
          });
        } else if (!currentUserRef.current && canUseTransientRetry) {
          markLifecycle("authenticating", "PROCESSING", {
            source,
            routeContext,
          });
        }

        let attempt = 0;
        let result: AuthCurrentUserFetchResult | null = null;
        let recoveredFromTimeout = false;

        while (attempt < maxAttempts) {
          result = await fetchCurrentUserLifecycle({
            routeContext: requestRouteContext,
            allowTransientRetry: canUseTransientRetry,
            source,
          });

          if (result.state === "AUTHENTICATED" && result.user) {
            const nextUser = result.user;
            setUser(nextUser);
            persistAuthState(nextUser);
            queryClient.setQueryData(["me"], nextUser);
            markLifecycle("authenticated", "AUTHENTICATED", {
              source,
              mode,
              attempts: attempt + 1,
              routeContext,
            });

            recordMetric("auth_session_ready", performance.now() - startedAt, {
              source,
              mode,
              attempts: attempt + 1,
              routeContext,
            });
            recordMetric("auth_bootstrap_ms", performance.now() - startedAt, {
              source,
              mode,
              routeContext,
            });
            recordMetric("auth_fastlane_success_rate", 1, {
              source,
              mode,
              routeContext,
            });
            if (mode === "stabilize") {
              recordMetric("auth_stabilization_ms", performance.now() - startedAt, {
                source,
                attempts: attempt + 1,
                routeContext,
              });
              recordMetric(
                "auth_stabilization_duration_ms",
                performance.now() - startedAt,
                {
                  source,
                  attempts: attempt + 1,
                  routeContext,
                }
              );
            }

            if (recoveredFromTimeout || attempt > 0) {
              recordMetric("auth_timeout_recovered", performance.now() - startedAt, {
                source,
                attempts: attempt + 1,
                routeContext,
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
            routeContext,
          });
          await wait(baseDelayMs + attempt * 120);
        }

        if (
          result &&
          (result.state === "PROCESSING" ||
            result.state === "RETRYING" ||
            result.state === "STABILIZING")
        ) {
          if (!canUseTransientRetry) {
            setUser(null);
            persistAuthState(null);
            markLifecycle("anonymous", "UNAUTHENTICATED_PUBLIC_ROUTE", {
              source,
              mode,
              routeContext,
              reason: result.reason || null,
            });
            return null;
          }

          const hasExistingSession = Boolean(currentUserRef.current);
          const shouldContinueTransient =
            hasExistingSession ||
            mode === "stabilize" ||
            routeContext === "AUTHENTICATED_APP_ROUTE";

          if (!shouldContinueTransient) {
            setUser(null);
            persistAuthState(null);
            markLifecycle("failed_terminal", "FAILED_TERMINAL", {
              source,
              mode,
              routeContext,
              reason: result.reason || null,
            });
            recordMetric("auth_terminal_failure", performance.now() - startedAt, {
              source,
              mode,
              routeContext,
              reason: result.reason || null,
              code: result.code || null,
            });
            return null;
          }

          markLifecycle(
            hasExistingSession ? "retrying" : "session_stabilizing",
            result.state,
            {
              source,
              mode,
              routeContext,
              reason: result.reason || null,
              preservedExistingSession: hasExistingSession,
            }
          );

          if (hasExistingSession) {
            recordMetric("auth_timeout_recovered", performance.now() - startedAt, {
              source,
              mode,
              routeContext,
              preservedExistingSession: true,
            });
          } else if (
            typeof window !== "undefined" &&
            (mode === "stabilize" || routeContext === "AUTHENTICATED_APP_ROUTE")
          ) {
            const sinceLastStabilizeDispatchMs =
              Date.now() - lastStabilizeEventDispatchAtRef.current;
            if (
              sinceLastStabilizeDispatchMs >= AUTH_STABILIZE_EVENT_COOLDOWN_MS
            ) {
              lastStabilizeEventDispatchAtRef.current = Date.now();
              window.setTimeout(() => {
                window.dispatchEvent(new Event("auth:refresh"));
              }, 420);
            } else {
              recordMetric("auth_duplicate_probe_count", 1, {
                source,
                mode,
                routeContext,
                reason: "stabilize_event_cooldown",
                sinceLastStabilizeDispatchMs,
                cooldownMs: AUTH_STABILIZE_EVENT_COOLDOWN_MS,
              });
            }
          }
          return currentUserRef.current;
        }

        if (mode === "stabilize") {
          setUser(null);
          persistAuthState(null);
          markLifecycle("failed_terminal", "FAILED_TERMINAL", {
            source,
            routeContext,
            reason: result?.reason || null,
          });
          recordMetric("auth_terminal_failure", performance.now() - startedAt, {
            source,
            mode,
            routeContext,
            reason: result?.reason || null,
            code: result?.code || null,
          });
        } else {
          setUser(null);
          persistAuthState(null);
          markLifecycle("anonymous", "FAILED_TERMINAL", {
            source,
            routeContext,
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
    [markLifecycle, queryClient, recordMetric, routeContext]
  );

  useEffect(() => {
    if (hasFetched.current) {
      return;
    }
    hasFetched.current = true;

    const hasSessionHint = () => {
      if (typeof window === "undefined") {
        return false;
      }

      const transportHint = String(
        sessionStorage.getItem("auth_token_transport") || ""
      )
        .trim()
        .toLowerCase();
      if (transportHint === "cookie_http_only") {
        return true;
      }

      const rawAuthState = sessionStorage.getItem("auth_state");
      if (!rawAuthState) {
        return false;
      }

      try {
        const parsed = JSON.parse(rawAuthState) as { status?: unknown };
        return String(parsed?.status || "").trim().toLowerCase() === "authenticated";
      } catch {
        return false;
      }
    };

    if (routeContext === "PUBLIC_AUTH_ROUTE" && !hasSessionHint()) {
      markLifecycle("anonymous", "UNAUTHENTICATED_PUBLIC_ROUTE", {
        source: "initial_bootstrap_skip",
        routeContext,
      });
      setLoading(false);
      if (typeof window !== "undefined") {
        pendingPublicProbeTimeoutRef.current = window.setTimeout(() => {
          pendingPublicProbeTimeoutRef.current = null;
          void fetchUser({
            isInitial: false,
            mode: "default",
            source: "public_route_probe",
          });
        }, PUBLIC_ROUTE_DEFERRED_PROBE_DELAY_MS);
      }
      return;
    }

    void fetchUser({
      isInitial: true,
      mode: "default",
      source: "initial_bootstrap",
    });
  }, [fetchUser, markLifecycle, routeContext]);

  useEffect(() => {
    const handler = () =>
      void fetchUser({
        mode:
          lifecycleState === "session_stabilizing" ||
          lifecycleState === "retrying" ||
          lifecycleState === "authenticating"
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
        routeContext,
        beginAuthentication,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
