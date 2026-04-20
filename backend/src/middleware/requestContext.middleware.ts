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

export const requestContextMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = getRequestId(req);
  const route = req.originalUrl || req.url;

  runWithRequestContext(
    {
      requestId,
      route,
      method: req.method,
      source: route.startsWith("/api/webhook") || route.startsWith("/webhook")
        ? "webhook"
        : "http",
    },
    () => {
      req.requestId = requestId;
      req.logger = logger.child({
        requestId,
        route,
      });

      res.setHeader("X-Request-Id", requestId);
      next();
    }
  );
};
