import type { Request, Response } from "express";
import { AsyncLocalStorage } from "node:async_hooks";

export const requestStorage = new AsyncLocalStorage<{ req: Request; res?: Response | null }>();

export type RequestLifecycleAbortReason =
  | "request_timeout"
  | "client_aborted"
  | "response_closed"
  | "response_finished";

export type RequestLifecycleState = {
  requestId: string | null;
  route: string;
  method: string;
  startedAt: number;
  timeoutMs: number;
  deadlineAt: number;
  aborted: boolean;
  abortReason: RequestLifecycleAbortReason | null;
  abortedAt: number | null;
  abortController: AbortController;
};

const REQUEST_LIFECYCLE_LOCAL_KEY = "__requestLifecycleState";

const toLocals = (res?: Response | null) => {
  if (!res) {
    return {} as Record<string, unknown>;
  }
  if (!res.locals) {
    res.locals = {};
  }
  return res.locals as Record<string, unknown>;
};


const readFromReq = (req: Request) => {
  const candidate = (req as Request & { requestLifecycle?: unknown }).requestLifecycle;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as RequestLifecycleState;
};

const readFromRes = (res?: Response | null) => {
  if (!res) {
    return null;
  }
  const candidate = toLocals(res)[REQUEST_LIFECYCLE_LOCAL_KEY];
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as RequestLifecycleState;
};

export const initRequestLifecycle = (input: {
  req: Request;
  res: Response;
  startedAt: number;
  timeoutMs: number;
}) => {
  const route = String(input.req.originalUrl || input.req.path || input.req.url || "").trim();
  const lifecycle: RequestLifecycleState = {
    requestId: String((input.req as any).requestId || "").trim() || null,
    route,
    method: input.req.method,
    startedAt: input.startedAt,
    timeoutMs: Math.max(1, Math.floor(input.timeoutMs)),
    deadlineAt: input.startedAt + Math.max(1, Math.floor(input.timeoutMs)),
    aborted: false,
    abortReason: null,
    abortedAt: null,
    abortController: new AbortController(),
  };

  (input.req as Request & { requestLifecycle?: RequestLifecycleState }).requestLifecycle =
    lifecycle;
  toLocals(input.res)[REQUEST_LIFECYCLE_LOCAL_KEY] = lifecycle;
  toLocals(input.res).requestAbortSignal = lifecycle.abortController.signal;
  toLocals(input.res).requestAborted = false;
  toLocals(input.res).requestAbortReason = null;

  return lifecycle;
};

export const getRequestLifecycle = (input: {
  req: Request;
  res?: Response | null;
}) => readFromReq(input.req) || readFromRes(input.res || null);

export const isRequestLifecycleAborted = (input: {
  req: Request;
  res?: Response | null;
}) => {
  const lifecycle = getRequestLifecycle(input);
  if (lifecycle?.aborted) {
    return true;
  }
  return Boolean(input.req.aborted);
};

export const markRequestLifecycleAborted = (input: {
  req: Request;
  res?: Response | null;
  reason: RequestLifecycleAbortReason;
}) => {
  const lifecycle = getRequestLifecycle({
    req: input.req,
    res: input.res || null,
  });

  if (!lifecycle || lifecycle.aborted) {
    return false;
  }

  lifecycle.aborted = true;
  lifecycle.abortReason = input.reason;
  lifecycle.abortedAt = Date.now();

  if (input.res) {
    toLocals(input.res).requestAborted = true;
    toLocals(input.res).requestAbortReason = input.reason;
    if (input.reason === "request_timeout") {
      toLocals(input.res).requestTimedOut = true;
    }
  }

  lifecycle.abortController.abort(
    new Error(`request_aborted:${input.reason}:${lifecycle.method}:${lifecycle.route}`)
  );

  return true;
};

export const getRequestAbortSignal = (input: {
  req: Request;
  res?: Response | null;
}) => getRequestLifecycle(input)?.abortController.signal || null;

export const getRequestRemainingMs = (
  input?: {
    req?: Request | null;
    res?: Response | null;
  } | null,
  fallbackMs = 500
) => {
  const store = requestStorage.getStore();
  const req = input?.req || store?.req;
  const res = input?.res || store?.res;
  if (!req) {
    return Math.max(1, Math.floor(fallbackMs));
  }
  const lifecycle = getRequestLifecycle({ req, res });
  if (!lifecycle) {
    return Math.max(1, Math.floor(fallbackMs));
  }
  return Math.max(1, lifecycle.deadlineAt - Date.now());
};

export const throwIfRequestLifecycleAborted = (input: {
  req: Request;
  res?: Response | null;
  stage: string;
}) => {
  if (!isRequestLifecycleAborted(input)) {
    return;
  }

  const lifecycle = getRequestLifecycle(input);
  const reason = lifecycle?.abortReason || "unknown";
  throw new Error(`request_aborted:${input.stage}:${reason}`);
};

