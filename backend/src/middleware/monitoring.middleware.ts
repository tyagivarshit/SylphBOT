import type { NextFunction, Request, Response } from "express";
import { monitorEventLoopDelay } from "perf_hooks";
import { captureExceptionWithContext } from "../observability/sentry";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "../services/reliability/reliabilityOS.service";
import { getRequestBusinessId } from "../services/tenant.service";
import { monitoringConfig } from "../config/monitoring.config";

const HIGH_VALUE_OBSERVABILITY_PATH_PREFIXES = [
  "/api/billing",
  "/api/webhook",
  "/api/webhooks",
  "/api/inbox/intake",
  "/api/commerce",
];

const eventLoopLagMonitor = monitorEventLoopDelay({
  resolution: 20,
});
eventLoopLagMonitor.enable();

let inflightRequestCount = 0;
let peakInflightRequestCount = 0;

const readEventLoopLagMs = () => {
  const mean = Number(eventLoopLagMonitor.mean || 0);
  if (!Number.isFinite(mean) || mean <= 0) {
    return 0;
  }
  return Number((mean / 1_000_000).toFixed(2));
};

export const monitoringMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startedAt = Date.now();
  inflightRequestCount += 1;
  peakInflightRequestCount = Math.max(peakInflightRequestCount, inflightRequestCount);
  let releasedInflight = false;
  const releaseInflight = () => {
    if (releasedInflight) {
      return;
    }
    releasedInflight = true;
    inflightRequestCount = Math.max(0, inflightRequestCount - 1);
  };

  res.on("close", releaseInflight);

  res.on("finish", () => {
    releaseInflight();
    const businessId = getRequestBusinessId(req);
    const traceId = req.requestId || null;
    const statusCode = res.statusCode;
    const durationMs = Date.now() - startedAt;
    const priorityClass =
      String((res.locals as Record<string, unknown>)?.requestPriorityClass || "NORMAL")
        .trim()
        .toUpperCase() || "NORMAL";
    const queueWaitMs = Number(
      (res.locals as Record<string, unknown>)?.requestQueueWaitMs || 0
    );
    const eventLoopLagMs = readEventLoopLagMs();
    const shouldPersistDetailedObservability =
      statusCode >= 400 ||
      durationMs >= monitoringConfig.slowRequestMs ||
      HIGH_VALUE_OBSERVABILITY_PATH_PREFIXES.some((prefix) =>
        String(req.originalUrl || "").startsWith(prefix)
      );

    req.logger?.info(
      {
        statusCode,
        durationMs,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id || null,
        businessId,
        priorityClass,
        queueWaitMs: Number.isFinite(queueWaitMs) ? queueWaitMs : 0,
        inflightRequestCount,
        peakInflightRequestCount,
        eventLoopLagMs,
      },
      "Request completed"
    );

    if (shouldPersistDetailedObservability) {
      void recordTraceLedger({
        traceId,
        correlationId: traceId,
        businessId,
        tenantId: businessId,
        leadId:
          typeof req.query?.leadId === "string"
            ? req.query.leadId
            : null,
        stage: `http:${req.method}:${req.originalUrl}`,
        status: statusCode >= 500 ? "FAILED" : "COMPLETED",
        endedAt: new Date(),
        metadata: {
          statusCode,
          durationMs,
        },
      }).catch(() => undefined);

      void recordObservabilityEvent({
        businessId,
        tenantId: businessId,
        eventType: "http.request.completed",
        message: `${req.method} ${req.originalUrl} -> ${statusCode}`,
        severity:
          statusCode >= 500
            ? "error"
            : statusCode >= 400
            ? "warn"
            : "info",
        context: {
          traceId,
          correlationId: traceId,
          tenantId: businessId,
          component: "http",
          phase: "reception",
        },
        metadata: {
          statusCode,
          durationMs,
          method: req.method,
          route: req.originalUrl,
          priorityClass,
          queueWaitMs: Number.isFinite(queueWaitMs) ? queueWaitMs : 0,
          inflightRequestCount,
          eventLoopLagMs,
        },
      }).catch(() => undefined);
    }

    emitPerformanceMetric({
      name: "API_MS",
      value: durationMs,
      businessId,
      route: req.originalUrl,
      metadata: {
        method: req.method,
        statusCode,
        priorityClass,
        queueWaitMs: Number.isFinite(queueWaitMs) ? queueWaitMs : 0,
        inflightRequestCount,
        eventLoopLagMs,
      },
    });

    if (durationMs >= monitoringConfig.slowRequestMs) {
      req.logger?.warn(
        {
          route: req.originalUrl,
          durationMs,
          requestId: req.requestId || null,
          thresholdMs: monitoringConfig.slowRequestMs,
        },
        "Slow API request"
      );

      emitPerformanceMetric({
        name: "DB_SLOW",
        value: durationMs,
        businessId,
        route: req.originalUrl,
        metadata: {
          method: req.method,
          statusCode,
          thresholdMs: monitoringConfig.slowRequestMs,
          priorityClass,
          queueWaitMs: Number.isFinite(queueWaitMs) ? queueWaitMs : 0,
          inflightRequestCount,
          eventLoopLagMs,
        },
      });
    }

    if (statusCode >= 500) {
      captureExceptionWithContext(
        new Error(`Request failed with status ${statusCode}`),
        {
          tags: {
            layer: "monitoring",
            statusCode,
          },
          extras: {
            path: req.originalUrl,
            method: req.method,
            businessId,
            requestId: req.requestId,
          },
        }
      );
    }
  });

  next();
};
