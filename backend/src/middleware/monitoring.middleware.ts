import type { NextFunction, Request, Response } from "express";
import { captureExceptionWithContext } from "../observability/sentry";
import {
  recordObservabilityEvent,
  recordTraceLedger,
} from "../services/reliability/reliabilityOS.service";
import { getRequestBusinessId } from "../services/tenant.service";

export const monitoringMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const businessId = getRequestBusinessId(req);
    const traceId = req.requestId || null;
    const statusCode = res.statusCode;
    const durationMs = Date.now() - startedAt;

    req.logger?.info(
      {
        statusCode,
        durationMs,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id || null,
        businessId,
      },
      "Request completed"
    );

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
      },
    }).catch(() => undefined);

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
