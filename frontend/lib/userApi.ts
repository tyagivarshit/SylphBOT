export {
  buildAbsoluteApiUrl,
  buildApiUrl,
  buildAppUrl,
  getApiBaseUrl,
} from "@/lib/url";

import { apiFetch } from "@/lib/apiClient";
import type { ApiResponse } from "@/lib/apiClient";
import type { AuthRouteContext } from "@/lib/authRouteContext";

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
  authLifecycle?: {
    processingState?:
      | "READY"
      | "READY_MINIMAL"
      | "PROCESSING"
      | "RETRYING"
      | "FAILED_TERMINAL"
      | "STABILIZING"
      | string;
    sessionReady?: boolean;
    retryable?: boolean;
    reason?: string | null;
    reusedInFlight?: boolean;
    stabilizationMs?: number;
    timeoutRecovered?: boolean;
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

export type AuthCurrentUserFetchState =
  | "AUTHENTICATED"
  | "PROCESSING"
  | "STABILIZING"
  | "RETRYING"
  | "FAILED_TERMINAL";

export type AuthCurrentUserFetchResult = {
  user: CurrentUser | null;
  state: AuthCurrentUserFetchState;
  retryable: boolean;
  reason: string | null;
  unauthorized: boolean;
  networkError: boolean;
  code: string | null;
  clearableTerminal: boolean;
};

type FetchCurrentUserLifecycleOptions = {
  routeContext?: AuthRouteContext;
  allowTransientRetry?: boolean;
  source?: string;
};

const AUTH_ME_RETRY_DELAY_MS = 180;
const AUTH_ME_TRANSIENT_RETRY_ATTEMPTS = 0;
const AUTH_ME_PROBE_COOLDOWN_MS = 560;
const AUTH_ME_LOGIN_PROBE_COOLDOWN_MS = 900;

const authCurrentUserInFlightByContext = new Map<
  AuthRouteContext,
  Promise<AuthCurrentUserFetchResult>
>();
const authCurrentUserLastProbeAtByContext = new Map<AuthRouteContext, number>();
const authCurrentUserLastResultByContext = new Map<
  AuthRouteContext,
  AuthCurrentUserFetchResult
>();
const sawAuthProcessingStateByContext = new Map<AuthRouteContext, boolean>();

const requireSuccess = <T>(data: T | null, message: string) => {
  if (data == null) {
    throw new Error(message);
  }

  return data;
};

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const result = await fetchCurrentUserLifecycle({
    routeContext: "AUTHENTICATED_APP_ROUTE",
  });
  return result.state === "AUTHENTICATED" ? result.user : null;
}

const normalizeReason = (value: unknown) => String(value || "").trim();

const HARD_TERMINAL_REASON_MARKERS = [
  "invalid refresh token",
  "refresh token invalid",
  "refresh token revoked",
  "session revoked",
  "token revoked",
  "token signature",
  "signature verification",
  "jwt malformed",
  "invalid token",
  "cryptographic",
  "token validation failed",
];

const HARD_TERMINAL_CODE_MARKERS = [
  "AUTH_REFRESH_INVALID",
  "AUTH_REFRESH_REVOKED",
  "AUTH_SESSION_REVOKED",
  "AUTH_TOKEN_INVALID",
  "AUTH_TOKEN_SIGNATURE_INVALID",
  "AUTH_CRYPTO_INVALID",
];

const includesMarker = (value: string, markers: string[]) =>
  markers.some((marker) => value.includes(marker));

