"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runConnectHubSelfAudit = exports.meterConnectHubFeatureGate = exports.upgradeConnectHubPlan = exports.saveConnectHubWizardProgress = exports.getIntegrationDiagnostics = exports.retryConnectDiagnostic = exports.connectWhatsAppHub = exports.connectInstagramHub = exports.provisionConnectHubTenant = exports.getConnectHubDashboard = exports.getInstagramAccounts = exports.getOnboarding = exports.getIntegrations = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encrypt_1 = require("../utils/encrypt");
const onboarding_service_1 = require("../services/onboarding.service");
const instagramProfile_service_1 = require("../services/instagramProfile.service");
const saasPackagingConnectHubOS_service_1 = require("../services/saasPackagingConnectHubOS.service");
const normalizeOptionalString = (value) => {
    const normalized = String(value || "").trim();
    return normalized || null;
};
const getMetaDataArray = (value) => {
    if (Array.isArray(value)) {
        return value;
    }
    if (Array.isArray(value?.data)) {
        return value.data;
    }
    return [];
};
const getBusinessIdForRequest = async (req) => {
    const businessId = req.user?.businessId || req.businessId;
    if (businessId) {
        return businessId;
    }
    if (!req.user?.id) {
        return null;
    }
    const business = await prisma_1.default.business.findFirst({
        where: { ownerId: req.user.id },
        select: { id: true },
    });
    return business?.id || null;
};
const resolveTenantContext = async (req) => {
    const businessId = normalizeOptionalString(req.user?.businessId) ||
        normalizeOptionalString(req.body?.businessId) ||
        normalizeOptionalString(req.query?.businessId) ||
        (await getBusinessIdForRequest(req));
    if (!businessId) {
        return null;
    }
    return {
        businessId,
        tenantId: normalizeOptionalString(req.user?.tenantId) ||
            normalizeOptionalString(req.body?.tenantId) ||
            normalizeOptionalString(req.query?.tenantId) ||
            businessId,
    };
};
const buildFallbackInstagramAccount = async (client) => {
    const pageId = normalizeOptionalString(client.pageId);
    if (!pageId) {
        return null;
    }
    const username = await (0, instagramProfile_service_1.fetchInstagramUsername)(pageId, client.accessToken || null);
    return {
        clientId: client.id,
        pageId,
        igUserId: pageId,
        name: username || pageId,
    };
};
const getIntegrations = async (req, res) => {
    try {
        const businessId = req.user.businessId;
        const clients = await prisma_1.default.client.findMany({
            where: { businessId },
            select: {
                id: true,
                platform: true,
                isActive: true,
            },
        });
        res.json(clients);
    }
    catch (err) {
        res.status(500).json({ error: "Failed" });
    }
};
exports.getIntegrations = getIntegrations;
const getOnboarding = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const onboarding = await (0, onboarding_service_1.getOnboardingSnapshot)(businessId);
        return res.json({
            success: true,
            data: onboarding,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch onboarding",
        });
    }
};
exports.getOnboarding = getOnboarding;
const getInstagramAccounts = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                message: "Missing Authorization bearer token or session",
            });
        }
        const businessId = await getBusinessIdForRequest(req);
        if (!businessId) {
            console.log("IG accounts fetched:", []);
            return res.status(200).json([]);
        }
        const clients = await prisma_1.default.client.findMany({
            where: {
                businessId,
                platform: "INSTAGRAM",
                isActive: true,
                deletedAt: null,
            },
            select: {
                id: true,
                pageId: true,
                accessToken: true,
            },
            orderBy: { createdAt: "desc" },
        });
        if (!clients.length) {
            console.log("IG accounts fetched:", []);
            return res.status(200).json([]);
        }
        const accountsByClientId = new Map();
        for (const client of clients) {
            const clientPageId = normalizeOptionalString(client.pageId);
            if (!clientPageId || !client.accessToken) {
                continue;
            }
            try {
                const accessToken = (0, encrypt_1.decrypt)(client.accessToken);
                const pagesRes = await axios_1.default.get("https://graph.facebook.com/v19.0/me/accounts", {
                    params: {
                        access_token: accessToken,
                        fields: "id,name",
                    },
                    timeout: 10000,
                });
                const pages = getMetaDataArray(pagesRes.data);
                for (const page of pages) {
                    const pageId = normalizeOptionalString(page?.id);
                    if (!pageId) {
                        continue;
                    }
                    try {
                        const pageRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${pageId}`, {
                            params: {
                                fields: "instagram_business_account,name",
                                access_token: accessToken,
                            },
                            timeout: 10000,
                        });
                        const igUserId = normalizeOptionalString(pageRes.data?.instagram_business_account?.id);
                        if (!igUserId) {
                            continue;
                        }
                        if (clientPageId !== igUserId && clientPageId !== pageId) {
                            continue;
                        }
                        accountsByClientId.set(client.id, {
                            clientId: client.id,
                            pageId,
                            igUserId,
                            name: normalizeOptionalString(pageRes.data?.name) ||
                                normalizeOptionalString(page?.name) ||
                                igUserId,
                        });
                    }
                    catch (pageError) {
                        console.warn("Instagram page lookup failed:", {
                            clientId: client.id,
                            pageId,
                            error: pageError?.response?.data ||
                                pageError?.message ||
                                pageError,
                        });
                    }
                }
            }
            catch (error) {
                console.warn("Instagram accounts lookup failed:", {
                    clientId: client.id,
                    error: error?.response?.data ||
                        error?.message ||
                        error,
                });
            }
            if (!accountsByClientId.has(client.id)) {
                const fallbackAccount = await buildFallbackInstagramAccount(client);
                if (fallbackAccount) {
                    accountsByClientId.set(client.id, fallbackAccount);
                }
            }
        }
        const accounts = Array.from(accountsByClientId.values());
        console.log("IG accounts fetched:", accounts);
        return res.status(200).json(accounts);
    }
    catch (err) {
        console.error("IG accounts error:", err);
        return res.status(200).json([]);
    }
};
exports.getInstagramAccounts = getInstagramAccounts;
const getConnectHubDashboard = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const dashboard = await (0, saasPackagingConnectHubOS_service_1.getConnectHubProjection)({
            businessId: context.businessId,
            tenantId: context.tenantId,
        });
        return res.json({
            success: true,
            data: dashboard,
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to load connect hub projection",
            error: String(error?.message || "connect_hub_error"),
        });
    }
};
exports.getConnectHubDashboard = getConnectHubDashboard;
const provisionConnectHubTenant = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.provisionTenantSaaSPackaging)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            legalName: normalizeOptionalString(req.body?.legalName),
            region: normalizeOptionalString(req.body?.region),
            timezone: normalizeOptionalString(req.body?.timezone),
            contactEmail: normalizeOptionalString(req.body?.contactEmail),
            plan: normalizeOptionalString(req.body?.plan) || undefined,
            replayToken: normalizeOptionalString(req.body?.replayToken),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Failed to provision tenant",
            error: String(error?.message || "provision_failed"),
        });
    }
};
exports.provisionConnectHubTenant = provisionConnectHubTenant;
const connectInstagramHub = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.connectInstagramOneClick)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            replayToken: normalizeOptionalString(req.body?.replayToken),
            reconnect: Boolean(req.body?.reconnect),
            externalAccountRef: normalizeOptionalString(req.body?.externalAccountRef),
            scopes: Array.isArray(req.body?.scopes) ? req.body.scopes : undefined,
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Instagram connect failed",
            error: String(error?.message || "instagram_connect_failed"),
        });
    }
};
exports.connectInstagramHub = connectInstagramHub;
const connectWhatsAppHub = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.connectWhatsAppGuidedWizard)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            replayToken: normalizeOptionalString(req.body?.replayToken),
            reconnect: Boolean(req.body?.reconnect),
            scenario: normalizeOptionalString(req.body?.scenario),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "WhatsApp connect failed",
            error: String(error?.message || "whatsapp_connect_failed"),
        });
    }
};
exports.connectWhatsAppHub = connectWhatsAppHub;
const retryConnectDiagnostic = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.retryConnectionDiagnostic)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            diagnosticKey: normalizeOptionalString(req.body?.diagnosticKey) ||
                normalizeOptionalString(req.params?.diagnosticKey),
            retryToken: normalizeOptionalString(req.body?.retryToken),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Retry failed",
            error: String(error?.message || "retry_failed"),
        });
    }
};
exports.retryConnectDiagnostic = retryConnectDiagnostic;
const getIntegrationDiagnostics = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const diagnostics = await (0, saasPackagingConnectHubOS_service_1.getIntegrationDiagnosticsProjection)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            provider: normalizeOptionalString(req.params?.provider) ||
                normalizeOptionalString(req.query?.provider),
            environment: normalizeOptionalString(req.query?.environment) || "LIVE",
        });
        return res.json({
            success: true,
            data: diagnostics,
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch diagnostics",
            error: String(error?.message || "diagnostics_failed"),
        });
    }
};
exports.getIntegrationDiagnostics = getIntegrationDiagnostics;
const saveConnectHubWizardProgress = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.saveSetupWizardProgress)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            step: normalizeOptionalString(req.body?.step) || "BUSINESS_INFO",
            payload: req.body?.payload || {},
            replayToken: normalizeOptionalString(req.body?.replayToken),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Failed to save wizard progress",
            error: String(error?.message || "wizard_save_failed"),
        });
    }
};
exports.saveConnectHubWizardProgress = saveConnectHubWizardProgress;
const upgradeConnectHubPlan = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.processPlanUpgrade)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            toPlan: normalizeOptionalString(req.body?.toPlan) || "STARTER",
            replayToken: normalizeOptionalString(req.body?.replayToken),
            remainingCycleDays: Number(req.body?.remainingCycleDays || 20),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Upgrade failed",
            error: String(error?.message || "upgrade_failed"),
        });
    }
};
exports.upgradeConnectHubPlan = upgradeConnectHubPlan;
const meterConnectHubFeatureGate = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.meterFeatureEntitlementUsage)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            featureKey: normalizeOptionalString(req.body?.featureKey) || "channels",
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            units: Number(req.body?.units || 1),
            replayToken: normalizeOptionalString(req.body?.replayToken),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Feature gate check failed",
            error: String(error?.message || "feature_gate_failed"),
        });
    }
};
exports.meterConnectHubFeatureGate = meterConnectHubFeatureGate;
const runConnectHubSelfAudit = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const audit = await (0, saasPackagingConnectHubOS_service_1.runSaaSPackagingConnectHubSelfAudit)({
            businessId: context.businessId,
            tenantId: context.tenantId,
        });
        return res.json({
            success: true,
            data: audit,
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Self audit failed",
            error: String(error?.message || "self_audit_failed"),
        });
    }
};
exports.runConnectHubSelfAudit = runConnectHubSelfAudit;
