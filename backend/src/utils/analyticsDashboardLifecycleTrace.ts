type RequestLike = {
  method?: string;
  originalUrl?: string;
  path?: string;
  url?: string;
  requestId?: string | null;
};

const ANALYTICS_DASHBOARD_PATH = "/api/analytics/dashboard";

const readPath = (req: RequestLike) =>
  String(req.originalUrl || req.path || req.url || "").split("?")[0];

export const isAnalyticsDashboardRequest = (req: RequestLike) =>
  String(req.method || "").toUpperCase() === "GET" &&
  readPath(req) === ANALYTICS_DASHBOARD_PATH;

export const markAnalyticsDashboardLifecycleStart = (
  res: { locals?: Record<string, unknown> },
  startedAt = Date.now()
) => {
  if (!res.locals) {
    res.locals = {};
  }
  res.locals.analyticsDashboardLifecycleStartedAt = startedAt;
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

export const logAnalyticsDashboardLifecycle = (
  event: string,
  metadata: Record<string, unknown> = {}
) => {
  console.info("ANALYTICS_DASHBOARD_LIFECYCLE", {
    event,
    atMs: Date.now(),
    ...metadata,
  });
};
