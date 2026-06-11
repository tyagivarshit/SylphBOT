import type { NextFunction, Request, Response } from "express";
import { createAuditLog } from "../services/audit.service";
import { getRequestBusinessId } from "../services/tenant.service";
import {
  getAnalyticsDashboardLifecycleElapsedMs,
  isAnalyticsDashboardRequest,
  logAnalyticsDashboardLifecycle,
} from "../utils/analyticsDashboardLifecycleTrace";

const getIpAddress = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

const getUserAgent = (req: Request) => {
  const value = req.headers["user-agent"];
  return Array.isArray(value) ? value.join(", ") : value || null;
};

export const auditRequest = (
  action: string,
  buildMetadata?: (req: Request, res: Response) => Record<string, unknown>
) =>
  (req: Request, res: Response, next: NextFunction) => {
    const isAnalyticsDashboard = isAnalyticsDashboardRequest(req);
    res.on("finish", () => {
      if (isAnalyticsDashboard) {
        logAnalyticsDashboardLifecycle("audit res.finish handler start", {
          requestId: req.requestId || null,
          elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
          statusCode: res.statusCode,
        });
      }
      if (res.statusCode >= 400) {
        if (isAnalyticsDashboard) {
          logAnalyticsDashboardLifecycle("audit res.finish handler end", {
            requestId: req.requestId || null,
            skipped: true,
            elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
            statusCode: res.statusCode,
          });
        }
        return;
      }

      setImmediate(() => {
        if (isAnalyticsDashboard) {
          logAnalyticsDashboardLifecycle("audit deferred createAuditLog start", {
            requestId: req.requestId || null,
            elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
          });
        }
        void createAuditLog({
          action,
          userId: req.user?.id || null,
          businessId: getRequestBusinessId(req),
          metadata: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            ...(buildMetadata ? buildMetadata(req, res) : {}),
          },
          ip: getIpAddress(req),
          userAgent: getUserAgent(req),
          requestId: req.requestId || null,
        }).finally(() => {
          if (isAnalyticsDashboard) {
            logAnalyticsDashboardLifecycle("audit deferred createAuditLog end", {
              requestId: req.requestId || null,
              elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
            });
          }
        });
      });
      if (isAnalyticsDashboard) {
        logAnalyticsDashboardLifecycle("audit res.finish handler end", {
          requestId: req.requestId || null,
          elapsedMs: getAnalyticsDashboardLifecycleElapsedMs({ res }),
          statusCode: res.statusCode,
        });
      }
    });

    next();
  };
