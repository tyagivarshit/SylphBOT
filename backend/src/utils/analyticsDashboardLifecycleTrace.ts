type RequestLike = {
  method?: string;
  originalUrl?: string;
  path?: string;
  url?: string;
  requestId?: string | null;
  headers?: Record<string, string | string[] | undefined>;
};

const ANALYTICS_DASHBOARD_PATH = "/api/analytics/dashboard";

const readPath = (req: RequestLike) =>
  String(req.originalUrl || req.path || req.url || "").split("?")[0];

export const isAnalyticsDashboardRequest = (req: RequestLike) =>
  String(req.method || "").toUpperCase() === "GET" &&
  readPath(req) === ANALYTICS_DASHBOARD_PATH;

export const markAnalyticsDashboardLifecycleStart = (
  res: { locals?: Record<string, unknown> },
  startedAt = Date.now(),
  correlationId?: string | null
) => {
  if (!res.locals) {
    res.locals = {};
  }
  res.locals.analyticsDashboardLifecycleStartedAt = startedAt;
  if (correlationId) {
    res.locals.analyticsDashboardCorrelationId = correlationId;
  }
};

export const getAnalyticsDashboardLifecycleElapsedMs = (input?: {
  res?: { locals?: Record<string, unknown> } | null;
  startedAt?: number | null;
}) => {
  const startedAt =
    input?.startedAt ??
    (input?.res?.locals?.analyticsDashboardLifecycleStartedAt as number | undefined);
  return typeof startedAt === "number" ? Date.now() - startedAt : null;
};

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const getAnalyticsDashboardCorrelationId = (input: {
  req?: RequestLike | null;
  res?: { locals?: Record<string, unknown> } | null;
}) => {
  const localCorrelationId = input.res?.locals?.analyticsDashboardCorrelationId;
  if (typeof localCorrelationId === "string" && localCorrelationId.trim()) {
    return localCorrelationId.trim();
  }

  const headerCorrelationId = getHeaderValue(input.req?.headers?.["x-correlation-id"]);
  if (typeof headerCorrelationId === "string" && headerCorrelationId.trim()) {
    return headerCorrelationId.trim();
  }

  return String(input.req?.requestId || "").trim() || null;
};

export const logAnalyticsDashboardLifecycle = (
  event: string,
  metadata: Record<string, unknown> = {}
) => {
  console.info("ANALYTICS_DASHBOARD_LIFECYCLE", {
    event,
    correlationId: metadata.correlationId ?? null,
    elapsedMs: metadata.elapsedMs ?? null,
    atMs: Date.now(),
    ...metadata,
  });
};
