import type { NextFunction, Request, Response } from "express";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import {
  getRequestRemainingMs,
  isRequestLifecycleAborted,
} from "../utils/requestLifecycle";

type PriorityClass = "CRITICAL" | "NORMAL" | "LOW";

type QueueEntry = {
  id: number;
  priority: PriorityClass;
  requestId: string | null;
  route: string;
  method: string;
  enqueuedAt: number;
  onGrant: () => void;
  onReject: (reason: string) => void;
};

const PRIORITY_LIMITS: Record<PriorityClass, number> = {
  CRITICAL: 7,
  NORMAL: 3,
  LOW: 1,
};

const GLOBAL_INFLIGHT_LIMIT = 8;
const QUEUE_WAIT_BUFFER_MS = 250;
const MIN_QUEUE_WAIT_MS = 150;

const activeByPriority: Record<PriorityClass, number> = {
  CRITICAL: 0,
  NORMAL: 0,
  LOW: 0,
};

const queueByPriority: Record<PriorityClass, QueueEntry[]> = {
  CRITICAL: [],
  NORMAL: [],
  LOW: [],
};

let queueIdCounter = 0;

const sumActive = () =>
  activeByPriority.CRITICAL + activeByPriority.NORMAL + activeByPriority.LOW;

const sumQueued = () =>
  queueByPriority.CRITICAL.length +
  queueByPriority.NORMAL.length +
  queueByPriority.LOW.length;

const classifyRequestPriority = (req: Request): PriorityClass => {
  const path = String(req.path || req.originalUrl || "").trim();

  if (
    path.startsWith("/api/auth") ||
    path.startsWith("/api/user/me") ||
    path.startsWith("/api/user/workspace") ||
    path.startsWith("/api/webhooks/commerce") ||
    path.startsWith("/api/webhook/") ||
    path.startsWith("/webhook/") ||
    path.startsWith("/api/billing") ||
    path.startsWith("/api/billing/checkout") ||
    path.startsWith("/api/billing/create-checkout-session") ||
    path.startsWith("/api/billing/upgrade") ||
    path.startsWith("/api/commerce") ||
    path.startsWith("/api/security")
  ) {
    return "CRITICAL";
  }

  if (
    path.startsWith("/api/notifications") ||
    path.startsWith("/api/search") ||
    path.startsWith("/api/automation") ||
    path.startsWith("/api/knowledge") ||
    path.startsWith("/api/comment-triggers") ||
    path.startsWith("/api/comment-automation/triggers") ||
    path.startsWith("/api/triggers") ||
    path.startsWith("/api/booking") ||
    path.startsWith("/api/availability") ||
    path.startsWith("/api/analytics") ||
    path.startsWith("/api/dashboard") ||
    path.startsWith("/api/autonomous") ||
    path.startsWith("/api/conversations") ||
    path.startsWith("/api/integrations/onboarding")
  ) {
    return "LOW";
  }

  return "NORMAL";
};

const canAcquireSlot = (priority: PriorityClass) => {
  if (sumActive() >= GLOBAL_INFLIGHT_LIMIT) {
    return false;
  }

  if (activeByPriority[priority] >= PRIORITY_LIMITS[priority]) {
    return false;
  }

  if (priority !== "CRITICAL" && queueByPriority.CRITICAL.length > 0) {
    return false;
  }

  if (priority === "LOW" && queueByPriority.NORMAL.length > 0) {
    return false;
  }

  return true;
};

const acquireSlot = (priority: PriorityClass) => {
  if (!canAcquireSlot(priority)) {
    return null;
  }

  activeByPriority[priority] += 1;
  let released = false;

  return () => {
    if (released) {
      return;
    }
    released = true;
    activeByPriority[priority] = Math.max(0, activeByPriority[priority] - 1);
    drainQueue();
  };
};

const removeQueueEntry = (entryId: number) => {
  (Object.keys(queueByPriority) as PriorityClass[]).forEach((priority) => {
    const queue = queueByPriority[priority];
    const index = queue.findIndex((entry) => entry.id === entryId);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  });
};

const drainQueue = () => {
  const orderedPriorities: PriorityClass[] = ["CRITICAL", "NORMAL", "LOW"];

  let progressed = true;
  while (progressed) {
    progressed = false;

    for (const priority of orderedPriorities) {
      const queue = queueByPriority[priority];
      const next = queue[0];
      if (!next) {
        continue;
      }

      if (!canAcquireSlot(priority)) {
        continue;
      }

      queue.shift();
      progressed = true;
      next.onGrant();
      break;
    }
  }
};