const isHardTerminalAuthFailure = (reason: string, code: string) => {
  const normalizedReason = reason.toLowerCase();
  const normalizedCode = code.toUpperCase();
  return (
    includesMarker(normalizedReason, HARD_TERMINAL_REASON_MARKERS) ||
    includesMarker(normalizedCode, HARD_TERMINAL_CODE_MARKERS)
  );
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const mapLifecycleState = (
  value: unknown,
  sessionReady: boolean
): AuthCurrentUserFetchState => {
  const normalized = String(value || "").trim().toUpperCase();

  if (normalized === "FAILED_TERMINAL") {
    return "FAILED_TERMINAL";
  }
  if (normalized === "RETRYING") {
    return "RETRYING";
  }
  if (normalized === "STABILIZING") {
    return "STABILIZING";
  }
  if (normalized === "PROCESSING") {
    return "PROCESSING";
  }
  if (normalized === "READY" || normalized === "READY_MINIMAL" || sessionReady) {
    return "AUTHENTICATED";
  }

  return sessionReady ? "AUTHENTICATED" : "PROCESSING";
};

const recordAuthMetric = (
  name: string,
  metadata?: Record<string, unknown>
) => {
  if (typeof window === "undefined") {
    return;
  }

  console.info(name, {
    metadata: metadata || {},
    recordedAt: new Date().toISOString(),
  });
};

const classifyAuthCurrentUserResponse = (
  response: ApiResponse<CurrentUser>,
  options?: FetchCurrentUserLifecycleOptions
): AuthCurrentUserFetchResult => {
  const routeContext = options?.routeContext || "AUTHENTICATED_APP_ROUTE";
  const allowTransientRetry = Boolean(options?.allowTransientRetry);
  const source = String(options?.source || "unknown").trim().toLowerCase();
  const loginStabilizationSource =
    source.includes("login") ||
    source.includes("stabilize") ||
    source.includes("authenticating");
  const buildResult = (
    input: Partial<AuthCurrentUserFetchResult> & {
      state: AuthCurrentUserFetchState;
    }
  ): AuthCurrentUserFetchResult => ({
    user: input.user ?? null,
    state: input.state,
    retryable: input.retryable ?? false,
    reason: input.reason ?? null,
    unauthorized: input.unauthorized ?? false,
    networkError: input.networkError ?? false,
    code: input.code ?? null,
    clearableTerminal: input.clearableTerminal ?? false,
  });

  if (response.success && response.data) {
    const lifecycle = response.data.authLifecycle || null;
    const lifecycleState = mapLifecycleState(
      lifecycle?.processingState,
      Boolean(lifecycle?.sessionReady)
    );
    const reason = normalizeReason(lifecycle?.reason);

    if (lifecycleState !== "AUTHENTICATED") {
      return buildResult({
        user: response.data,
        state: lifecycleState,
        retryable:
          lifecycle?.retryable !== undefined
            ? Boolean(lifecycle.retryable)
            : lifecycleState !== "FAILED_TERMINAL",
        reason: reason || "session_stabilizing",
        unauthorized: false,
        networkError: false,
        code: response.code || null,
        clearableTerminal: false,
      });
    }

    return buildResult({
      user: response.data,
      state: "AUTHENTICATED",
      retryable: false,
      reason: reason || null,
      unauthorized: false,
      networkError: false,
      code: response.code || null,
      clearableTerminal: false,
    });
  }

  const reason = normalizeReason(response.message);
  const normalizedReason = reason.toLowerCase();
  const normalizedCode = String(response.code || "").trim();
  const isTimeoutLike =
    response.networkError ||
    normalizedReason.includes("timeout") ||
    normalizedReason.includes("timed out");
  const isProcessingAuthGap =
    normalizedReason.includes("session verification timed out");
  const isMissingSessionLike =
    normalizedReason.includes("missing session") ||
    normalizedReason.includes("not authenticated");
  const isUnauthorizedLike =
    normalizedReason === "unauthorized" || isMissingSessionLike;
  const isHardTerminalFailure = isHardTerminalAuthFailure(
    normalizedReason,
    normalizedCode
  );

  if (isHardTerminalFailure) {
    return buildResult({
      user: null,
      state: "FAILED_TERMINAL",
      retryable: false,
      reason: reason || "session_invalid",
      unauthorized: Boolean(response.unauthorized),
      networkError: Boolean(response.networkError),
      code: response.code || null,
      clearableTerminal: true,
    });
  }

  if (
    routeContext !== "AUTHENTICATED_APP_ROUTE" &&
    response.unauthorized
  ) {
    return buildResult({
      user: null,
      state: "FAILED_TERMINAL",
      retryable: false,
      reason: reason || "unauthenticated_public_route",
      unauthorized: true,
      networkError: Boolean(response.networkError),
      code: response.code || null,
      clearableTerminal: false,
    });
  }

  if (isTimeoutLike || isProcessingAuthGap) {
    if (!allowTransientRetry) {
      return buildResult({
        user: null,
        state: "FAILED_TERMINAL",
        retryable: false,
        reason: reason || "unauthenticated_public_route",
        unauthorized: Boolean(response.unauthorized),
        networkError: Boolean(response.networkError),
        code: response.code || null,
        clearableTerminal: false,
      });
    }

    return buildResult({
      user: null,
      state: isTimeoutLike ? "RETRYING" : "STABILIZING",
      retryable: true,
      reason: reason || "session_stabilizing",
      unauthorized: Boolean(response.unauthorized),
      networkError: Boolean(response.networkError),
      code: response.code || null,
      clearableTerminal: false,
    });
  }

  if (response.unauthorized) {
    const sawRecentProcessingState =
      sawAuthProcessingStateByContext.get(routeContext) === true;
    const isTransientUnauthorizedDuringAuthStabilization =
      allowTransientRetry &&
      routeContext === "AUTHENTICATED_APP_ROUTE" &&
      (loginStabilizationSource || sawRecentProcessingState) &&
      !isHardTerminalFailure &&
      (isUnauthorizedLike ||
        normalizedReason.includes("session verification timed out"));

    if (isTransientUnauthorizedDuringAuthStabilization) {
      return buildResult({
        user: null,
        state: "STABILIZING",
        retryable: true,
        reason: reason || "session_stabilizing",
        unauthorized: true,
        networkError: Boolean(response.networkError),
        code: response.code || null,
        clearableTerminal: false,
      });
    }

    if (allowTransientRetry && routeContext === "AUTHENTICATED_APP_ROUTE") {
      return buildResult({
        user: null,
        state: "STABILIZING",
        retryable: true,
        reason: reason || "session_stabilizing",
        unauthorized: true,
        networkError: Boolean(response.networkError),
        code: response.code || null,
        clearableTerminal: false,
      });
    }

    return buildResult({
      user: null,
      state: "FAILED_TERMINAL",
      retryable: false,
      reason: reason || "unauthorized",
      unauthorized: true,
      networkError: Boolean(response.networkError),
      code: response.code || null,
      clearableTerminal: false,
    });
  }

  return buildResult({
    user: null,
    state: "FAILED_TERMINAL",
    retryable: false,
    reason: reason || "auth_fetch_failed",
    unauthorized: Boolean(response.unauthorized),
    networkError: Boolean(response.networkError),
    code: response.code || null,
    clearableTerminal: false,
  });
};

export async function fetchCurrentUserLifecycle(
  options?: FetchCurrentUserLifecycleOptions
): Promise<AuthCurrentUserFetchResult> {
  const routeContext = options?.routeContext || "AUTHENTICATED_APP_ROUTE";
  const allowTransientRetry =
    options?.allowTransientRetry ?? routeContext === "AUTHENTICATED_APP_ROUTE";
  const source = String(options?.source || "unknown").trim() || "unknown";
  const sourceNormalized = source.toLowerCase();
  const probeCooldownMs =
    sourceNormalized.includes("login") || sourceNormalized.includes("stabilize")
      ? Math.max(AUTH_ME_LOGIN_PROBE_COOLDOWN_MS, AUTH_ME_PROBE_COOLDOWN_MS)
      : AUTH_ME_PROBE_COOLDOWN_MS;

  const existing = authCurrentUserInFlightByContext.get(routeContext);
  if (existing) {
    recordAuthMetric("auth_parallel_me_collapsed", {
      source: "frontend_singleflight",
      routeContext,
    });
    recordAuthMetric("auth_inflight_reused", {
      source: "frontend_singleflight",
      routeContext,
    });
    recordAuthMetric("auth_singleflight_hits", {
      source: "frontend_singleflight",
      routeContext,
    });
    return existing;
  }

  const now = Date.now();
  const lastProbeAt = authCurrentUserLastProbeAtByContext.get(routeContext) || 0;
  const lastResult = authCurrentUserLastResultByContext.get(routeContext) || null;
  const probeDeltaMs = now - lastProbeAt;
  const isTransientLastResult =
    lastResult?.state === "PROCESSING" ||
    lastResult?.state === "RETRYING" ||
    lastResult?.state === "STABILIZING";
  if (
    isTransientLastResult &&
    probeDeltaMs >= 0 &&
    probeDeltaMs < probeCooldownMs
  ) {
    recordAuthMetric("auth_duplicate_probe_count", {
      routeContext,
      source,
      probeDeltaMs,
      cooldownMs: probeCooldownMs,
      lastState: lastResult.state,
    });
    return lastResult;
  }

  const run = (async () => {
    let attempt = 0;
    let latestResult: AuthCurrentUserFetchResult | null = null;
    authCurrentUserLastProbeAtByContext.set(routeContext, Date.now());

    while (attempt <= AUTH_ME_TRANSIENT_RETRY_ATTEMPTS) {
      const response = await apiFetch<CurrentUser>("/api/user/me?surface=auth", {
        cache: "no-store",
        timeoutMs: 4200,
        skipUnauthorizedRetry: true,
      });
      const result = classifyAuthCurrentUserResponse(response, {
        routeContext,
        allowTransientRetry,
        source,
      });
      latestResult = result;

      if (
        result.state === "AUTHENTICATED" ||
        result.state === "FAILED_TERMINAL" ||
        !result.retryable
      ) {
        break;
      }

      if (attempt >= AUTH_ME_TRANSIENT_RETRY_ATTEMPTS) {
        break;
      }

      attempt += 1;
      recordAuthMetric("auth_processing_state", {
        state: result.state,
        reason: result.reason,
        attempt,
        routeContext,
        source,
      });
      await wait(AUTH_ME_RETRY_DELAY_MS + attempt * 100);
    }

    const finalResult =
      latestResult ||
      ({
        user: null,
        state: "FAILED_TERMINAL",
        retryable: false,
        reason: "auth_fetch_empty",
        unauthorized: false,
        networkError: false,
        code: null,
        clearableTerminal: false,
      } satisfies AuthCurrentUserFetchResult);

    recordAuthMetric("auth_processing_state", {
      state: finalResult.state,
      reason: finalResult.reason,
      retryable: finalResult.retryable,
      routeContext,
      source,
    });

    if (
      finalResult.state === "PROCESSING" ||
      finalResult.state === "RETRYING" ||
      finalResult.state === "STABILIZING"
    ) {
      sawAuthProcessingStateByContext.set(routeContext, true);
    }

    if (finalResult.state === "AUTHENTICATED") {
      const sawAuthProcessingState =
        sawAuthProcessingStateByContext.get(routeContext) === true;
      recordAuthMetric("auth_session_ready", {
        userId: finalResult.user?.id || null,
        routeContext,
        source,
      });
      if (sawAuthProcessingState) {
        recordAuthMetric("auth_timeout_recovered", {
          userId: finalResult.user?.id || null,
          routeContext,
          source,
        });
      }
      sawAuthProcessingStateByContext.set(routeContext, false);
    }

    if (finalResult.state === "FAILED_TERMINAL") {
      sawAuthProcessingStateByContext.set(routeContext, false);
      recordAuthMetric("auth_terminal_failure", {
        reason: finalResult.reason,
        code: finalResult.code,
        routeContext,
        source,
      });
    }

    authCurrentUserLastResultByContext.set(routeContext, finalResult);

    return finalResult;
  })().finally(() => {
    if (authCurrentUserInFlightByContext.get(routeContext) === run) {
      authCurrentUserInFlightByContext.delete(routeContext);
    }
  });

  authCurrentUserInFlightByContext.set(routeContext, run);
  return run;
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
  let response = await apiFetch<ClientConnectionStatus>("/api/clients/status", {
    cache: "no-store",
  });

  if (!response.success && !response.unauthorized) {
    response = await apiFetch<ClientConnectionStatus>("/api/client/status", {
      cache: "no-store",
    });
  }

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

export async function createNotification(body: {
  title: string;
  message: string;
  type?: string;
  link?: string;
}) {
  const response = await apiFetch("/api/notifications", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.success) {
    throw new Error(response.message || "Failed to create notification");
  }

  return response.data;
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
