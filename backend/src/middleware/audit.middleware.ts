import type { NextFunction, Request, Response } from "express";
import { createAuditLog } from "../services/audit.service";
import { getRequestBusinessId } from "../services/tenant.service";

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
    res.on("finish", () => {
      if (res.statusCode >= 400) {
        return;
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
      });
    });

    next();
  };