const logQueueSnapshot = (reason: string, requestId: string | null, route: string) => {
  console.info("REQUEST_PRIORITY_STATE", {
    reason,
    requestId,
    route,
    active: {
      critical: activeByPriority.CRITICAL,
      normal: activeByPriority.NORMAL,
      low: activeByPriority.LOW,
      total: sumActive(),
    },
    queue: {
      critical: queueByPriority.CRITICAL.length,
      normal: queueByPriority.NORMAL.length,
      low: queueByPriority.LOW.length,
      total: sumQueued(),
    },
  });
};

export const requestPriorityMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const path = String(req.path || req.originalUrl || "").trim();
  if (!path.startsWith("/api")) {
    return next();
  }

  const priority = classifyRequestPriority(req);
  const route = String(req.originalUrl || req.path || "").trim();
  const requestId = String(req.requestId || "").trim() || null;
  const queueWaitStartedAt = Date.now();

  const attachRelease = (release: () => void) => {
    let released = false;
    const finalize = () => {
      if (released) {
        return;
      }
      released = true;
      release();
      logQueueSnapshot("released", requestId, route);
    };

    res.on("finish", finalize);
    res.on("close", finalize);
  };

  const directRelease = acquireSlot(priority);
  if (directRelease) {
    (res.locals as Record<string, unknown>).requestPriorityClass = priority;
    (res.locals as Record<string, unknown>).requestQueueWaitMs = 0;
    attachRelease(directRelease);
    emitPerformanceMetric({
      name: "CACHE_HIT",
      route: "request_priority",
      metadata: {
        priority,
        source: "direct",
      },
    });
    return next();
  }

  const queueRemainingBudgetMs = Math.max(
    MIN_QUEUE_WAIT_MS,
    getRequestRemainingMs({ req, res }, 800) - QUEUE_WAIT_BUFFER_MS
  );
  let queueSettled = false;
  let queueTimeoutHandle: NodeJS.Timeout | null = null;

  const entry: QueueEntry = {
    id: ++queueIdCounter,
    priority,
    requestId,
    route,
    method: req.method,
    enqueuedAt: Date.now(),
    onGrant: () => {
      if (queueSettled) {
        return;
      }
      queueSettled = true;
      if (queueTimeoutHandle) {
        clearTimeout(queueTimeoutHandle);
      }

      if (isRequestLifecycleAborted({ req, res })) {
        return;
      }

      const release = acquireSlot(priority);
      if (!release) {
        entry.onReject("queue_grant_failed");
        return;
      }

      const waitedMs = Date.now() - queueWaitStartedAt;
      (res.locals as Record<string, unknown>).requestPriorityClass = priority;
      (res.locals as Record<string, unknown>).requestQueueWaitMs = waitedMs;
      emitPerformanceMetric({
        name: "API_MS",
        value: waitedMs,
        route: "request_priority_wait",
        metadata: {
          priority,
          requestId,
        },
      });
      attachRelease(release);
      logQueueSnapshot("granted", requestId, route);
      next();
    },
    onReject: (reason: string) => {
      if (queueSettled) {
        return;
      }
      queueSettled = true;
      if (queueTimeoutHandle) {
        clearTimeout(queueTimeoutHandle);
      }
      removeQueueEntry(entry.id);
      if (res.headersSent || res.writableEnded) {
        return;
      }
      emitPerformanceMetric({
        name: "TIMEOUT_PREVENTED",
        route: "request_priority_queue",
        metadata: {
          priority,
          reason,
          requestId,
        },
      });
      res.status(503).json({
        success: false,
        code: "REQUEST_QUEUE_TIMEOUT",
        message: "Request queue is saturated. Please retry.",
        requestId: req.requestId,
      });
    },
  };

  queueByPriority[priority].push(entry);
  logQueueSnapshot("queued", requestId, route);

  queueTimeoutHandle = setTimeout(() => {
    entry.onReject("queue_wait_timeout");
  }, queueRemainingBudgetMs);

  req.on("aborted", () => {
    clearTimeout(queueTimeoutHandle);
    removeQueueEntry(entry.id);
  });

  res.on("close", () => {
    clearTimeout(queueTimeoutHandle);
    removeQueueEntry(entry.id);
  });

  res.on("finish", () => {
    clearTimeout(queueTimeoutHandle);
    removeQueueEntry(entry.id);
  });

  drainQueue();
};
