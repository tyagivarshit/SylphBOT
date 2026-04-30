import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";
import { runWithRequestContext } from "../observability/requestContext";

const getRequestId = (req: Request) => {
  const headerValue = req.headers["x-request-id"];
  const requestId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  return typeof requestId === "string" && requestId.trim()
    ? requestId.trim()
    : randomUUID();
};

const getCorrelationId = (req: Request, requestId: string) => {
  const headerValue = req.headers["x-correlation-id"];
  const correlationId = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  return typeof correlationId === "string" && correlationId.trim()
    ? correlationId.trim()
    : requestId;
};

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = getRequestId(req);
  const correlationId = getCorrelationId(req, requestId);
  const route = req.originalUrl || req.url;

  runWithRequestContext(
    {
      requestId,
      traceId: requestId,
      correlationId,
      tenantId: null,
      route,
      method: req.method,
      source: route.startsWith("/api/webhook") || route.startsWith("/webhook")
        ? "webhook"
        : "http",
      component: "http",
      phase: "reception",
    },
    () => {
      req.requestId = requestId;
      req.logger = logger.child({
        requestId,
        correlationId,
        route,
      });

      res.setHeader("X-Request-Id", requestId);
      res.setHeader("X-Correlation-Id", correlationId);
      next();
    }
  );
};
