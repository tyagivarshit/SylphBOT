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
  | "hydrated"
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
  markLoginResponseReceived: (metadata?: Record<string, unknown>) => void;
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
  markLoginResponseReceived: () => undefined,
  refreshUser: async () => null,
});

const STABILIZATION_ATTEMPTS = 1;
const DEFAULT_ATTEMPTS = 1;
const STABILIZATION_DELAY_MS = 0;
const DEFAULT_DELAY_MS = 0;
const AUTH_REFRESH_DEBOUNCE_MS = 0;
const AUTH_STABILIZE_EVENT_COOLDOWN_MS = 0;
const PUBLIC_ROUTE_DEFERRED_PROBE_DELAY_MS = 760;
const AUTH_LOGIN_WINDOW_MAX_MS = 18000;

type LoginWindowState = {
  active: boolean;
  startedAt: number;
  loginResponseReceivedAt: number | null;
  sessionReadyAt: number | null;
  source: string | null;
};

const createInactiveLoginWindowState = (): LoginWindowState => ({
  active: false,
  startedAt: 0,
  loginResponseReceivedAt: null,
  sessionReadyAt: null,
  source: null,
});

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isTransientLifecycleState = (state: AuthLifecycleState) =>
  state === "authenticating" ||
  state === "session_stabilizing" ||
  state === "retrying";

