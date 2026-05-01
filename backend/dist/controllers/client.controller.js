"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMetaOAuth = exports.getSingleClient = exports.deleteClient = exports.updateClient = exports.getClients = exports.updateAITraining = exports.getClientStatus = exports.metaOAuthConnect = exports.createClient = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const encrypt_1 = require("../utils/encrypt");
const axios_1 = __importDefault(require("axios"));
const plan_config_1 = require("../config/plan.config");
const feature_service_1 = require("../services/feature.service");
const onboarding_service_1 = require("../services/onboarding.service");
const connectionHealth_service_1 = require("../services/connectionHealth.service");
const tenant_service_1 = require("../services/tenant.service");
const subscriptionAuthority_service_1 = require("../services/subscriptionAuthority.service");
const metaOAuthState_1 = require("../utils/metaOAuthState");
/*
---------------------------------------------------
HELPER FUNCTIONS
---------------------------------------------------
*/
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
const getAxiosErrorMessage = (error) => error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Unknown error";
const createClientControllerError = (message, code) => {
    const error = new Error(message);
    error.code = code;
    return error;
};
const getMetaOAuthRuntimeConfig = () => {
    const appId = String(process.env.META_APP_ID || "").trim();
    const appSecret = String(process.env.META_APP_SECRET || "").trim();
    const backendUrl = String(env_1.env.BACKEND_URL || process.env.BACKEND_URL || "").trim();
    if (!appId || !backendUrl) {
        return null;
    }
    return {
        appId,
        appSecret,
        backendUrl,
    };
};
const extractFirstWhatsAppPhoneNumberId = (payload) => {
    const queue = [payload];
    const visited = new Set();
    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }
        visited.add(node);
        const phoneNumbers = getMetaDataArray(node.phone_numbers);
        for (const phoneNumber of phoneNumbers) {
            const phoneNumberId = normalizeOptionalString(phoneNumber?.id);
            if (phoneNumberId) {
                return phoneNumberId;
            }
        }
        for (const child of Object.values(node)) {
            if (child && typeof child === "object") {
                queue.push(child);
            }
        }
    }
    return null;
};
const fetchInstagramConnection = async (accessToken) => {
    const pagesRes = await axios_1.default.get("https://graph.facebook.com/v19.0/me/accounts", {
        params: {
            fields: "id,name,access_token,instagram_business_account",
            access_token: accessToken,
        },
    });
    const page = getMetaDataArray(pagesRes.data)?.[0];
    const facebookPageId = normalizeOptionalString(page?.id);
    const pageId = normalizeOptionalString(page?.instagram_business_account?.id) ||
        facebookPageId;
    const pageAccessToken = normalizeOptionalString(page?.access_token) || normalizeOptionalString(accessToken);
    console.log("INSTAGRAM CONNECT IDENTIFIERS", {
        facebookPageId,
        pageId,
    });
    return {
        facebookPageId,
        pageId,
        pageAccessToken,
    };
};
const fetchWhatsAppPhoneNumberId = async (accessToken) => {
    const lookupRequests = [
        {
            label: "me/businesses",
            url: "https://graph.facebook.com/v19.0/me/businesses",
            params: {
                fields: "id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}",
                access_token: accessToken,
            },
        },
        {
            label: "me",
            url: "https://graph.facebook.com/v19.0/me",
            params: {
                fields: "businesses{id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}},client_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}}",
                access_token: accessToken,
            },
        },
    ];
    for (const lookup of lookupRequests) {
        try {
            const response = await axios_1.default.get(lookup.url, {
                params: lookup.params,
            });
            const phoneNumberId = extractFirstWhatsAppPhoneNumberId(response.data);
            if (phoneNumberId) {
                console.log("WHATSAPP CONNECT IDENTIFIERS", {
                    source: lookup.label,
                    phoneNumberId,
                });
                return phoneNumberId;
            }
        }
        catch (error) {
            console.log("WHATSAPP CONNECT LOOKUP FAILED", {
                source: lookup.label,
                message: getAxiosErrorMessage(error),
            });
        }
    }
    return null;
};
const upsertConnectedClient = async ({ businessId, platform, phoneNumberId, pageId, accessToken, aiTone, businessInfo, pricingInfo, faqKnowledge, salesInstructions, }) => {
    const normalizedPlatform = normalizeOptionalString(platform)?.toUpperCase() || "SYSTEM";
    const normalizedPhoneNumberId = normalizeOptionalString(phoneNumberId);
    const normalizedPageId = normalizeOptionalString(pageId);
    const normalizedAccessToken = String(accessToken || "").trim();
    const sameBusinessClientFilters = [
        normalizedPageId
            ? {
                pageId: normalizedPageId,
            }
            : null,
        normalizedPhoneNumberId
            ? {
                phoneNumberId: normalizedPhoneNumberId,
            }
            : null,
    ].filter(Boolean);
    if (!sameBusinessClientFilters.length) {
        throw createClientControllerError("pageId or phoneNumberId is required", "CLIENT_UNIQUE_KEY_REQUIRED");
    }
    const existingPlatformClient = await prisma_1.default.client.findUnique({
        where: {
            businessId_platform: {
                businessId,
                platform: normalizedPlatform,
            },
        },
    });
    if (normalizedPageId) {
        const conflictingPageClient = await prisma_1.default.client.findFirst({
            where: {
                pageId: normalizedPageId,
                NOT: {
                    businessId,
                },
            },
            select: {
                id: true,
            },
        });
        if (conflictingPageClient &&
            conflictingPageClient.id !== existingPlatformClient?.id) {
            throw createClientControllerError("This connected account already exists for another business", "CLIENT_OWNERSHIP_CONFLICT");
        }
    }
    if (normalizedPhoneNumberId) {
        const conflictingPhoneClient = await prisma_1.default.client.findFirst({
            where: {
                phoneNumberId: normalizedPhoneNumberId,
                NOT: {
                    businessId,
                },
            },
            select: {
                id: true,
            },
        });
        if (conflictingPhoneClient &&
            conflictingPhoneClient.id !== existingPlatformClient?.id) {
            throw createClientControllerError("This connected account already exists for another business", "CLIENT_OWNERSHIP_CONFLICT");
        }
    }
    const updateData = {
        businessId,
        platform: normalizedPlatform,
        phoneNumberId: normalizedPhoneNumberId || existingPlatformClient?.phoneNumberId || null,
        pageId: normalizedPageId || existingPlatformClient?.pageId || null,
        accessToken: normalizedAccessToken,
        ...(aiTone !== undefined
            ? { aiTone: normalizeOptionalString(aiTone) }
            : {}),
        ...(businessInfo !== undefined
            ? { businessInfo: normalizeOptionalString(businessInfo) }
            : {}),
        ...(pricingInfo !== undefined
            ? { pricingInfo: normalizeOptionalString(pricingInfo) }
            : {}),
        ...(faqKnowledge !== undefined
            ? { faqKnowledge: normalizeOptionalString(faqKnowledge) }
            : {}),
        ...(salesInstructions !== undefined
            ? { salesInstructions: normalizeOptionalString(salesInstructions) }
            : {}),
        isActive: true,
        deletedAt: null,
    };
    const sameBusinessClient = existingPlatformClient
        ? existingPlatformClient
        : await prisma_1.default.client.findFirst({
            where: {
                businessId,
                OR: sameBusinessClientFilters,
            },
        });
    if (sameBusinessClient) {
        await prisma_1.default.client.updateMany({
            where: {
                id: sameBusinessClient.id,
                businessId,
            },
            data: updateData,
        });
        const client = await prisma_1.default.client.findFirst({
            where: {
                id: sameBusinessClient.id,
                businessId,
            },
        });
        if (!client) {
            throw createClientControllerError("Client update failed", "CLIENT_UPDATE_FAILED");
        }
        console.log("CLIENT UPSERT SUCCESS", {
            businessId: client.businessId,
            platform: client.platform,
            pageId: client.pageId,
            phoneNumberId: client.phoneNumberId,
        });
        return client;
    }
    const client = await prisma_1.default.client.create({
        data: updateData,
    });
    console.log("CLIENT UPSERT SUCCESS", {
        businessId: client.businessId,
        platform: client.platform,
        pageId: client.pageId,
        phoneNumberId: client.phoneNumberId,
    });
    return client;
};
const getSubscription = async (businessId) => {
    const snapshot = await (0, subscriptionAuthority_service_1.getCanonicalSubscriptionSnapshot)(businessId);
    return snapshot
        ? {
            plan: snapshot.plan,
            status: snapshot.status,
        }
        : null;
};
const getAllowedPlatforms = async (businessId, subscription) => {
    if (!subscription?.plan) {
        return ["WHATSAPP", "INSTAGRAM"];
    }
    const planContext = await (0, feature_service_1.resolvePlanContext)(businessId).catch(() => null);
    if (!planContext || planContext.state !== "ACTIVE") {
        return ["WHATSAPP", "INSTAGRAM"];
    }
    const planKey = (0, plan_config_1.getPlanKey)(subscription.plan);
    if (planKey === "PRO" || planKey === "ELITE") {
        return ["WHATSAPP", "INSTAGRAM"];
    }
    if (planKey === "BASIC") {
        return ["INSTAGRAM"];
    }
    return [];
};
const queueOnboardingDemoForClient = async (businessId, client) => {
    try {
        await (0, onboarding_service_1.triggerOnboardingDemo)({
            businessId,
            client: {
                id: client.id,
                platform: client.platform,
                isActive: client.isActive ?? true,
            },
        });
    }
    catch (error) {
        console.error("Onboarding demo trigger failed:", error);
    }
};
/*
---------------------------------------------------
CREATE CLIENT
---------------------------------------------------
*/
const createClient = async (req, res) => {
    try {
        const userId = req.user?.id;
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        if (!userId || !businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        let { platform, phoneNumberId, pageId, accessToken, aiTone, businessInfo, pricingInfo, 
        /* NEW AI TRAINING FIELDS */
        faqKnowledge, salesInstructions } = req.body;
        if (!platform || !accessToken) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "platform and accessToken required",
            });
        }
        platform = platform.toUpperCase();
        const subscription = await getSubscription(businessId);
        const allowedPlatforms = await getAllowedPlatforms(businessId, subscription);
        if (!allowedPlatforms.length) {
            return res.status(403).json({
                success: false,
                data: null,
                message: "Your current plan does not allow new integrations",
            });
        }
        if (!allowedPlatforms.includes(platform)) {
            return res.status(403).json({
                success: false,
                data: null,
                message: `${platform} integration not allowed in your plan`,
            });
        }
        let resolvedPhoneNumberId = normalizeOptionalString(phoneNumberId);
        let resolvedPageId = normalizeOptionalString(pageId);
        if (platform === "WHATSAPP" && !resolvedPhoneNumberId) {
            resolvedPhoneNumberId = await fetchWhatsAppPhoneNumberId(accessToken);
        }
        if (platform === "INSTAGRAM" && !resolvedPageId) {
            const instagramConnection = await fetchInstagramConnection(accessToken);
            resolvedPageId = instagramConnection.pageId;
            accessToken = instagramConnection.pageAccessToken || accessToken;
        }
        if (platform === "WHATSAPP" && !resolvedPhoneNumberId) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Unable to resolve WhatsApp phone number ID",
            });
        }
        if (platform === "INSTAGRAM" && !resolvedPageId) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Unable to resolve Instagram page ID",
            });
        }
        const encryptedToken = (0, encrypt_1.encrypt)(accessToken);
        const client = await upsertConnectedClient({
            businessId,
            platform,
            phoneNumberId: resolvedPhoneNumberId,
            pageId: resolvedPageId,
            accessToken: encryptedToken,
            aiTone,
            businessInfo,
            pricingInfo,
            faqKnowledge,
            salesInstructions,
        });
        await queueOnboardingDemoForClient(businessId, client);
        return res.status(201).json({
            success: true,
            data: {
                client,
            },
            message: "Client created successfully",
        });
    }
    catch (error) {
        if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "phoneNumberId or pageId required",
            });
        }
        if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "This connected account already exists for another business",
            });
        }
        if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "This connected account already exists for your business",
            });
        }
        if (error.code === "P2002") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "This connected account already exists for your business",
            });
        }
        console.error("Create client error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Client creation failed",
        });
    }
};
exports.createClient = createClient;
/*
---------------------------------------------------
META OAUTH CONNECT (INSTAGRAM)
---------------------------------------------------
*/
const metaOAuthConnect = async (req, res) => {
    try {
        const userId = req.user?.id;
        const requestBusinessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const { code, state, aiTone, businessInfo, pricingInfo, faqKnowledge, salesInstructions, } = req.body || {};
        const oauthState = (0, metaOAuthState_1.verifyMetaOAuthState)(state);
        if (!userId || !requestBusinessId || !code || !oauthState) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Invalid OAuth callback contract",
            });
        }
        if (oauthState.userId !== userId ||
            oauthState.businessId !== requestBusinessId ||
            oauthState.workspaceId !== requestBusinessId) {
            return res.status(403).json({
                success: false,
                data: null,
                message: "OAuth state mismatch",
            });
        }
        const businessId = oauthState.businessId;
        const targetPlatform = oauthState.platform;
        const subscription = await getSubscription(businessId);
        const allowedPlatforms = await getAllowedPlatforms(businessId, subscription);
        if (!allowedPlatforms.includes(targetPlatform)) {
            return res.status(403).json({
                success: false,
                data: null,
                message: `${targetPlatform} integration not allowed in your workspace`,
            });
        }
        const metaRuntime = getMetaOAuthRuntimeConfig();
        if (!metaRuntime?.appSecret) {
            return res.status(500).json({
                success: false,
                data: null,
                message: "Meta OAuth is not configured on this server",
            });
        }
        const redirectUri = `${metaRuntime.backendUrl}/api/oauth/meta/callback`;
        const shortTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
            params: {
                client_id: metaRuntime.appId,
                client_secret: metaRuntime.appSecret,
                redirect_uri: redirectUri,
                code,
            },
        });
        const shortToken = normalizeOptionalString(shortTokenRes.data?.access_token);
        if (!shortToken) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Meta token exchange failed",
            });
        }
        const longTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
            params: {
                grant_type: "fb_exchange_token",
                client_id: metaRuntime.appId,
                client_secret: metaRuntime.appSecret,
                fb_exchange_token: shortToken,
            },
        });
        const longToken = normalizeOptionalString(longTokenRes.data?.access_token);
        if (!longToken) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Unable to resolve long lived token",
            });
        }
        const connectedClients = [];
        if (targetPlatform === "INSTAGRAM") {
            const instagramConnection = await fetchInstagramConnection(longToken);
            if (!instagramConnection.pageId) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "No Instagram page found",
                });
            }
            const instagramAccessToken = instagramConnection.pageAccessToken || longToken;
            const instagramClient = await upsertConnectedClient({
                businessId,
                platform: "INSTAGRAM",
                pageId: instagramConnection.pageId,
                accessToken: (0, encrypt_1.encrypt)(instagramAccessToken),
                aiTone,
                businessInfo,
                pricingInfo,
                faqKnowledge,
                salesInstructions,
            });
            connectedClients.push(instagramClient);
            await queueOnboardingDemoForClient(businessId, instagramClient);
            if (allowedPlatforms.includes("WHATSAPP")) {
                const phoneNumberId = await fetchWhatsAppPhoneNumberId(longToken);
                if (phoneNumberId) {
                    const whatsappClient = await upsertConnectedClient({
                        businessId,
                        platform: "WHATSAPP",
                        phoneNumberId,
                        accessToken: (0, encrypt_1.encrypt)(longToken),
                    }).catch((error) => {
                        console.log("WHATSAPP CLIENT UPSERT FAILED", {
                            businessId,
                            phoneNumberId,
                            message: getAxiosErrorMessage(error),
                        });
                        return null;
                    });
                    if (whatsappClient) {
                        connectedClients.push(whatsappClient);
                    }
                }
            }
        }
        else {
            const phoneNumberId = await fetchWhatsAppPhoneNumberId(longToken);
            if (!phoneNumberId) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "Unable to resolve WhatsApp phone number ID",
                });
            }
            const whatsappClient = await upsertConnectedClient({
                businessId,
                platform: "WHATSAPP",
                phoneNumberId,
                accessToken: (0, encrypt_1.encrypt)(longToken),
            });
            connectedClients.push(whatsappClient);
            await queueOnboardingDemoForClient(businessId, whatsappClient);
        }
        const healthRows = await Promise.all(connectedClients.map(async (client) => {
            const healthy = await (0, connectionHealth_service_1.checkConnectionHealth)(client).catch(() => Boolean(client?.isActive));
            return {
                platform: client.platform,
                healthy,
                connected: Boolean(client.isActive),
                clientId: client.id,
                pageId: client.pageId || null,
                phoneNumberId: client.phoneNumberId || null,
            };
        }));
        return res.json({
            success: true,
            data: {
                platform: targetPlatform,
                mode: oauthState.mode,
                workspaceId: oauthState.workspaceId,
                clients: healthRows,
            },
            message: `${targetPlatform} connected successfully`,
        });
    }
    catch (error) {
        if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "phoneNumberId or pageId required",
            });
        }
        if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "This connected account already exists for another business",
            });
        }
        if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT" || error.code === "P2002") {
            return res.status(400).json({
                success: false,
                data: null,
                message: "This connected account already exists for your business",
            });
        }
        console.error("Meta OAuth error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Integration connection failed",
        });
    }
};
exports.metaOAuthConnect = metaOAuthConnect;
/*
---------------------------------------------------
CLIENT CONNECTION STATUS
---------------------------------------------------
*/
const getClientStatus = async (req, res) => {
    try {
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const [instagramClient, whatsappClient] = await Promise.all([
            prisma_1.default.client.findFirst({
                where: {
                    businessId,
                    platform: "INSTAGRAM",
                    deletedAt: null,
                },
                select: {
                    id: true,
                    platform: true,
                    pageId: true,
                    accessToken: true,
                    isActive: true,
                },
            }),
            prisma_1.default.client.findFirst({
                where: {
                    businessId,
                    platform: "WHATSAPP",
                    deletedAt: null,
                },
                select: {
                    id: true,
                    platform: true,
                    phoneNumberId: true,
                    accessToken: true,
                    isActive: true,
                },
            }),
        ]);
        const [instagramHealthy, whatsappHealthy] = await Promise.all([
            instagramClient?.pageId && instagramClient.isActive
                ? (0, connectionHealth_service_1.checkConnectionHealth)(instagramClient)
                : false,
            whatsappClient?.phoneNumberId && whatsappClient.isActive
                ? (0, connectionHealth_service_1.checkConnectionHealth)(whatsappClient)
                : false,
        ]);
        return res.json({
            success: true,
            data: {
                instagram: {
                    connected: Boolean(instagramClient?.pageId),
                    pageId: instagramClient?.pageId || null,
                    healthy: instagramHealthy,
                },
                whatsapp: {
                    connected: Boolean(whatsappClient?.phoneNumberId),
                    phoneNumberId: whatsappClient?.phoneNumberId || null,
                    healthy: whatsappHealthy,
                },
            },
        });
    }
    catch (error) {
        console.error("Client status error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Failed to load client status",
        });
    }
};
exports.getClientStatus = getClientStatus;
/*
---------------------------------------------------
AI TRAINING UPDATE
---------------------------------------------------
*/
const updateAITraining = async (req, res) => {
    try {
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const { businessInfo, pricingInfo, aiTone, faqKnowledge, salesInstructions } = req.body;
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId,
                isActive: true,
                deletedAt: null,
            },
            select: {
                id: true,
            },
        });
        if (!client) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Client not found",
            });
        }
        await prisma_1.default.client.updateMany({
            where: {
                id: client.id,
                businessId,
            },
            data: {
                businessInfo,
                pricingInfo,
                aiTone,
                faqKnowledge,
                salesInstructions
            },
        });
        const updatedClient = await prisma_1.default.client.findFirst({
            where: {
                id: client.id,
                businessId,
                deletedAt: null,
            },
        });
        if (!updatedClient) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Client not found",
            });
        }
        return res.json({
            success: true,
            data: {
                client: updatedClient,
            },
            message: "AI training updated successfully",
        });
    }
    catch (error) {
        console.error("AI training update error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "AI training update failed"
        });
    }
};
exports.updateAITraining = updateAITraining;
/*
---------------------------------------------------
FETCH CLIENTS
---------------------------------------------------
*/
const getClients = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                data: [],
                message: "Unauthorized",
            });
        }
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        console.log("GET /clients hit", {
            userId,
            businessId,
        });
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: [],
                message: "Unauthorized",
            });
        }
        const clients = await prisma_1.default.client.findMany({
            where: {
                businessId,
                isActive: true,
                deletedAt: null,
                platform: {
                    not: "SYSTEM",
                },
            },
            orderBy: { createdAt: "desc" },
        });
        return res.json({
            success: true,
            data: clients,
            clients,
        });
    }
    catch (error) {
        console.error("API ERROR:", error);
        return res.status(500).json({
            success: false,
            data: [],
            message: "Internal error",
        });
    }
};
exports.getClients = getClients;
/*
---------------------------------------------------
UPDATE CLIENT
---------------------------------------------------
*/
const updateClient = async (req, res) => {
    try {
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const { accessToken } = req.body;
        if (!accessToken) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "Access token required",
            });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId,
                isActive: true,
                deletedAt: null,
            },
            select: { id: true },
        });
        if (!client) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Client not found",
            });
        }
        const encryptedToken = (0, encrypt_1.encrypt)(accessToken);
        await prisma_1.default.client.updateMany({
            where: {
                id,
                businessId,
            },
            data: { accessToken: encryptedToken },
        });
        return res.json({
            success: true,
            data: {
                id,
            },
            message: "Client updated successfully",
        });
    }
    catch (error) {
        console.error("Update client error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Update failed",
        });
    }
};
exports.updateClient = updateClient;
/*
---------------------------------------------------
DELETE CLIENT
---------------------------------------------------
*/
const deleteClient = async (req, res) => {
    try {
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId,
                isActive: true,
                deletedAt: null,
            },
            select: { id: true },
        });
        if (!client) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Client not found",
            });
        }
        await prisma_1.default.client.updateMany({
            where: {
                id,
                businessId,
            },
            data: {
                isActive: false,
                deletedAt: new Date(),
            },
        });
        return res.json({
            success: true,
            data: {
                id,
            },
            message: "Client deleted successfully",
        });
    }
    catch (error) {
        console.error("Delete client error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Delete failed",
        });
    }
};
exports.deleteClient = deleteClient;
/*
---------------------------------------------------
GET SINGLE CLIENT
---------------------------------------------------
*/
const getSingleClient = async (req, res) => {
    try {
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId,
                isActive: true,
                deletedAt: null,
            },
        });
        if (!client) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Client not found",
            });
        }
        return res.json({
            success: true,
            data: client,
        });
    }
    catch (error) {
        console.error("Fetch client error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Fetch failed",
        });
    }
};
exports.getSingleClient = getSingleClient;
/* ====================================================
👇 YAHAN PASTE KAR (FILE KE END ME)
==================================================== */
const startMetaOAuth = async (req, res) => {
    try {
        const userId = req.user?.id;
        const businessId = (0, tenant_service_1.getRequestBusinessId)(req);
        if (!userId || !businessId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const platform = (0, metaOAuthState_1.parseMetaOAuthPlatform)(normalizeOptionalString(req.query.platform));
        const mode = (0, metaOAuthState_1.parseMetaOAuthMode)(normalizeOptionalString(req.query.mode));
        if (!platform) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "platform must be INSTAGRAM or WHATSAPP",
            });
        }
        const subscription = await getSubscription(businessId);
        const allowedPlatforms = await getAllowedPlatforms(businessId, subscription);
        if (!allowedPlatforms.includes(platform)) {
            return res.status(403).json({
                success: false,
                data: null,
                message: `${platform} integration not allowed in your workspace`,
            });
        }
        const state = (0, metaOAuthState_1.createMetaOAuthState)({
            userId,
            businessId,
            workspaceId: businessId,
            platform,
            mode,
        });
        if (mode === "reconnect") {
            console.info("Reconnect triggered", {
                userId,
                platform,
            });
        }
        const metaRuntime = getMetaOAuthRuntimeConfig();
        if (!metaRuntime) {
            return res.status(500).json({
                success: false,
                data: null,
                message: "Meta OAuth is not configured on this server",
            });
        }
        const redirectUri = `${metaRuntime.backendUrl}/api/oauth/meta/callback`;
        const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${metaRuntime.appId}&redirect_uri=${redirectUri}&scope=pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_messages,whatsapp_business_management&response_type=code&state=${state}`;
        return res.json({
            success: true,
            data: {
                url,
                state,
                platform,
                mode,
                workspaceId: businessId,
            },
        });
    }
    catch (error) {
        console.error("Start OAuth error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Failed to start OAuth",
        });
    }
};
exports.startMetaOAuth = startMetaOAuth;
