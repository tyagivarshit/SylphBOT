"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDeveloperPlatformExtensibilitySelfAudit = exports.revokeDeveloperPlatformApiKey = exports.createDeveloperPlatformApiKey = exports.applyDeveloperPlatformOverride = exports.applyDeveloperPlatformPolicy = exports.invokeDeveloperPlatformPackageAction = exports.subscribeDeveloperPlatformEvent = exports.bindDeveloperPlatformSecret = exports.installDeveloperPlatformPackage = exports.publishDeveloperPlatformRelease = exports.publishDeveloperPlatformPackage = exports.registerDeveloperPlatformNamespace = exports.getDeveloperPlatformDashboard = exports.applyConnectHubOverride = exports.assignConnectHubSeat = exports.rollbackConnectHubMarketplaceArtifact = exports.installConnectHubMarketplaceArtifact = exports.upsertConnectHubBranding = exports.promoteSandboxConnectHubIntegration = exports.recoverConnectHubWebhook = exports.expireConnectHubToken = exports.refreshConnectHubToken = exports.runWhatsAppDoctor = exports.runConnectHubSelfAudit = exports.meterConnectHubFeatureGate = exports.upgradeConnectHubPlan = exports.saveConnectHubWizardProgress = exports.getIntegrationDiagnostics = exports.retryConnectDiagnostic = exports.connectWhatsAppHub = exports.connectInstagramHub = exports.provisionConnectHubTenant = exports.getConnectHubDashboard = exports.getInstagramAccounts = exports.getOnboarding = exports.getIntegrations = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encrypt_1 = require("../utils/encrypt");
const onboarding_service_1 = require("../services/onboarding.service");
const instagramProfile_service_1 = require("../services/instagramProfile.service");
const saasPackagingConnectHubOS_service_1 = require("../services/saasPackagingConnectHubOS.service");
const developerPlatformExtensibilityOS_service_1 = require("../services/developerPlatformExtensibilityOS.service");
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
const runWhatsAppDoctor = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const doctor = await (0, saasPackagingConnectHubOS_service_1.runWhatsAppConnectDoctor)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            autoResolve: Boolean(req.body?.autoResolve),
        });
        return res.json({
            success: true,
            data: doctor,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "WhatsApp doctor failed",
            error: String(error?.message || "whatsapp_doctor_failed"),
        });
    }
};
exports.runWhatsAppDoctor = runWhatsAppDoctor;
const refreshConnectHubToken = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.refreshIntegrationToken)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            replayToken: normalizeOptionalString(req.body?.replayToken),
            forceFail: Boolean(req.body?.forceFail),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Token refresh failed",
            error: String(error?.message || "token_refresh_failed"),
        });
    }
};
exports.refreshConnectHubToken = refreshConnectHubToken;
const expireConnectHubToken = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.expireIntegrationToken)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            reason: normalizeOptionalString(req.body?.reason),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Token expire simulation failed",
            error: String(error?.message || "token_expire_failed"),
        });
    }
};
exports.expireConnectHubToken = expireConnectHubToken;
const recoverConnectHubWebhook = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.recoverProviderWebhook)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
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
            message: "Webhook recovery failed",
            error: String(error?.message || "webhook_recovery_failed"),
        });
    }
};
exports.recoverConnectHubWebhook = recoverConnectHubWebhook;
const promoteSandboxConnectHubIntegration = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.promoteSandboxIntegrationToLive)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            provider: normalizeOptionalString(req.body?.provider) || "INSTAGRAM",
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
            message: "Sandbox promotion failed",
            error: String(error?.message || "sandbox_promotion_failed"),
        });
    }
};
exports.promoteSandboxConnectHubIntegration = promoteSandboxConnectHubIntegration;
const upsertConnectHubBranding = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.upsertTenantBranding)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            logoRef: normalizeOptionalString(req.body?.logoRef),
            domain: normalizeOptionalString(req.body?.domain),
            theme: req.body?.theme || {},
            emailBranding: req.body?.emailBranding || {},
            whatsappIdentity: req.body?.whatsappIdentity || {},
            proposalBranding: req.body?.proposalBranding || {},
            invoiceBranding: req.body?.invoiceBranding || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Branding update failed",
            error: String(error?.message || "branding_update_failed"),
        });
    }
};
exports.upsertConnectHubBranding = upsertConnectHubBranding;
const installConnectHubMarketplaceArtifact = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.installMarketplaceArtifact)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            packageKey: normalizeOptionalString(req.body?.packageKey) || "default_connector",
            packageType: (normalizeOptionalString(req.body?.packageType) || "CONNECTOR"),
            version: normalizeOptionalString(req.body?.version) || "1.0.0",
            permissionSet: Array.isArray(req.body?.permissionSet) ? req.body.permissionSet : [],
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
            message: "Marketplace install failed",
            error: String(error?.message || "marketplace_install_failed"),
        });
    }
};
exports.installConnectHubMarketplaceArtifact = installConnectHubMarketplaceArtifact;
const rollbackConnectHubMarketplaceArtifact = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.rollbackMarketplaceArtifact)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            installKey: normalizeOptionalString(req.body?.installKey) || "",
            reason: normalizeOptionalString(req.body?.reason),
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Marketplace rollback failed",
            error: String(error?.message || "marketplace_rollback_failed"),
        });
    }
};
exports.rollbackConnectHubMarketplaceArtifact = rollbackConnectHubMarketplaceArtifact;
const assignConnectHubSeat = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.assignTenantSeat)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            userId: normalizeOptionalString(req.body?.userId) || "",
            role: normalizeOptionalString(req.body?.role) || "MEMBER",
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Seat assignment failed",
            error: String(error?.message || "seat_assignment_failed"),
        });
    }
};
exports.assignConnectHubSeat = assignConnectHubSeat;
const applyConnectHubOverride = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, saasPackagingConnectHubOS_service_1.applyPackagingOverride)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            scope: normalizeOptionalString(req.body?.scope) || "CONNECT_HUB",
            targetType: normalizeOptionalString(req.body?.targetType) || "PROVIDER",
            targetKey: normalizeOptionalString(req.body?.targetKey),
            action: normalizeOptionalString(req.body?.action) || "ALLOW",
            reason: normalizeOptionalString(req.body?.reason) || "manual_override",
            priority: Number(req.body?.priority || 100),
            expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Override application failed",
            error: String(error?.message || "override_apply_failed"),
        });
    }
};
exports.applyConnectHubOverride = applyConnectHubOverride;
const getDeveloperPlatformDashboard = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const projection = await (0, developerPlatformExtensibilityOS_service_1.getDeveloperPlatformProjection)({
            businessId: context.businessId,
            tenantId: context.tenantId,
        });
        return res.json({
            success: true,
            data: projection,
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to load developer platform projection",
            error: String(error?.message || "developer_platform_projection_failed"),
        });
    }
};
exports.getDeveloperPlatformDashboard = getDeveloperPlatformDashboard;
const registerDeveloperPlatformNamespace = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const row = await (0, developerPlatformExtensibilityOS_service_1.registerDeveloperNamespace)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            namespace: normalizeOptionalString(req.body?.namespace) || "automexia.default",
            displayName: normalizeOptionalString(req.body?.displayName),
            ownerUserId: normalizeOptionalString(req.body?.ownerUserId) || req.user?.id || "SYSTEM",
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: row,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Namespace registration failed",
            error: String(error?.message || "namespace_registration_failed"),
        });
    }
};
exports.registerDeveloperPlatformNamespace = registerDeveloperPlatformNamespace;
const publishDeveloperPlatformPackage = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.publishExtensionPackage)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            namespace: normalizeOptionalString(req.body?.namespace),
            slug: normalizeOptionalString(req.body?.slug) || "default-extension",
            displayName: normalizeOptionalString(req.body?.displayName),
            packageType: normalizeOptionalString(req.body?.packageType) || "APP",
            visibility: normalizeOptionalString(req.body?.visibility) || "PRIVATE",
            packageKey: normalizeOptionalString(req.body?.packageKey),
            replayToken: normalizeOptionalString(req.body?.replayToken),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Package publish failed",
            error: String(error?.message || "package_publish_failed"),
        });
    }
};
exports.publishDeveloperPlatformPackage = publishDeveloperPlatformPackage;
const publishDeveloperPlatformRelease = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.publishExtensionRelease)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            packageKey: normalizeOptionalString(req.body?.packageKey) || "",
            versionTag: normalizeOptionalString(req.body?.versionTag),
            changelog: normalizeOptionalString(req.body?.changelog),
            manifest: req.body?.manifest || {},
            replayToken: normalizeOptionalString(req.body?.replayToken),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Release publish failed",
            error: String(error?.message || "release_publish_failed"),
        });
    }
};
exports.publishDeveloperPlatformRelease = publishDeveloperPlatformRelease;
const installDeveloperPlatformPackage = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.installExtensionForTenant)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            packageKey: normalizeOptionalString(req.body?.packageKey) || "",
            releaseKey: normalizeOptionalString(req.body?.releaseKey),
            environment: normalizeOptionalString(req.body?.environment) || "LIVE",
            installedBy: normalizeOptionalString(req.body?.installedBy) || req.user?.id || "SYSTEM",
            permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : [],
            replayToken: normalizeOptionalString(req.body?.replayToken),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Package install failed",
            error: String(error?.message || "package_install_failed"),
        });
    }
};
exports.installDeveloperPlatformPackage = installDeveloperPlatformPackage;
const bindDeveloperPlatformSecret = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.setExtensionSecretBinding)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            installKey: normalizeOptionalString(req.body?.installKey) || "",
            secretName: normalizeOptionalString(req.body?.secretName) || "EXTENSION_SECRET",
            secretValue: normalizeOptionalString(req.body?.secretValue) || "",
            replayToken: normalizeOptionalString(req.body?.replayToken),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Secret binding failed",
            error: String(error?.message || "secret_binding_failed"),
        });
    }
};
exports.bindDeveloperPlatformSecret = bindDeveloperPlatformSecret;
const subscribeDeveloperPlatformEvent = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.subscribeExtensionEvent)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            installKey: normalizeOptionalString(req.body?.installKey) || "",
            eventType: normalizeOptionalString(req.body?.eventType) || "event.default",
            handler: normalizeOptionalString(req.body?.handler) || "handler.default",
            replayToken: normalizeOptionalString(req.body?.replayToken),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Event subscription failed",
            error: String(error?.message || "event_subscription_failed"),
        });
    }
};
exports.subscribeDeveloperPlatformEvent = subscribeDeveloperPlatformEvent;
const invokeDeveloperPlatformPackageAction = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.invokeExtensionAction)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            installKey: normalizeOptionalString(req.body?.installKey) || "",
            action: normalizeOptionalString(req.body?.action) || "run",
            trigger: normalizeOptionalString(req.body?.trigger) || "MANUAL",
            payload: req.body?.payload || {},
            dedupeKey: normalizeOptionalString(req.body?.dedupeKey),
            replayToken: normalizeOptionalString(req.body?.replayToken),
            forceFail: Boolean(req.body?.forceFail),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Extension execution failed",
            error: String(error?.message || "extension_execution_failed"),
        });
    }
};
exports.invokeDeveloperPlatformPackageAction = invokeDeveloperPlatformPackageAction;
const applyDeveloperPlatformPolicy = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.applyExtensionPolicy)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            scope: normalizeOptionalString(req.body?.scope) || "EXECUTION",
            targetType: normalizeOptionalString(req.body?.targetType) || "TENANT",
            targetKey: normalizeOptionalString(req.body?.targetKey),
            maxExecutionsPerMinute: Number(req.body?.maxExecutionsPerMinute || 120),
            timeoutMs: Number(req.body?.timeoutMs || 15000),
            requiresApproval: Boolean(req.body?.requiresApproval),
            allowedTriggers: Array.isArray(req.body?.allowedTriggers)
                ? req.body.allowedTriggers
                : ["MANUAL", "WEBHOOK", "EVENT", "SCHEDULE"],
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Policy update failed",
            error: String(error?.message || "policy_update_failed"),
        });
    }
};
exports.applyDeveloperPlatformPolicy = applyDeveloperPlatformPolicy;
const applyDeveloperPlatformOverride = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.applyExtensionOverride)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            scope: normalizeOptionalString(req.body?.scope) || "EXECUTION",
            targetType: normalizeOptionalString(req.body?.targetType) || "TENANT",
            targetKey: normalizeOptionalString(req.body?.targetKey),
            action: normalizeOptionalString(req.body?.action) || "ALLOW",
            reason: normalizeOptionalString(req.body?.reason) || "manual_override",
            priority: Number(req.body?.priority || 100),
            expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
            createdBy: normalizeOptionalString(req.body?.createdBy) || req.user?.id || "SYSTEM",
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "Override update failed",
            error: String(error?.message || "override_update_failed"),
        });
    }
};
exports.applyDeveloperPlatformOverride = applyDeveloperPlatformOverride;
const createDeveloperPlatformApiKey = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.createDeveloperPortalApiKey)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            scope: normalizeOptionalString(req.body?.scope) || "DEVELOPER_API",
            expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
            replayToken: normalizeOptionalString(req.body?.replayToken),
            metadata: req.body?.metadata || {},
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "API key create failed",
            error: String(error?.message || "api_key_create_failed"),
        });
    }
};
exports.createDeveloperPlatformApiKey = createDeveloperPlatformApiKey;
const revokeDeveloperPlatformApiKey = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const result = await (0, developerPlatformExtensibilityOS_service_1.revokeDeveloperPortalApiKey)({
            businessId: context.businessId,
            tenantId: context.tenantId,
            apiKeyRef: normalizeOptionalString(req.body?.apiKeyRef) || "",
            reason: normalizeOptionalString(req.body?.reason) || "manual_revoke",
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: "API key revoke failed",
            error: String(error?.message || "api_key_revoke_failed"),
        });
    }
};
exports.revokeDeveloperPlatformApiKey = revokeDeveloperPlatformApiKey;
const runDeveloperPlatformExtensibilitySelfAudit = async (req, res) => {
    try {
        const context = await resolveTenantContext(req);
        if (!context) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const audit = await (0, developerPlatformExtensibilityOS_service_1.runDeveloperPlatformSelfAudit)({
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
            message: "Developer platform self audit failed",
            error: String(error?.message || "developer_platform_self_audit_failed"),
        });
    }
};
exports.runDeveloperPlatformExtensibilitySelfAudit = runDeveloperPlatformExtensibilitySelfAudit;
