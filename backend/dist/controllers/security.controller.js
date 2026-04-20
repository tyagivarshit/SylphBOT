"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerBackupRun = exports.getBackupConfiguration = exports.restoreTenantWorkspace = exports.deleteTenantWorkspace = exports.exportTenantData = exports.revokeWorkspaceApiKey = exports.getLegacyWorkspaceApiKey = exports.rotateWorkspaceApiKey = exports.createWorkspaceApiKey = exports.getAuditLogEntries = exports.getApiKeys = exports.logoutAllSessions = exports.getSessions = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const authCookies_1 = require("../utils/authCookies");
const AppError_1 = require("../utils/AppError");
const audit_service_1 = require("../services/audit.service");
const apiKey_service_1 = require("../services/apiKey.service");
const compliance_service_1 = require("../services/compliance.service");
const backup_service_1 = require("../services/backup.service");
const tenant_service_1 = require("../services/tenant.service");
const getIpAddress = (req) => req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    "unknown";
const getUserAgent = (req) => {
    const value = req.headers["user-agent"];
    return Array.isArray(value) ? value.join(", ") : String(value || "");
};
const parseOptionalDate = (value, label) => {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw (0, AppError_1.badRequest)(`Invalid ${label} date`);
    }
    return parsed;
};
const parsePaginationValue = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(Math.trunc(parsed), 1);
};
const getSessions = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const sessions = await prisma_1.default.refreshToken.findMany({
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
exports.getSessions = getSessions;
const logoutAllSessions = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    await prisma_1.default.refreshToken.deleteMany({
        where: { userId },
    });
    await (0, audit_service_1.createAuditLog)({
        action: "security.sessions_revoked",
        userId,
        businessId: (0, tenant_service_1.getRequestBusinessId)(req),
        metadata: {
            scope: "all",
        },
        ip: getIpAddress(req),
        userAgent: getUserAgent(req),
        requestId: req.requestId || null,
    });
    (0, authCookies_1.clearAuthCookies)(res, req);
    res.json({ success: true });
};
exports.logoutAllSessions = logoutAllSessions;
const getApiKeys = async (req, res) => {
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    if (!businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const apiKeys = await (0, apiKey_service_1.listApiKeys)(businessId);
    res.json({
        success: true,
        apiKeys,
    });
};
exports.getApiKeys = getApiKeys;
const getAuditLogEntries = async (req, res) => {
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    if (!businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const from = parseOptionalDate(req.query.from ?? req.query.startDate ?? req.query.dateFrom, "from");
    const to = parseOptionalDate(req.query.to ?? req.query.endDate ?? req.query.dateTo, "to");
    if (from && to && from > to) {
        throw (0, AppError_1.badRequest)("from date must be before to date");
    }
    const result = await (0, audit_service_1.getAuditLogs)({
        businessId,
        userId: typeof req.query.userId === "string" && req.query.userId.trim()
            ? req.query.userId.trim()
            : undefined,
        action: typeof req.query.action === "string" && req.query.action.trim()
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
exports.getAuditLogEntries = getAuditLogEntries;
const createWorkspaceApiKey = async (req, res) => {
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const userId = req.user?.id || null;
    if (!businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const apiKey = await (0, apiKey_service_1.createApiKey)({
        businessId,
        createdByUserId: userId,
        name: typeof req.body?.name === "string" && req.body.name.trim()
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
    await (0, audit_service_1.createAuditLog)({
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
exports.createWorkspaceApiKey = createWorkspaceApiKey;
const rotateWorkspaceApiKey = async (req, res) => {
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const userId = req.user?.id || null;
    const apiKeyId = String(req.params.id || "").trim();
    if (!businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!apiKeyId) {
        return res.status(400).json({ error: "API key id is required" });
    }
    const apiKey = await (0, apiKey_service_1.rotateApiKey)({
        businessId,
        apiKeyId,
        rotatedByUserId: userId,
    });
    if (!apiKey) {
        return res.status(404).json({ error: "API key not found" });
    }
    await (0, audit_service_1.createAuditLog)({
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
exports.rotateWorkspaceApiKey = rotateWorkspaceApiKey;
const getLegacyWorkspaceApiKey = async (req, res) => {
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const userId = req.user?.id || null;
    if (!businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const apiKey = await (0, apiKey_service_1.ensureWorkspaceApiKey)({
        businessId,
        createdByUserId: userId,
    });
    res.json({
        apiKey: apiKey.rawKey,
    });
};
exports.getLegacyWorkspaceApiKey = getLegacyWorkspaceApiKey;
const revokeWorkspaceApiKey = async (req, res) => {
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const userId = req.user?.id || null;
    const apiKeyId = String(req.params.id || "").trim();
    if (!businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!apiKeyId) {
        return res.status(400).json({ error: "API key id is required" });
    }
    const result = await (0, apiKey_service_1.revokeApiKey)({
        businessId,
        apiKeyId,
    });
    if (!result.count) {
        return res.status(404).json({ error: "API key not found" });
    }
    await (0, audit_service_1.createAuditLog)({
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
exports.revokeWorkspaceApiKey = revokeWorkspaceApiKey;
const exportTenantData = async (req, res) => {
    const userId = req.user?.id;
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    if (!userId || !businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const payload = await (0, compliance_service_1.exportBusinessData)({
        userId,
        businessId,
    });
    await (0, audit_service_1.createAuditLog)({
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
    res.setHeader("Content-Disposition", `attachment; filename="workspace-export-${businessId}.json"`);
    res.json({
        success: true,
        data: payload,
    });
};
exports.exportTenantData = exportTenantData;
const deleteTenantWorkspace = async (req, res) => {
    const userId = req.user?.id;
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const mode = req.body?.mode === "permanent" ? "permanent" : "soft";
    if (!userId || !businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    await (0, compliance_service_1.deleteBusinessData)({
        userId,
        businessId,
        mode,
    });
    await (0, audit_service_1.createAuditLog)({
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
    (0, authCookies_1.clearAuthCookies)(res, req);
    res.json({
        success: true,
        mode,
    });
};
exports.deleteTenantWorkspace = deleteTenantWorkspace;
const restoreTenantWorkspace = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const requestBusinessId = (0, tenant_service_1.getRequestBusinessId)(req);
    const deletedBusiness = requestBusinessId
        ? await prisma_1.default.business.findFirst({
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
        : await prisma_1.default.business.findFirst({
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
    const restored = await (0, compliance_service_1.restoreBusinessData)({
        businessId: deletedBusiness.id,
    });
    if (!restored) {
        return res.status(404).json({ error: "Deleted workspace not found" });
    }
    await (0, audit_service_1.createAuditLog)({
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
exports.restoreTenantWorkspace = restoreTenantWorkspace;
const getBackupConfiguration = async (req, res) => {
    res.json({
        success: true,
        backup: (0, backup_service_1.getBackupStatus)(),
    });
};
exports.getBackupConfiguration = getBackupConfiguration;
const triggerBackupRun = async (req, res) => {
    const userId = req.user?.id;
    const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
    if (!userId || !businessId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const backup = await (0, backup_service_1.triggerBackup)({
        requestedByUserId: userId,
        businessId,
    });
    await (0, audit_service_1.createAuditLog)({
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
exports.triggerBackupRun = triggerBackupRun;
