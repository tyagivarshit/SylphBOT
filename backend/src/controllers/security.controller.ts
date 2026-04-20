import type { Request, Response } from "express";
import prisma from "../config/prisma";
import { clearAuthCookies } from "../utils/authCookies";
import { badRequest } from "../utils/AppError";
import {
  createAuditLog,
  getAuditLogs as searchAuditLogs,
} from "../services/audit.service";
import {
  createApiKey,
  ensureWorkspaceApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from "../services/apiKey.service";
import {
  deleteBusinessData,
  exportBusinessData,
  restoreBusinessData,
} from "../services/compliance.service";
import {
  getBackupStatus,
  triggerBackup,
} from "../services/backup.service";
import { getRequestBusinessId } from "../services/tenant.service";

const getIpAddress = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  req.ip ||
  "unknown";

const getUserAgent = (req: Request) => {
  const value = req.headers["user-agent"];
  return Array.isArray(value) ? value.join(", ") : String(value || "");
};

const parseOptionalDate = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw badRequest(`Invalid ${label} date`);
  }

  return parsed;
};

const parsePaginationValue = (value: unknown, fallback: number) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(Math.trunc(parsed), 1);
};

export const getSessions = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sessions = await prisma.refreshToken.findMany({
    where: { userId },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  res.json(sessions);
};

export const logoutAllSessions = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  await createAuditLog({
    action: "security.sessions_revoked",
    userId,
    businessId: getRequestBusinessId(req),
    metadata: {
      scope: "all",
    },
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  clearAuthCookies(res, req);

  res.json({ success: true });
};

export const getApiKeys = async (req: Request, res: Response) => {
  const businessId = getRequestBusinessId(req);

  if (!businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKeys = await listApiKeys(businessId);

  res.json({
    success: true,
    apiKeys,
  });
};

export const getAuditLogEntries = async (req: Request, res: Response) => {
  const businessId = getRequestBusinessId(req);

  if (!businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const from = parseOptionalDate(
    req.query.from ?? req.query.startDate ?? req.query.dateFrom,
    "from"
  );
  const to = parseOptionalDate(
    req.query.to ?? req.query.endDate ?? req.query.dateTo,
    "to"
  );

  if (from && to && from > to) {
    throw badRequest("from date must be before to date");
  }

  const result = await searchAuditLogs({
    businessId,
    userId:
      typeof req.query.userId === "string" && req.query.userId.trim()
        ? req.query.userId.trim()
        : undefined,
    action:
      typeof req.query.action === "string" && req.query.action.trim()
        ? req.query.action.trim()
        : undefined,
    from,
    to,
    page: parsePaginationValue(req.query.page, 1),
    limit: parsePaginationValue(req.query.limit, 25),
  });

  res.json({
    success: true,
    logs: result.logs,
    pagination: result.pagination,
  });
};

export const createWorkspaceApiKey = async (req: Request, res: Response) => {
  const businessId = getRequestBusinessId(req);
  const userId = req.user?.id || null;

  if (!businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = await createApiKey({
    businessId,
    createdByUserId: userId,
    name:
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : undefined,
    permissions: Array.isArray(req.body?.permissions)
      ? req.body.permissions
      : undefined,
    scopes: Array.isArray(req.body?.scopes)
      ? req.body.scopes
      : typeof req.body?.scope === "string"
        ? [req.body.scope]
        : undefined,
  });

  await createAuditLog({
    action: "security.api_key_created",
    userId,
    businessId,
    metadata: {
      apiKeyId: apiKey.id,
      name: apiKey.name,
      permissions: apiKey.permissions,
      scopes: apiKey.scopes,
    },
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  res.status(201).json({
    success: true,
    apiKey,
  });
};

export const rotateWorkspaceApiKey = async (req: Request, res: Response) => {
  const businessId = getRequestBusinessId(req);
  const userId = req.user?.id || null;
  const apiKeyId = String(req.params.id || "").trim();

  if (!businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!apiKeyId) {
    return res.status(400).json({ error: "API key id is required" });
  }

  const apiKey = await rotateApiKey({
    businessId,
    apiKeyId,
    rotatedByUserId: userId,
  });

  if (!apiKey) {
    return res.status(404).json({ error: "API key not found" });
  }

  await createAuditLog({
    action: "security.api_key_rotated",
    userId,
    businessId,
    metadata: {
      revokedApiKeyId: apiKey.revokedApiKeyId,
      apiKeyId: apiKey.id,
      name: apiKey.name,
      permissions: apiKey.permissions,
      scopes: apiKey.scopes,
    },
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  res.json({
    success: true,
    apiKey,
  });
};

export const getLegacyWorkspaceApiKey = async (
  req: Request,
  res: Response
) => {
  const businessId = getRequestBusinessId(req);
  const userId = req.user?.id || null;

  if (!businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const apiKey = await ensureWorkspaceApiKey({
    businessId,
    createdByUserId: userId,
  });

  res.json({
    apiKey: apiKey.rawKey,
  });
};

export const revokeWorkspaceApiKey = async (req: Request, res: Response) => {
  const businessId = getRequestBusinessId(req);
  const userId = req.user?.id || null;
  const apiKeyId = String(req.params.id || "").trim();

  if (!businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!apiKeyId) {
    return res.status(400).json({ error: "API key id is required" });
  }

  const result = await revokeApiKey({
    businessId,
    apiKeyId,
  });

  if (!result.count) {
    return res.status(404).json({ error: "API key not found" });
  }

  await createAuditLog({
    action: "security.api_key_revoked",
    userId,
    businessId,
    metadata: {
      apiKeyId,
    },
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  res.json({
    success: true,
  });
};

export const exportTenantData = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const businessId = getRequestBusinessId(req);

  if (!userId || !businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = await exportBusinessData({
    userId,
    businessId,
  });

  await createAuditLog({
    action: "security.data_export",
    userId,
    businessId,
    metadata: {
      exportedAt: payload.exportedAt,
    },
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="workspace-export-${businessId}.json"`
  );
  res.json({
    success: true,
    data: payload,
  });
};

export const deleteTenantWorkspace = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const businessId = getRequestBusinessId(req);
  const mode =
    req.body?.mode === "permanent" ? "permanent" : "soft";

  if (!userId || !businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await deleteBusinessData({
    userId,
    businessId,
    mode,
  });

  await createAuditLog({
    action: "security.data_delete",
    userId,
    businessId,
    metadata: {
      mode,
    },
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  clearAuthCookies(res, req);

  res.json({
    success: true,
    mode,
  });
};

export const restoreTenantWorkspace = async (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const requestBusinessId = getRequestBusinessId(req);
  const deletedBusiness =
    requestBusinessId
      ? await prisma.business.findFirst({
          where: {
            id: requestBusinessId,
            deletedAt: {
              not: null,
            },
          },
          select: {
            id: true,
          },
        })
      : await prisma.business.findFirst({
          where: {
            deletedAt: {
              not: null,
            },
            OR: [
              {
                ownerId: userId,
              },
              {
                users: {
                  some: {
                    id: userId,
                  },
                },
              },
            ],
          },
          orderBy: {
            deletedAt: "desc",
          },
          select: {
            id: true,
          },
        });

  if (!deletedBusiness) {
    return res.status(404).json({ error: "Deleted workspace not found" });
  }

  const restored = await restoreBusinessData({
    businessId: deletedBusiness.id,
  });

  if (!restored) {
    return res.status(404).json({ error: "Deleted workspace not found" });
  }

  await createAuditLog({
    action: "security.data_restored",
    userId,
    businessId: restored.businessId,
    metadata: restored,
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  res.json({
    success: true,
    restore: restored,
  });
};

export const getBackupConfiguration = async (req: Request, res: Response) => {
  res.json({
    success: true,
    backup: getBackupStatus(),
  });
};

export const triggerBackupRun = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const businessId = getRequestBusinessId(req);

  if (!userId || !businessId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const backup = await triggerBackup({
    requestedByUserId: userId,
    businessId,
  });

  await createAuditLog({
    action: "security.backup_requested",
    userId,
    businessId,
    metadata: backup,
    ip: getIpAddress(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId || null,
  });

  res.json({
    success: true,
    backup,
  });
};