const computeBackoffMs = (baseMs: number, attempt: number) =>
  Math.min(1400, baseMs + attempt * 160 + Math.floor(Math.random() * 80));

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
  const lifecycleStateRef = useRef<AuthLifecycleState>("anonymous");
  const inflightBootstrapRef = useRef<Promise<AuthUser | null> | null>(null);
  const lastRefreshProbeAtRef = useRef(0);
  const lastStabilizeEventDispatchAtRef = useRef(0);
  const pendingPublicProbeTimeoutRef = useRef<number | null>(null);
  const pendingStabilizeDispatchTimeoutRef = useRef<number | null>(null);
  const loginWindowRef = useRef<LoginWindowState>(createInactiveLoginWindowState());

  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  useEffect(() => {
    lifecycleStateRef.current = lifecycleState;
  }, [lifecycleState]);

  useEffect(() => {
    return () => {
      if (
        pendingPublicProbeTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(pendingPublicProbeTimeoutRef.current);
        pendingPublicProbeTimeoutRef.current = null;
      }
      if (
        pendingStabilizeDispatchTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(pendingStabilizeDispatchTimeoutRef.current);
        pendingStabilizeDispatchTimeoutRef.current = null;
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

  const persistAuthState = useCallback((nextUser: AuthUser | null) => {
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
  }, []);

  const closeLoginWindow = useCallback(() => {
    loginWindowRef.current = createInactiveLoginWindowState();
  }, []);

  const openLoginWindow = useCallback((source: string) => {
    loginWindowRef.current = {
      active: true,
      startedAt: Date.now(),
      loginResponseReceivedAt: null,
      sessionReadyAt: null,
      source,
    };
  }, []);

  const isLoginWindowActive = useCallback(() => {
    const windowState = loginWindowRef.current;
    if (!windowState.active) {
      return false;
    }
    if (Date.now() - windowState.startedAt > AUTH_LOGIN_WINDOW_MAX_MS) {
      loginWindowRef.current = createInactiveLoginWindowState();
      return false;
    }
    return true;
  }, []);

  const beginAuthentication = useCallback(() => {
    if (
      pendingPublicProbeTimeoutRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(pendingPublicProbeTimeoutRef.current);
      pendingPublicProbeTimeoutRef.current = null;
    }
    if (
      pendingStabilizeDispatchTimeoutRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(pendingStabilizeDispatchTimeoutRef.current);
      pendingStabilizeDispatchTimeoutRef.current = null;
    }

    openLoginWindow("login_submit");
    markLifecycle("authenticating", "AUTHENTICATING", {
      source: "login_submit",
    });
    recordMetric("login_submit", 1, {
      routeContext,
      source: "login_submit",
    });
  }, [markLifecycle, openLoginWindow, recordMetric, routeContext]);

  const markLoginResponseReceived = useCallback(
    (metadata?: Record<string, unknown>) => {
      if (!isLoginWindowActive()) {
        openLoginWindow("login_response_received");
      }
      const now = Date.now();
      const startedAt = loginWindowRef.current.startedAt || now;
      loginWindowRef.current.loginResponseReceivedAt = now;
      recordMetric("login_response_received", now - startedAt, {
        routeContext,
        ...(metadata || {}),
      });
    },
    [isLoginWindowActive, openLoginWindow, recordMetric, routeContext]
  );

  const shouldClearTerminalAuthState = useCallback(
    (result: AuthCurrentUserFetchResult | null) =>
      Boolean(result?.state === "FAILED_TERMINAL" && result?.clearableTerminal),
    []
  );

  const fetchUser = useCallback(
    async (options?: RefreshUserOptions) => {
      const mode = options?.mode || "default";
      const source = options?.source || "manual";
      const sourceNormalized = source.trim().toLowerCase();
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
          recordMetric("bootstrap_skipped", 1, {
            source,
            mode,
            routeContext,
            reason: "event_refresh_debounced",
            debounceMs: AUTH_REFRESH_DEBOUNCE_MS,
          });
          return inflightBootstrapRef.current || currentUserRef.current;
        }
      }

      const loginWindowActive = isLoginWindowActive();
      const allowDuringLoginWindow =
        sourceNormalized.includes("login") ||
        sourceNormalized.includes("stabilize") ||
        sourceNormalized === "event_refresh";

      if (loginWindowActive && mode === "default" && !allowDuringLoginWindow) {
        recordMetric("bootstrap_skipped", 1, {
          source,
          mode,
          routeContext,
          reason: "login_window_active",
        });
        return inflightBootstrapRef.current || currentUserRef.current;
      }

      if (
        mode === "default" &&
        sourceNormalized === "public_route_probe" &&
        isTransientLifecycleState(lifecycleStateRef.current)
      ) {
        recordMetric("bootstrap_skipped", 1, {
          source,
          mode,
          routeContext,
          reason: "transient_lifecycle_probe_suppressed",
          lifecycleState: lifecycleStateRef.current,
        });
        return inflightBootstrapRef.current || currentUserRef.current;
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
        recordMetric("bootstrap_reused", 1, {
          source,
          mode,
          routeContext,
        });
        return inflightBootstrapRef.current;
      }

      const run = (async () => {
        const startedAt = performance.now();
        recordMetric("bootstrap_started", 1, {
          source,
          mode,
          routeContext,
          requestRouteContext,
        });

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
            currentUserRef.current = nextUser;
            persistAuthState(nextUser);
            queryClient.setQueryData(["me"], nextUser);

            if (isLoginWindowActive() && !loginWindowRef.current.sessionReadyAt) {
              loginWindowRef.current.sessionReadyAt = Date.now();
              recordMetric(
                "cookie/session_ready",
                loginWindowRef.current.sessionReadyAt -
                  (loginWindowRef.current.startedAt || Date.now()),
                {
                  source,
                  mode,
                  routeContext,
                }
              );
            }

            markLifecycle("authenticated", "AUTHENTICATED", {
              source,
              mode,
              attempts: attempt + 1,
              routeContext,
            });
            markLifecycle("hydrated", "HYDRATED", {
              source,
              mode,
              attempts: attempt + 1,
              routeContext,
            });
            closeLoginWindow();

            recordMetric("bootstrap_completed", performance.now() - startedAt, {
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
          await wait(computeBackoffMs(baseDelayMs, attempt));
        }

        if (
          result &&
          (result.state === "PROCESSING" ||
            result.state === "RETRYING" ||
            result.state === "STABILIZING")
        ) {
          recordMetric("bootstrap_failed_transient", performance.now() - startedAt, {
            source,
            mode,
            routeContext,
            reason: result.reason || null,
            code: result.code || null,
            state: result.state,
          });

          const hasExistingSession = Boolean(currentUserRef.current);
          const shouldContinueTransient =
            hasExistingSession ||
            mode === "stabilize" ||
            routeContext === "AUTHENTICATED_APP_ROUTE" ||
            isLoginWindowActive() ||
            lifecycleStateRef.current === "authenticating";

          if (!shouldContinueTransient) {
            markLifecycle("anonymous", "UNAUTHENTICATED_PUBLIC_ROUTE", {
              source,
              mode,
              routeContext,
              reason: result.reason || null,
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
              sinceLastStabilizeDispatchMs >= AUTH_STABILIZE_EVENT_COOLDOWN_MS &&
              pendingStabilizeDispatchTimeoutRef.current === null
            ) {
              lastStabilizeEventDispatchAtRef.current = Date.now();
              pendingStabilizeDispatchTimeoutRef.current = window.setTimeout(() => {
                pendingStabilizeDispatchTimeoutRef.current = null;
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

        const clearTerminalState = shouldClearTerminalAuthState(result);
        const holdDuringConvergence =
          isLoginWindowActive() ||
          isTransientLifecycleState(lifecycleStateRef.current);

        if (!clearTerminalState || holdDuringConvergence) {
          const deferredState: AuthLifecycleState = holdDuringConvergence
            ? currentUserRef.current
              ? "retrying"
              : "session_stabilizing"
            : currentUserRef.current
            ? "retrying"
            : "anonymous";
          const deferredReason = holdDuringConvergence
            ? "FAILED_TERMINAL_DEFERRED"
            : "UNAUTHENTICATED_UNCLEARED";
          recordMetric("bootstrap_failed_transient", performance.now() - startedAt, {
            source,
            mode,
            routeContext,
            reason: result?.reason || null,
            code: result?.code || null,
            deferredTerminal: true,
            clearableTerminal: result?.clearableTerminal || false,
            holdDuringConvergence,
          });
          markLifecycle(deferredState, deferredReason, {
            source,
            mode,
            routeContext,
            reason: result?.reason || null,
            code: result?.code || null,
            holdDuringConvergence,
          });
          return currentUserRef.current;
        }

        setUser(null);
        currentUserRef.current = null;
        persistAuthState(null);
        queryClient.setQueryData(["me"], null);
        closeLoginWindow();
        markLifecycle("failed_terminal", "FAILED_TERMINAL", {
          source,
          mode,
          routeContext,
          reason: result?.reason || null,
          code: result?.code || null,
        });
        recordMetric("bootstrap_failed_terminal", performance.now() - startedAt, {
          source,
          mode,
          routeContext,
          reason: result?.reason || null,
          code: result?.code || null,
        });
        recordMetric("auth_terminal_failure", performance.now() - startedAt, {
          source,
          mode,
          routeContext,
          reason: result?.reason || null,
          code: result?.code || null,
        });
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
    [
      closeLoginWindow,
      isLoginWindowActive,
      markLifecycle,
      persistAuthState,
      queryClient,
      recordMetric,
      routeContext,
      shouldClearTerminalAuthState,
    ]
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
      recordMetric("bootstrap_skipped", 1, {
        source: "initial_bootstrap_skip",
        routeContext,
      });
      setLoading(false);
      if (typeof window !== "undefined" && !isLoginWindowActive()) {
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
  }, [fetchUser, isLoginWindowActive, markLifecycle, recordMetric, routeContext]);

  useEffect(() => {
    const handler = () =>
      void fetchUser({
        mode:
          isTransientLifecycleState(lifecycleStateRef.current) ||
          isLoginWindowActive()
            ? "stabilize"
            : "default",
        source: "event_refresh",
      });

    window.addEventListener("auth:refresh", handler);
    return () => window.removeEventListener("auth:refresh", handler);
  }, [fetchUser, isLoginWindowActive]);

  useEffect(() => {
    const logoutHandler = () => {
      closeLoginWindow();
      if (
        pendingPublicProbeTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(pendingPublicProbeTimeoutRef.current);
        pendingPublicProbeTimeoutRef.current = null;
      }
      if (
        pendingStabilizeDispatchTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(pendingStabilizeDispatchTimeoutRef.current);
        pendingStabilizeDispatchTimeoutRef.current = null;
      }

      setUser(null);
      currentUserRef.current = null;
      persistAuthState(null);
      queryClient.setQueryData(["me"], null);
      markLifecycle("anonymous", "LOGOUT", {
        source: "auth:logout",
      });
      recordMetric("bootstrap_skipped", 1, {
        source: "auth:logout",
        reason: "explicit_logout",
      });
      setLoading(false);
    };

    window.addEventListener("auth:logout", logoutHandler);
    return () => window.removeEventListener("auth:logout", logoutHandler);
  }, [closeLoginWindow, markLifecycle, persistAuthState, queryClient, recordMetric]);

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
        markLoginResponseReceived,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
