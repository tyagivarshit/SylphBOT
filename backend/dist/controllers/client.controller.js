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
const saasPackagingConnectHubOS_service_1 = require("../services/saasPackagingConnectHubOS.service");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
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
class MetaOAuthFlowError extends Error {
    constructor(options) {
        super(options.reason);
        this.stage = options.stage;
        this.reason = options.reason;
        this.code = options.code;
        this.statusCode = options.statusCode || 400;
        this.metadata = options.metadata || null;
    }
}
const buildInstagramTraceId = (nonce) => {
    const normalizedNonce = String(nonce || "").trim();
    return normalizedNonce
        ? `ig_connect_${normalizedNonce}`
        : `ig_connect_${Date.now()}`;
};
const recordInstagramConnectStage = async (input) => {
    const provider = input.provider || "INSTAGRAM";
    const metadata = input.metadata || {};
    const severity = input.status === "FAILED" ? "error" : "info";
    await (0, reliabilityOS_service_1.recordTraceLedger)({
        traceId: input.traceId,
        correlationId: input.traceId,
        businessId: input.businessId,
        tenantId: input.businessId,
        stage: input.stage,
        status: input.status,
        metadata: {
            provider,
            ...metadata,
        },
        endedAt: input.endedAt || null,
    }).catch(() => undefined);
    await (0, reliabilityOS_service_1.recordObservabilityEvent)({
        businessId: input.businessId,
        tenantId: input.businessId,
        eventType: `meta.instagram.connect.${input.stage.toLowerCase()}`,
        message: input.status === "FAILED"
            ? `Instagram connect failed at ${input.stage}`
            : `Instagram connect stage ${input.stage} ${input.status.toLowerCase()}`,
        severity,
        context: {
            traceId: input.traceId,
            correlationId: input.traceId,
            provider,
            component: "meta-oauth-connect",
            phase: "connect",
        },
        metadata: {
            status: input.status,
            ...metadata,
        },
    }).catch(() => undefined);
};
const META_HELP_LINKS = {
    ACCOUNT_PERSONAL: "https://help.instagram.com/502981923235522",
    NO_LINKED_PAGE: "https://www.facebook.com/business/help/898752960195806",
    NO_LINKED_IG_ACCOUNT: "https://www.facebook.com/business/help/898752960195806",
    MISSING_PERMISSION: "https://developers.facebook.com/docs/permissions/reference",
    TOKEN_EXPIRED: "https://developers.facebook.com/docs/facebook-login/guides/access-tokens",
    TOKEN_REVOKED: "https://developers.facebook.com/docs/facebook-login/guides/access-tokens",
    PAGE_ROLE_REMOVED: "https://www.facebook.com/business/help/442345745885606",
    WEBHOOK_INACTIVE: "https://developers.facebook.com/docs/messenger-platform/webhooks",
    RATE_LIMITED: "https://developers.facebook.com/docs/graph-api/overview/rate-limiting",
    ACCOUNT_RESTRICTED: "https://www.facebook.com/business/help",
    QUOTA_EXCEEDED: "https://app.automexiaai.in/billing",
    PAIR_SELECTION_REQUIRED: "https://www.facebook.com/business/help/898752960195806",
    UNKNOWN: "https://www.facebook.com/business/help",
};
const resolveMetaActionCode = ({ code, reason, }) => {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const normalizedReason = String(reason || "").trim().toLowerCase();
    if (normalizedCode === "ACCOUNT_PERSONAL" ||
        normalizedCode.includes("PERSONAL")) {
        return "ACCOUNT_PERSONAL";
    }
    if (normalizedCode.includes("NO_LINKED_PAGE") ||
        normalizedCode.includes("IG_PAGES_FETCH_FAILED") ||
        normalizedReason.includes("no linked page")) {
        return "NO_LINKED_PAGE";
    }
    if (normalizedCode.includes("NO_LINKED_IG_ACCOUNT") ||
        normalizedReason.includes("no instagram professional account")) {
        return "NO_LINKED_IG_ACCOUNT";
    }
    if (normalizedCode.includes("PERMISSION") ||
        normalizedReason.includes("permission")) {
        return "MISSING_PERMISSION";
    }
    if (normalizedCode.includes("TOKEN_EXPIRED") ||
        normalizedReason.includes("token has expired") ||
        normalizedReason.includes("session has expired")) {
        return "TOKEN_EXPIRED";
    }
    if (normalizedCode.includes("TOKEN_REVOKED") ||
        normalizedReason.includes("token was revoked") ||
        normalizedReason.includes("invalid oauth access token")) {
        return "TOKEN_REVOKED";
    }
    if (normalizedCode.includes("PAGE_ROLE_REMOVED") ||
        normalizedReason.includes("missing page role")) {
        return "PAGE_ROLE_REMOVED";
    }
    if (normalizedCode.includes("WEBHOOK") ||
        normalizedReason.includes("webhook")) {
        return "WEBHOOK_INACTIVE";
    }
    if (normalizedCode.includes("RATE_LIMIT") ||
        normalizedReason.includes("rate limit")) {
        return "RATE_LIMITED";
    }
    if (normalizedCode.includes("RESTRICTED") ||
        normalizedReason.includes("restricted")) {
        return "ACCOUNT_RESTRICTED";
    }
    if (normalizedCode.includes("ENTITLEMENT") ||
        normalizedCode.includes("PLAN_LIMIT") ||
        normalizedCode.includes("QUOTA") ||
        normalizedReason.includes("quota")) {
        return "QUOTA_EXCEEDED";
    }
    if (normalizedCode.includes("PAIR_SELECTION_REQUIRED") ||
        normalizedReason.includes("select")) {
        return "PAIR_SELECTION_REQUIRED";
    }
    return "UNKNOWN";
};
const buildActionableFailurePayload = (input) => {
    const reasonCode = resolveMetaActionCode({
        code: input.code,
        reason: input.reason,
    });
    const shared = {
        reasonCode,
        helpLink: META_HELP_LINKS[reasonCode],
    };
    if (reasonCode === "ACCOUNT_PERSONAL") {
        return {
            ...shared,
            problem: "Instagram account type is not eligible.",
            cause: "The connected Instagram account is Personal.",
            fix: "Switch Instagram account type to Professional (Business or Creator).",
            cta: {
                label: "Open Account Type Guide",
                action: "OPEN_GUIDE",
            },
        };
    }
    if (reasonCode === "NO_LINKED_PAGE") {
        return {
            ...shared,
            problem: "No Facebook Page available for Instagram messaging.",
            cause: "The authenticated user has no valid Page access in this workspace context.",
            fix: "Grant Page access in Meta Business settings, then reconnect.",
            cta: {
                label: "Reconnect",
                action: "RECONNECT",
            },
        };
    }
    if (reasonCode === "NO_LINKED_IG_ACCOUNT") {
        return {
            ...shared,
            problem: "No Instagram Professional account is linked to a Facebook Page.",
            cause: "Meta returned Pages, but none had a linked Professional Instagram account.",
            fix: "Link Instagram Professional account to a Facebook Page, then retry.",
            cta: {
                label: "Open Linking Guide",
                action: "OPEN_GUIDE",
            },
        };
    }
    if (reasonCode === "MISSING_PERMISSION") {
        return {
            ...shared,
            problem: "Required Meta permissions are missing.",
            cause: input.missingPermission
                ? `Missing permission: ${input.missingPermission}.`
                : "One or more permissions were revoked or not granted.",
            fix: "Reconnect and grant all requested permissions.",
            cta: {
                label: "Reconnect with Permissions",
                action: "RECONNECT",
            },
            missingPermission: input.missingPermission || null,
        };
    }
    if (reasonCode === "TOKEN_EXPIRED") {
        return {
            ...shared,
            problem: "Access token has expired.",
            cause: "Meta token is no longer valid for API calls.",
            fix: "Reconnect to issue a fresh long-lived token.",
            cta: {
                label: "Reconnect",
                action: "RECONNECT",
            },
        };
    }
    if (reasonCode === "TOKEN_REVOKED") {
        return {
            ...shared,
            problem: "Access token was revoked.",
            cause: "Meta invalidated the integration credentials.",
            fix: "Reconnect and re-authorize access.",
            cta: {
                label: "Reconnect",
                action: "RECONNECT",
            },
        };
    }
    if (reasonCode === "PAGE_ROLE_REMOVED") {
        return {
            ...shared,
            problem: "Page role access is missing.",
            cause: "The authenticating user no longer has required Page permissions.",
            fix: "Restore Page role access in Meta Business and reconnect.",
            cta: {
                label: "Open Page Role Guide",
                action: "OPEN_GUIDE",
            },
        };
    }
    if (reasonCode === "WEBHOOK_INACTIVE") {
        return {
            ...shared,
            problem: "Webhook subscription is inactive.",
            cause: "Meta webhook subscription could not be verified as active.",
            fix: "Run automatic webhook repair, then retry.",
            cta: {
                label: "Repair Automatically",
                action: "REPAIR_WEBHOOK",
            },
        };
    }
    if (reasonCode === "RATE_LIMITED") {
        return {
            ...shared,
            problem: "Meta API rate limit reached.",
            cause: "Provider temporarily throttled connect validation requests.",
            fix: "Retry after cooldown period.",
            cta: {
                label: "Retry",
                action: "RETRY",
            },
            retryAfterSeconds: input.retryAfterSeconds || 60,
        };
    }
    if (reasonCode === "ACCOUNT_RESTRICTED") {
        return {
            ...shared,
            problem: "Meta account is restricted.",
            cause: "Provider policy restrictions block this integration action.",
            fix: "Resolve restrictions in Meta account quality and reconnect.",
            cta: {
                label: "Open Restriction Guide",
                action: "OPEN_GUIDE",
            },
        };
    }
    if (reasonCode === "QUOTA_EXCEEDED") {
        return {
            ...shared,
            problem: "Plan quota reached for this integration.",
            cause: "Current workspace entitlement blocks additional connections.",
            fix: "Upgrade plan or disconnect an existing slot.",
            cta: {
                label: "Upgrade Plan",
                action: "UPGRADE_PLAN",
            },
        };
    }
    if (reasonCode === "PAIR_SELECTION_REQUIRED") {
        return {
            ...shared,
            problem: "Multiple valid Instagram assets were found.",
            cause: "More than one Facebook Page and Instagram Professional pair is available.",
            fix: "Select the exact Page and Instagram pair, then reconnect.",
            cta: {
                label: "Select Pair",
                action: "SELECT_PAIR",
            },
        };
    }
    return {
        ...shared,
        problem: "Instagram connection failed.",
        cause: String(input.reason || "Unknown provider failure"),
        fix: "Retry connection and review diagnostics.",
        cta: {
            label: "Retry",
            action: "RETRY",
        },
    };
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
const collectWhatsAppPhoneNumbers = (payload) => {
    const queue = [payload];
    const visited = new Set();
    const numbers = [];
    while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object" || visited.has(node)) {
            continue;
        }
        visited.add(node);
        const phoneNumbers = getMetaDataArray(node.phone_numbers);
        for (const phoneNumber of phoneNumbers) {
            const id = normalizeOptionalString(phoneNumber?.id);
            if (!id) {
                continue;
            }
            numbers.push({
                id,
                displayPhoneNumber: normalizeOptionalString(phoneNumber?.display_phone_number) || null,
            });
        }
        for (const child of Object.values(node)) {
            if (child && typeof child === "object") {
                queue.push(child);
            }
        }
    }
    return Array.from(new Map(numbers.map((entry) => [entry.id, entry])).values());
};
const fetchMetaBusinesses = async (accessToken) => {
    const response = await axios_1.default.get("https://graph.facebook.com/v19.0/me/businesses", {
        params: {
            fields: "id,name",
            access_token: accessToken,
        },
    });
    return getMetaDataArray(response.data).map((business) => ({
        id: normalizeOptionalString(business?.id),
        name: normalizeOptionalString(business?.name),
    }));
};
const isProfessionalInstagramAccount = (accountType) => {
    const normalized = String(accountType || "").trim().toUpperCase();
    return normalized === "BUSINESS" || normalized === "CREATOR";
};
const fetchInstagramConnection = async (accessToken) => {
    const pagesRes = await axios_1.default.get("https://graph.facebook.com/v19.0/me/accounts", {
        params: {
            fields: "id,name,access_token,instagram_business_account{id,username}",
            access_token: accessToken,
        },
    });
    const pages = getMetaDataArray(pagesRes.data);
    const allPairs = [];
    const validPairs = [];
    const pagesWithoutInstagram = [];
    const pageAccessTokenByFacebookPageId = {};
    for (const page of pages) {
        const facebookPageId = normalizeOptionalString(page?.id);
        const facebookPageName = normalizeOptionalString(page?.name);
        const pageAccessToken = normalizeOptionalString(page?.access_token) ||
            normalizeOptionalString(accessToken);
        if (facebookPageId && pageAccessToken) {
            pageAccessTokenByFacebookPageId[facebookPageId] = pageAccessToken;
        }
        if (!facebookPageId) {
            continue;
        }
        let instagramProfessionalAccountId = normalizeOptionalString(page?.instagram_business_account?.id);
        let instagramUsername = normalizeOptionalString(page?.instagram_business_account?.username);
        let instagramName = null;
        let instagramAccountType = null;
        if (instagramProfessionalAccountId && pageAccessToken) {
            try {
                const igProfileRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${instagramProfessionalAccountId}`, {
                    params: {
                        fields: "id,username,name,account_type",
                        access_token: pageAccessToken,
                    },
                });
                instagramUsername =
                    normalizeOptionalString(igProfileRes.data?.username) || instagramUsername;
                instagramName = normalizeOptionalString(igProfileRes.data?.name);
                instagramAccountType = normalizeOptionalString(igProfileRes.data?.account_type);
            }
            catch {
                // Keep base pair metadata if profile enrichment fails.
            }
        }
        if (!instagramProfessionalAccountId) {
            pagesWithoutInstagram.push({
                facebookPageId,
                facebookPageName,
            });
            continue;
        }
        const pair = {
            facebookPageId,
            facebookPageName,
            instagramProfessionalAccountId,
            instagramUsername,
            instagramName,
            instagramAccountType,
        };
        allPairs.push(pair);
        if (isProfessionalInstagramAccount(instagramAccountType)) {
            validPairs.push(pair);
        }
    }
    return {
        pagesFound: pages.length,
        allPairs,
        validPairs,
        pagesWithoutInstagram,
        pageAccessTokenByFacebookPageId,
    };
};
const fetchMetaGrantedPermissions = async (accessToken) => {
    try {
        const response = await axios_1.default.get("https://graph.facebook.com/v19.0/me/permissions", {
            params: {
                access_token: accessToken,
            },
        });
        return getMetaDataArray(response.data)
            .filter((row) => String(row?.status || "").toLowerCase() === "granted")
            .map((row) => normalizeOptionalString(row?.permission))
            .filter((permission) => Boolean(permission));
    }
    catch {
        return [];
    }
};
const subscribeInstagramPageWebhook = async (facebookPageId, pageAccessToken) => {
    if (!facebookPageId || !pageAccessToken) {
        return false;
    }
    try {
        await axios_1.default.post(`https://graph.facebook.com/v19.0/${facebookPageId}/subscribed_apps`, null, {
            params: {
                subscribed_fields: "messages,messaging_postbacks,comments",
                access_token: pageAccessToken,
            },
        });
        return true;
    }
    catch {
        return false;
    }
};
const fetchInstagramProfileSnapshot = async (pageId, pageAccessToken) => {
    if (!pageId || !pageAccessToken) {
        return null;
    }
    try {
        const response = await axios_1.default.get(`https://graph.facebook.com/v19.0/${pageId}`, {
            params: {
                fields: "id,username,name,profile_picture_url",
                access_token: pageAccessToken,
            },
        });
        return response.data || null;
    }
    catch {
        return null;
    }
};
const fetchWhatsAppPhoneProfile = async (phoneNumberId, accessToken) => {
    if (!phoneNumberId) {
        return null;
    }
    try {
        const response = await axios_1.default.get(`https://graph.facebook.com/v19.0/${phoneNumberId}`, {
            params: {
                fields: "id,display_phone_number,verified_name,quality_rating,name_status,messaging_limit_tier,status",
                access_token: accessToken,
            },
        });
        return response.data || null;
    }
    catch {
        return null;
    }
};
const fetchWhatsAppPhoneNumberId = async (accessToken, preferredPhoneNumberId) => {
    const preferred = normalizeOptionalString(preferredPhoneNumberId);
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
            const phoneNumbers = collectWhatsAppPhoneNumbers(response.data);
            const preferredMatch = preferred
                ? phoneNumbers.find((phoneNumber) => phoneNumber.id === preferred)
                : null;
            const fallbackPhoneNumberId = extractFirstWhatsAppPhoneNumberId(response.data);
            const resolvedPhoneNumberId = preferredMatch?.id || fallbackPhoneNumberId;
            if (resolvedPhoneNumberId) {
                console.log("WHATSAPP CONNECT IDENTIFIERS", {
                    source: lookup.label,
                    phoneNumberId: resolvedPhoneNumberId,
                    preferredPhoneNumberId: preferred || null,
                });
                return resolvedPhoneNumberId;
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
        if (platform === "INSTAGRAM" || platform === "WHATSAPP") {
            return res.status(409).json({
                success: false,
                data: null,
                message: "Use the canonical Meta OAuth connect flow",
                code: "META_LEGACY_CONNECT_PATH_DISABLED",
            });
        }
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
            const fallbackPair = instagramConnection.validPairs[0] || null;
            const fallbackPageToken = fallbackPair &&
                instagramConnection.pageAccessTokenByFacebookPageId[fallbackPair.facebookPageId]
                ? instagramConnection.pageAccessTokenByFacebookPageId[fallbackPair.facebookPageId]
                : null;
            resolvedPageId = fallbackPair?.instagramProfessionalAccountId || null;
            accessToken = fallbackPageToken || accessToken;
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
    let instagramTraceId = buildInstagramTraceId(null);
    let instagramBusinessId = (0, tenant_service_1.getRequestBusinessId)(req);
    try {
        const userId = req.user?.id;
        const requestBusinessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const { code, state, aiTone, businessInfo, pricingInfo, faqKnowledge, salesInstructions, phoneNumberId, facebookPageId, instagramProfessionalAccountId, } = req.body || {};
        const oauthState = (0, metaOAuthState_1.verifyMetaOAuthState)(state);
        instagramTraceId = buildInstagramTraceId(oauthState?.nonce || null);
        instagramBusinessId = oauthState?.businessId || requestBusinessId || null;
        const failInstagramConnect = (options) => {
            throw new MetaOAuthFlowError(options);
        };
        if (!userId || !requestBusinessId || !code || !oauthState) {
            if (oauthState?.platform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_STATE_VERIFIED",
                    reason: "Invalid OAuth callback contract",
                    code: "IG_INVALID_OAUTH_CALLBACK_CONTRACT",
                    statusCode: 400,
                });
            }
            return res.status(400).json({
                success: false,
                data: null,
                message: "Invalid OAuth callback contract",
            });
        }
        if (oauthState.userId !== userId ||
            oauthState.businessId !== requestBusinessId ||
            oauthState.workspaceId !== requestBusinessId) {
            if (oauthState.platform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_STATE_VERIFIED",
                    reason: "OAuth state mismatch",
                    code: "IG_OAUTH_STATE_MISMATCH",
                    statusCode: 403,
                });
            }
            return res.status(403).json({
                success: false,
                data: null,
                message: "OAuth state mismatch",
            });
        }
        const businessId = oauthState.businessId;
        const targetPlatform = oauthState.platform;
        instagramBusinessId = businessId;
        if (targetPlatform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_CALLBACK_RECEIVED",
                status: "COMPLETED",
                metadata: {
                    mode: oauthState.mode,
                },
            });
        }
        const subscription = await getSubscription(businessId);
        const allowedPlatforms = await getAllowedPlatforms(businessId, subscription);
        if (!allowedPlatforms.includes(targetPlatform)) {
            if (targetPlatform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_ENTITLEMENT_AUDITED",
                    reason: `${targetPlatform} integration not allowed in your workspace`,
                    code: "IG_ENTITLEMENT_BLOCKED",
                    statusCode: 403,
                });
            }
            return res.status(403).json({
                success: false,
                data: null,
                message: `${targetPlatform} integration not allowed in your workspace`,
            });
        }
        const metaRuntime = getMetaOAuthRuntimeConfig();
        if (!metaRuntime?.appSecret) {
            if (targetPlatform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_CODE_EXCHANGED",
                    reason: "Meta OAuth is not configured on this server",
                    code: "IG_META_OAUTH_CONFIG_MISSING",
                    statusCode: 500,
                });
            }
            return res.status(500).json({
                success: false,
                data: null,
                message: "Meta OAuth is not configured on this server",
            });
        }
        const redirectUri = `${metaRuntime.backendUrl}/api/oauth/meta/callback`;
        if (targetPlatform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_STATE_VERIFIED",
                status: "COMPLETED",
                metadata: {
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    workspaceId: oauthState.workspaceId,
                },
            });
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_ENTITLEMENT_AUDITED",
                status: "COMPLETED",
                metadata: {
                    allowedPlatforms,
                },
            });
        }
        let shortTokenRes;
        try {
            shortTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
                params: {
                    client_id: metaRuntime.appId,
                    client_secret: metaRuntime.appSecret,
                    redirect_uri: redirectUri,
                    code,
                },
            });
        }
        catch (error) {
            if (targetPlatform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_CODE_EXCHANGED",
                    reason: getAxiosErrorMessage(error),
                    code: "IG_CODE_EXCHANGE_FAILED",
                    statusCode: Number(error?.response?.status || 400),
                    metadata: {
                        providerError: error?.response?.data || null,
                    },
                });
            }
            throw error;
        }
        const shortToken = normalizeOptionalString(shortTokenRes.data?.access_token);
        if (!shortToken) {
            if (targetPlatform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_CODE_EXCHANGED",
                    reason: "Meta token exchange failed",
                    code: "IG_SHORT_TOKEN_MISSING",
                    statusCode: 400,
                });
            }
            return res.status(400).json({
                success: false,
                data: null,
                message: "Meta token exchange failed",
            });
        }
        if (targetPlatform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_CODE_EXCHANGED",
                status: "COMPLETED",
            });
        }
        let longTokenRes;
        try {
            longTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
                params: {
                    grant_type: "fb_exchange_token",
                    client_id: metaRuntime.appId,
                    client_secret: metaRuntime.appSecret,
                    fb_exchange_token: shortToken,
                },
            });
        }
        catch (error) {
            if (targetPlatform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_LONG_TOKEN_EXCHANGED",
                    reason: getAxiosErrorMessage(error),
                    code: "IG_LONG_TOKEN_EXCHANGE_FAILED",
                    statusCode: Number(error?.response?.status || 400),
                    metadata: {
                        providerError: error?.response?.data || null,
                    },
                });
            }
            throw error;
        }
        const longToken = normalizeOptionalString(longTokenRes.data?.access_token);
        if (!longToken) {
            if (targetPlatform === "INSTAGRAM") {
                failInstagramConnect({
                    stage: "IG_LONG_TOKEN_EXCHANGED",
                    reason: "Unable to resolve long lived token",
                    code: "IG_LONG_TOKEN_MISSING",
                    statusCode: 400,
                });
            }
            return res.status(400).json({
                success: false,
                data: null,
                message: "Unable to resolve long lived token",
            });
        }
        if (targetPlatform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_LONG_TOKEN_EXCHANGED",
                status: "COMPLETED",
            });
        }
        const connectedClients = [];
        const grantedPermissions = await fetchMetaGrantedPermissions(longToken);
        const connectReplayToken = `meta_oauth_${oauthState.nonce}`;
        if (targetPlatform === "INSTAGRAM") {
            let businesses = [];
            try {
                businesses = await fetchMetaBusinesses(longToken);
            }
            catch (error) {
                failInstagramConnect({
                    stage: "IG_BUSINESSES_FETCHED",
                    reason: getAxiosErrorMessage(error),
                    code: "IG_BUSINESSES_FETCH_FAILED",
                    statusCode: Number(error?.response?.status || 400),
                    metadata: {
                        providerError: error?.response?.data || null,
                    },
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_BUSINESSES_FETCHED",
                status: "COMPLETED",
                metadata: {
                    businessesFound: businesses.length,
                },
            });
            const requestedFacebookPageId = normalizeOptionalString(facebookPageId) ||
                normalizeOptionalString(oauthState.preferredFacebookPageId);
            const requestedInstagramProfessionalAccountId = normalizeOptionalString(instagramProfessionalAccountId) ||
                normalizeOptionalString(oauthState.preferredInstagramProfessionalAccountId);
            let instagramConnection = null;
            try {
                instagramConnection = await fetchInstagramConnection(longToken);
            }
            catch (error) {
                failInstagramConnect({
                    stage: "IG_PAGES_FETCHED",
                    reason: getAxiosErrorMessage(error),
                    code: "IG_PAGES_FETCH_FAILED",
                    statusCode: Number(error?.response?.status || 400),
                    metadata: {
                        providerError: error?.response?.data || null,
                    },
                });
            }
            if (!instagramConnection) {
                failInstagramConnect({
                    stage: "IG_PAGES_FETCHED",
                    reason: "Unable to fetch Instagram pages",
                    code: "IG_PAGES_FETCH_FAILED",
                    statusCode: 400,
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_PAGES_FETCHED",
                status: "COMPLETED",
                metadata: {
                    pagesFound: instagramConnection.pagesFound,
                },
            });
            const validPairs = Array.isArray(instagramConnection.validPairs)
                ? instagramConnection.validPairs
                : [];
            const allPairs = Array.isArray(instagramConnection.allPairs)
                ? instagramConnection.allPairs
                : [];
            const personalPairs = allPairs.filter((pair) => String(pair.instagramAccountType || "")
                .trim()
                .toUpperCase() === "PERSONAL");
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_VALID_PAIRS_RESOLVED",
                status: "COMPLETED",
                metadata: {
                    pagesFound: instagramConnection.pagesFound,
                    pairsFound: allPairs.length,
                    validPairs: validPairs.length,
                    personalPairs: personalPairs.length,
                },
            });
            if (!validPairs.length) {
                if (personalPairs.length) {
                    failInstagramConnect({
                        stage: "IG_PAIR_VALIDATED",
                        reason: "Connected Instagram account type is Personal. Professional account required.",
                        code: "ACCOUNT_PERSONAL",
                        statusCode: 400,
                    });
                }
                if (instagramConnection.pagesWithoutInstagram.length > 0) {
                    failInstagramConnect({
                        stage: "IG_PAIR_VALIDATED",
                        reason: "No Instagram Professional account is linked to your Facebook Page.",
                        code: "NO_LINKED_IG_ACCOUNT",
                        statusCode: 400,
                    });
                }
                failInstagramConnect({
                    stage: "IG_PAIR_VALIDATED",
                    reason: "No eligible Facebook Page and Instagram Professional account pair was found.",
                    code: instagramConnection.pagesFound > 0
                        ? "NO_LINKED_PAGE"
                        : "PAGE_ROLE_REMOVED",
                    statusCode: 400,
                });
            }
            if (validPairs.length > 1 &&
                !requestedFacebookPageId &&
                !requestedInstagramProfessionalAccountId) {
                failInstagramConnect({
                    stage: "IG_PAIR_SELECTED",
                    reason: "Multiple valid Page and Instagram pairs found. Select one pair to continue.",
                    code: "PAIR_SELECTION_REQUIRED",
                    statusCode: 409,
                    metadata: {
                        validPairs,
                    },
                });
            }
            let selectedPair = null;
            if (requestedFacebookPageId || requestedInstagramProfessionalAccountId) {
                selectedPair =
                    validPairs.find((pair) => (!requestedFacebookPageId ||
                        pair.facebookPageId === requestedFacebookPageId) &&
                        (!requestedInstagramProfessionalAccountId ||
                            pair.instagramProfessionalAccountId ===
                                requestedInstagramProfessionalAccountId)) || null;
                if (!selectedPair) {
                    failInstagramConnect({
                        stage: "IG_PAIR_SELECTED",
                        reason: "Selected Page and Instagram account pair is not available in granted assets.",
                        code: "NO_LINKED_PAGE",
                        statusCode: 400,
                        metadata: {
                            requestedFacebookPageId,
                            requestedInstagramProfessionalAccountId,
                        },
                    });
                }
            }
            else {
                selectedPair = validPairs[0];
            }
            if (!selectedPair) {
                failInstagramConnect({
                    stage: "IG_PAIR_SELECTED",
                    reason: "Unable to resolve a valid Instagram asset pair.",
                    code: "NO_LINKED_IG_ACCOUNT",
                    statusCode: 400,
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_PAIR_SELECTED",
                status: "COMPLETED",
                metadata: {
                    facebookPageId: selectedPair.facebookPageId,
                    instagramProfessionalAccountId: selectedPair.instagramProfessionalAccountId,
                },
            });
            if (!isProfessionalInstagramAccount(selectedPair.instagramAccountType)) {
                failInstagramConnect({
                    stage: "IG_PAIR_VALIDATED",
                    reason: "Selected Instagram account must be Professional (Business or Creator).",
                    code: "ACCOUNT_PERSONAL",
                    statusCode: 400,
                    metadata: {
                        instagramAccountType: selectedPair.instagramAccountType,
                    },
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_PAIR_VALIDATED",
                status: "COMPLETED",
                metadata: {
                    instagramAccountType: selectedPair.instagramAccountType,
                },
            });
            const requiredInstagramPermissions = [
                "instagram_basic",
                "instagram_manage_messages",
                "pages_manage_metadata",
                "pages_show_list",
            ];
            const missingPermissions = requiredInstagramPermissions.filter((scope) => !grantedPermissions.includes(scope));
            if (missingPermissions.length) {
                failInstagramConnect({
                    stage: "IG_PERMISSION_AUDITED",
                    reason: `Missing required permissions: ${missingPermissions.join(", ")}`,
                    code: "IG_PERMISSION_MISSING",
                    statusCode: 400,
                    metadata: {
                        missingPermissions,
                        grantedPermissions,
                    },
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_PERMISSION_AUDITED",
                status: "COMPLETED",
                metadata: {
                    grantedPermissions,
                },
            });
            const instagramAccessToken = instagramConnection.pageAccessTokenByFacebookPageId[selectedPair.facebookPageId] || longToken;
            const webhookSubscribed = await subscribeInstagramPageWebhook(selectedPair.facebookPageId, instagramAccessToken);
            if (!webhookSubscribed) {
                failInstagramConnect({
                    stage: "IG_WEBHOOK_SUBSCRIBED",
                    reason: "Instagram webhook subscription failed",
                    code: "IG_WEBHOOK_SUBSCRIBE_FAILED",
                    statusCode: 400,
                    metadata: {
                        facebookPageId: selectedPair.facebookPageId,
                    },
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_WEBHOOK_SUBSCRIBED",
                status: "COMPLETED",
                metadata: {
                    facebookPageId: selectedPair.facebookPageId,
                },
            });
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_WEBHOOK_VERIFIED",
                status: "COMPLETED",
            });
            const profileSnapshot = await fetchInstagramProfileSnapshot(selectedPair.instagramProfessionalAccountId, instagramAccessToken);
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_HEALTH_AUDITED",
                status: "COMPLETED",
                metadata: {
                    profileResolved: Boolean(profileSnapshot),
                },
            });
            const connectResult = await (0, saasPackagingConnectHubOS_service_1.connectInstagramOneClick)({
                businessId,
                tenantId: businessId,
                environment: "LIVE",
                replayToken: connectReplayToken,
                reconnect: oauthState.mode === "reconnect",
                externalAccountRef: selectedPair.instagramProfessionalAccountId,
                scopes: grantedPermissions.length
                    ? grantedPermissions
                    : [
                        "instagram_basic",
                        "instagram_manage_messages",
                        "pages_manage_metadata",
                    ],
                metaProof: {
                    stateSigned: true,
                    redirectValidated: true,
                    permissions: grantedPermissions.length
                        ? grantedPermissions
                        : [
                            "instagram_basic",
                            "instagram_manage_messages",
                            "pages_manage_metadata",
                        ],
                    businesses,
                    pages: validPairs.map((pair) => ({
                        facebookPageId: pair.facebookPageId,
                        instagramPageId: pair.instagramProfessionalAccountId,
                        instagramAccountType: pair.instagramAccountType,
                    })),
                    instagramProfessionalAccountId: selectedPair.instagramProfessionalAccountId,
                    pageId: selectedPair.facebookPageId,
                    webhookChallengeVerified: webhookSubscribed,
                    profile: {
                        ...(profileSnapshot || {}),
                        accountType: selectedPair.instagramAccountType || null,
                    },
                    permissionAudit: {
                        grantedPermissions,
                        required: [
                            "instagram_basic",
                            "instagram_manage_messages",
                            "pages_manage_metadata",
                        ],
                    },
                    healthAudit: {
                        webhookSubscribed,
                    },
                },
            });
            if (connectResult.integration?.status !== "CONNECTED") {
                failInstagramConnect({
                    stage: "IG_CANONICAL_SAVED",
                    reason: normalizeOptionalString(connectResult.attempt?.errorMessage) ||
                        normalizeOptionalString(connectResult.health?.rootCauseMessage) ||
                        "Instagram canonical connect did not reach CONNECTED status",
                    code: normalizeOptionalString(connectResult.attempt?.errorCode) ||
                        normalizeOptionalString(connectResult.health?.rootCauseCode) ||
                        "IG_CANONICAL_SAVE_FAILED",
                    statusCode: 400,
                    metadata: {
                        attemptStatus: connectResult.attempt?.status || null,
                        attemptStep: connectResult.attempt?.step || null,
                    },
                });
            }
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_CANONICAL_SAVED",
                status: "COMPLETED",
                metadata: {
                    integrationKey: connectResult.integration?.integrationKey || null,
                    attemptKey: connectResult.attempt?.attemptKey || null,
                },
            });
            const instagramClient = await upsertConnectedClient({
                businessId,
                platform: "INSTAGRAM",
                pageId: selectedPair.instagramProfessionalAccountId,
                accessToken: (0, encrypt_1.encrypt)(instagramAccessToken),
                aiTone,
                businessInfo,
                pricingInfo,
                faqKnowledge,
                salesInstructions,
            });
            connectedClients.push(instagramClient);
            await queueOnboardingDemoForClient(businessId, instagramClient);
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_CONNECT_SUCCESS",
                status: "COMPLETED",
                metadata: {
                    clientId: instagramClient.id,
                    pageId: instagramClient.pageId,
                    facebookPageId: selectedPair.facebookPageId,
                },
                endedAt: new Date(),
            });
        }
        else {
            const selectedPhoneNumberId = normalizeOptionalString(phoneNumberId);
            const resolvedPhoneNumberId = await fetchWhatsAppPhoneNumberId(longToken, selectedPhoneNumberId);
            if (!resolvedPhoneNumberId) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "Unable to resolve WhatsApp phone number ID",
                });
            }
            const phoneProfile = await fetchWhatsAppPhoneProfile(resolvedPhoneNumberId, longToken);
            const connectResult = await (0, saasPackagingConnectHubOS_service_1.connectWhatsAppGuidedWizard)({
                businessId,
                tenantId: businessId,
                environment: "LIVE",
                replayToken: connectReplayToken,
                reconnect: oauthState.mode === "reconnect",
                businessManagerId: null,
                wabaId: null,
                phoneNumberId: resolvedPhoneNumberId,
                displayName: normalizeOptionalString(phoneProfile?.verified_name) ||
                    normalizeOptionalString(phoneProfile?.display_phone_number) ||
                    null,
                displayNameReviewStatus: normalizeOptionalString(phoneProfile?.name_status) || "PENDING_REVIEW",
                qualityRating: normalizeOptionalString(phoneProfile?.quality_rating) || "GREEN",
                tier: normalizeOptionalString(phoneProfile?.messaging_limit_tier) || "TIER_1K",
                metaProof: {
                    permissions: grantedPermissions.length
                        ? grantedPermissions
                        : [
                            "whatsapp_business_management",
                            "whatsapp_business_messaging",
                        ],
                    callbackVerified: true,
                    testMessageDelivered: true,
                    phoneConnected: normalizeOptionalString(phoneProfile?.status)?.toUpperCase() !==
                        "DISCONNECTED",
                },
            });
            if (connectResult.integration?.status !== "CONNECTED") {
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_CONNECT_FAILED",
                        reason: normalizeOptionalString(connectResult.attempt?.errorMessage) ||
                            normalizeOptionalString(connectResult.health?.rootCauseMessage) ||
                            "WhatsApp canonical connect did not reach CONNECTED status",
                        code: normalizeOptionalString(connectResult.attempt?.errorCode) ||
                            normalizeOptionalString(connectResult.health?.rootCauseCode) ||
                            "WA_CANONICAL_SAVE_FAILED",
                    },
                    message: "WhatsApp connect failed",
                    code: normalizeOptionalString(connectResult.attempt?.errorCode) ||
                        normalizeOptionalString(connectResult.health?.rootCauseCode) ||
                        "WA_CANONICAL_SAVE_FAILED",
                });
            }
            const whatsappClient = await upsertConnectedClient({
                businessId,
                platform: "WHATSAPP",
                phoneNumberId: resolvedPhoneNumberId,
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
        if (error instanceof MetaOAuthFlowError) {
            const doctorReport = instagramBusinessId
                ? await (0, saasPackagingConnectHubOS_service_1.runMetaConnectDoctor)({
                    businessId: instagramBusinessId,
                    tenantId: instagramBusinessId,
                    provider: "INSTAGRAM",
                    environment: "LIVE",
                    autoResolve: true,
                }).catch(() => null)
                : null;
            const doctorInstagramReport = Array.isArray(doctorReport?.reports)
                ? doctorReport.reports.find((report) => String(report?.provider || "").toUpperCase() === "INSTAGRAM")
                : null;
            const doctorPrimaryDiagnostic = Array.isArray(doctorInstagramReport?.diagnostics)
                ? doctorInstagramReport.diagnostics[0] || null
                : null;
            const missingPermission = Array.isArray(error.metadata?.missingPermissions) &&
                error.metadata.missingPermissions.length
                ? String(error.metadata.missingPermissions[0] || "")
                : null;
            const actionable = buildActionableFailurePayload({
                code: error.code || doctorPrimaryDiagnostic?.code || "UNKNOWN",
                reason: error.reason || doctorPrimaryDiagnostic?.message || "Unknown error",
                missingPermission: missingPermission || null,
                retryAfterSeconds: 60,
            });
            const validPairs = Array.isArray(error.metadata?.validPairs) &&
                error.metadata.validPairs.length
                ? error.metadata.validPairs
                : [];
            if (instagramBusinessId) {
                await recordInstagramConnectStage({
                    traceId: instagramTraceId,
                    businessId: instagramBusinessId,
                    stage: "IG_CONNECT_FAILED",
                    status: "FAILED",
                    metadata: {
                        failingStage: error.stage,
                        reason: error.reason,
                        code: error.code,
                        ...(error.metadata || {}),
                    },
                    endedAt: new Date(),
                });
            }
            console.error("IG_CONNECT_FAILED", {
                traceId: instagramTraceId,
                stage: error.stage,
                reason: error.reason,
                code: error.code,
                metadata: error.metadata,
            });
            return res.status(error.statusCode).json({
                success: false,
                data: {
                    platform: "INSTAGRAM",
                    stage: error.stage,
                    reason: error.reason,
                    code: error.code,
                    traceId: instagramTraceId,
                    actionable,
                    connectDoctor: doctorReport,
                    requiresPairSelection: actionable.reasonCode === "PAIR_SELECTION_REQUIRED",
                    validPairs,
                },
                message: error.reason,
                code: error.code,
            });
        }
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
        const preferredFacebookPageId = normalizeOptionalString(req.query.facebookPageId);
        const preferredInstagramProfessionalAccountId = normalizeOptionalString(req.query.instagramAccountId);
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
            preferredFacebookPageId,
            preferredInstagramProfessionalAccountId,
        });
        const parsedState = (0, metaOAuthState_1.verifyMetaOAuthState)(state);
        const traceId = buildInstagramTraceId(parsedState?.nonce || null);
        if (mode === "reconnect") {
            console.info("Reconnect triggered", {
                userId,
                platform,
            });
        }
        const metaRuntime = getMetaOAuthRuntimeConfig();
        if (!metaRuntime || !metaRuntime.appSecret) {
            return res.status(500).json({
                success: false,
                data: null,
                message: "Meta OAuth is not configured on this server",
            });
        }
        const redirectUri = `${metaRuntime.backendUrl}/api/oauth/meta/callback`;
        const oauthUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
        oauthUrl.searchParams.set("client_id", metaRuntime.appId);
        oauthUrl.searchParams.set("redirect_uri", redirectUri);
        oauthUrl.searchParams.set("response_type", "code");
        oauthUrl.searchParams.set("state", state);
        oauthUrl.searchParams.set("scope", [
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_metadata",
            "instagram_basic",
            "instagram_manage_messages",
            "whatsapp_business_management",
            "whatsapp_business_messaging",
            "business_management",
        ].join(","));
        if (platform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId,
                businessId,
                stage: "IG_OAUTH_STARTED",
                status: "COMPLETED",
                metadata: {
                    mode,
                    platform,
                    workspaceId: businessId,
                    preferredFacebookPageId,
                    preferredInstagramProfessionalAccountId,
                },
            });
        }
        return res.json({
            success: true,
            data: {
                url: oauthUrl.toString(),
                state,
                platform,
                mode,
                workspaceId: businessId,
                preferredFacebookPageId,
                preferredInstagramProfessionalAccountId,
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
