const TIMELINE_STORAGE_KEY = "analytics-login-timeline";
const LOGIN_SUCCESS_HEADER = "X-Login-Success-At-Ms";
const CORRELATION_ID_HEADER = "X-Correlation-Id";

type TimelineState = {
  correlationId: string;
  loginSuccessAtMs: number;
};

const createCorrelationId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `login_analytics_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const readTimeline = (): TimelineState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(TIMELINE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<TimelineState>;
    if (
      typeof parsed.correlationId === "string" &&
      parsed.correlationId.trim() &&
      typeof parsed.loginSuccessAtMs === "number"
    ) {
      return {
        correlationId: parsed.correlationId.trim(),
        loginSuccessAtMs: parsed.loginSuccessAtMs,
      };
    }
  } catch {
    return null;
  }

  return null;
};

const writeTimeline = (state: TimelineState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(state));
};

export const startLoginAnalyticsTimeline = (metadata?: Record<string, unknown>) => {
  const state = {
    correlationId: createCorrelationId(),
    loginSuccessAtMs: Date.now(),
  };
  writeTimeline(state);
  logLoginAnalyticsTimeline("LOGIN_SUCCESS", metadata, state);
  return state;
};

export const getLoginAnalyticsTimeline = () => readTimeline();

export const getLoginAnalyticsHeaders = (): Record<string, string> => {
  const state = readTimeline();
  if (!state) {
    return {};
  }

  return {
    [CORRELATION_ID_HEADER]: state.correlationId,
    [LOGIN_SUCCESS_HEADER]: String(state.loginSuccessAtMs),
  };
};

export const logLoginAnalyticsTimeline = (
  event: string,
  metadata?: Record<string, unknown>,
  state = readTimeline()
) => {
  if (typeof window === "undefined" || !state) {
    return;
  }

  console.info("LOGIN_ANALYTICS_TIMELINE", {
    event,
    correlationId: state.correlationId,
    elapsedMs: Math.max(0, Date.now() - state.loginSuccessAtMs),
    loginSuccessAtMs: state.loginSuccessAtMs,
    ...(metadata || {}),
  });
};
