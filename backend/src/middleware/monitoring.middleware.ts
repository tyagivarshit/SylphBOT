import type { NextFunction, Request, Response } from "express";
import { captureExceptionWithContext } from "../observability/sentry";
import { getRequestBusinessId } from "../services/tenant.service";

export const monitoringMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    req.logger?.info(
      {
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id || null,
        businessId: getRequestBusinessId(req),
      },
      "Request completed"
    );

    if (res.statusCode >= 500) {
      captureExceptionWithContext(
        new Error(`Request failed with status ${res.statusCode}`),
        {
          tags: {
            layer: "monitoring",
            statusCode: res.statusCode,
          },
          extras: {
            path: req.originalUrl,
            method: req.method,
            businessId: getRequestBusinessId(req),
            requestId: req.requestId,
          },
        }
      );
    }
  });

  next();
};
