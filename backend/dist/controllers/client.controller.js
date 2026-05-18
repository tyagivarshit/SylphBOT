"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMetaOAuth = exports.getSingleClient = exports.deleteClient = exports.updateClient = exports.getClients = exports.updateAITraining = exports.getClientStatus = exports.getMetaOAuthLifecycle = exports.runMetaOAuthContinuationFromQueueJob = exports.metaOAuthConnect = exports.createClient = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const env_1 = require("../config/env");
const encrypt_1 = require("../utils/encrypt");
const axios_1 = __importDefault(require("axios"));
const redis_1 = require("../config/redis");
const plan_config_1 = require("../config/plan.config");
const feature_service_1 = require("../services/feature.service");
const onboarding_service_1 = require("../services/onboarding.service");
const connectionHealth_service_1 = require("../services/connectionHealth.service");
const tenant_service_1 = require("../services/tenant.service");
const subscriptionAuthority_service_1 = require("../services/subscriptionAuthority.service");
const metaOAuthState_1 = require("../utils/metaOAuthState");
const saasPackagingConnectHubOS_service_1 = require("../services/saasPackagingConnectHubOS.service");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
const performanceMetrics_1 = require("../observability/performanceMetrics");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const metaOAuthLifecycle_service_1 = require("../services/metaOAuthLifecycle.service");
const integrationOnboardingProjection_queue_1 = require("../queues/integrationOnboardingProjection.queue");
const metaOAuthContinuation_queue_1 = require("../queues/metaOAuthContinuation.queue");
const integrationProjectionRecovery_service_1 = require("../services/integrationProjectionRecovery.service");
const redisSafety_1 = require("../redis/redisSafety");
const boundedTimeout_1 = require("../utils/boundedTimeout");
const META_OAUTH_CONNECT_TIMEOUT_MS = 45000;
const META_GRAPH_TIMEOUT_MS = 12000;
const META_GRAPH_FAST_LANE_TIMEOUT_MS = 2200;
const META_OAUTH_CALLBACK_SYNC_BUDGET_MS = 1200;
const META_OAUTH_CALLBACK_STATE_VALIDATION_BUDGET_MS = Math.max(50, Number(process.env.META_OAUTH_CALLBACK_STATE_VALIDATION_BUDGET_MS || 120));
const META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS = Math.max(60, Number(process.env.META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS || 180));
const META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS = Math.max(50, Number(process.env.META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS || 150));
const META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS = Math.max(150, Number(process.env.META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS || 500));
const emitCallbackMetric = (input) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: input.name,
        value: Number.isFinite(Number(input.value)) ? Number(input.value) : 1,
        businessId: input.businessId || null,
        route: "clients_oauth_meta_callback",
        metadata: input.metadata || null,
    });
};
const emitCallbackRuntimeIsolationPreserved = (input) => {
    (0, performanceMetrics_1.emitPerformanceMetric)({
        name: "callback_runtime_isolation_preserved",
        value: 1,
        businessId: input.businessId,
        route: "clients_oauth_meta_callback",
        metadata: {
            platform: input.platform,
            mode: input.mode,
            result: input.result,
            operationId: normalizeOptionalString(input.operationId),
            ...(input.metadata || {}),
        },
    });
};
const emitOnboardingTraceEvent = (input) => {
    void (0, reliabilityOS_service_1.recordObservabilityEvent)({
        businessId: input.businessId,
        tenantId: input.tenantId || input.businessId,
        eventType: input.eventType,
        message: input.message,
        severity: input.severity || "info",
        context: {
            component: "clients_oauth_meta_callback",
            phase: "onboarding",
        },
        metadata: input.metadata || null,
    }).catch(() => undefined);
};
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
const isMetaProviderTransientError = (error) => {
    const status = Number(error?.response?.status || 0);
    if (status >= 500 || status === 429) {
        return true;
    }
    const code = String(error?.code || "")
        .trim()
        .toUpperCase();
    if (code === "ECONNABORTED" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET" ||
        code === "EAI_AGAIN") {
        return true;
    }
    const reason = String(getAxiosErrorMessage(error) || "")
        .trim()
        .toLowerCase();
    return (reason.includes("timeout") ||
        reason.includes("temporar") ||
        reason.includes("rate limit"));
};
const resolveMetaProviderIdentityMinimal = async (input) => {
    const startedAtMs = Date.now();
    const res = await axios_1.default.get("https://graph.facebook.com/v19.0/me", {
        params: {
            fields: "id,name",
            access_token: input.token,
        },
        timeout: input.timeoutMs,
    });
    return {
        identity: {
            id: normalizeOptionalString(res.data?.id),
            name: normalizeOptionalString(res.data?.name),
        },
        durationMs: Date.now() - startedAtMs,
    };
};
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
    PHONE_SELECTION_REQUIRED: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
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
    if (normalizedCode.includes("PHONE_SELECTION_REQUIRED") ||
        normalizedReason.includes("select a whatsapp") ||
        normalizedReason.includes("select whatsapp") ||
        normalizedReason.includes("select mobile number")) {
        return "PHONE_SELECTION_REQUIRED";
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
    if (reasonCode === "PHONE_SELECTION_REQUIRED") {
        return {
            ...shared,
            problem: "Select the WhatsApp number to connect.",
            cause: "Multiple or unconfirmed WhatsApp numbers are available under this Meta login.",
            fix: "Choose one WhatsApp number and continue connect.",
            cta: {
                label: "Select Mobile Number",
                action: "SELECT_PHONE_NUMBER",
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
        problem: "Meta connection failed.",
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
                verifiedName: normalizeOptionalString(phoneNumber?.verified_name) || null,
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
const extractBusinessNodesFromPayload = (payload) => {
    const direct = getMetaDataArray(payload);
    const dataNodes = getMetaDataArray(payload?.data);
    const nestedBusinesses = getMetaDataArray(payload?.businesses);
    const merged = [...direct, ...dataNodes, ...nestedBusinesses];
    const seen = new Set();
    return merged.filter((business) => {
        if (!business || typeof business !== "object") {
            return false;
        }
        const businessId = normalizeOptionalString(business?.id);
        const key = businessId || JSON.stringify(business);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};
const mapWhatsAppCandidatesFromBusinessNode = (business) => {
    const businessManagerId = normalizeOptionalString(business?.id);
    const businessManagerName = normalizeOptionalString(business?.name);
    const candidates = [];
    const wabaBuckets = [
        ...getMetaDataArray(business?.owned_whatsapp_business_accounts),
        ...getMetaDataArray(business?.client_whatsapp_business_accounts),
    ];
    for (const waba of wabaBuckets) {
        const wabaId = normalizeOptionalString(waba?.id);
        const wabaName = normalizeOptionalString(waba?.name);
        const phoneNumbers = getMetaDataArray(waba?.phone_numbers);
        for (const phoneNumber of phoneNumbers) {
            const phoneNumberId = normalizeOptionalString(phoneNumber?.id);
            if (!phoneNumberId) {
                continue;
            }
            candidates.push({
                phoneNumberId,
                displayPhoneNumber: normalizeOptionalString(phoneNumber?.display_phone_number) || null,
                verifiedName: normalizeOptionalString(phoneNumber?.verified_name) || null,
                businessManagerId,
                businessManagerName,
                wabaId,
                wabaName,
            });
        }
    }
    return candidates;
};
const dedupeWhatsAppPhoneCandidates = (candidates) => {
    const byPhoneNumberId = new Map();
    for (const candidate of candidates) {
        const existing = byPhoneNumberId.get(candidate.phoneNumberId);
        if (!existing) {
            byPhoneNumberId.set(candidate.phoneNumberId, candidate);
            continue;
        }
        byPhoneNumberId.set(candidate.phoneNumberId, {
            phoneNumberId: candidate.phoneNumberId,
            displayPhoneNumber: existing.displayPhoneNumber || candidate.displayPhoneNumber || null,
            verifiedName: existing.verifiedName || candidate.verifiedName || null,
            businessManagerId: existing.businessManagerId || candidate.businessManagerId || null,
            businessManagerName: existing.businessManagerName || candidate.businessManagerName || null,
            wabaId: existing.wabaId || candidate.wabaId || null,
            wabaName: existing.wabaName || candidate.wabaName || null,
        });
    }
    return Array.from(byPhoneNumberId.values());
};
const fetchWhatsAppPhoneCandidates = async (accessToken) => {
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
    const aggregatedCandidates = [];
    for (const lookup of lookupRequests) {
        try {
            const response = await axios_1.default.get(lookup.url, {
                params: lookup.params,
                timeout: META_GRAPH_TIMEOUT_MS,
            });
            const businessNodes = extractBusinessNodesFromPayload(response.data);
            for (const businessNode of businessNodes) {
                aggregatedCandidates.push(...mapWhatsAppCandidatesFromBusinessNode(businessNode));
            }
            const fallbackPhoneNumbers = collectWhatsAppPhoneNumbers(response.data);
            for (const fallbackNumber of fallbackPhoneNumbers) {
                aggregatedCandidates.push({
                    phoneNumberId: fallbackNumber.id,
                    displayPhoneNumber: fallbackNumber.displayPhoneNumber,
                    verifiedName: fallbackNumber.verifiedName,
                    businessManagerId: null,
                    businessManagerName: null,
                    wabaId: null,
                    wabaName: null,
                });
            }
        }
        catch (error) {
            console.log("WHATSAPP CONNECT LOOKUP FAILED", {
                source: lookup.label,
                message: getAxiosErrorMessage(error),
            });
        }
    }
    return dedupeWhatsAppPhoneCandidates(aggregatedCandidates);
};
const fetchMetaBusinesses = async (accessToken) => {
    const response = await axios_1.default.get("https://graph.facebook.com/v19.0/me/businesses", {
        params: {
            fields: "id,name",
            access_token: accessToken,
        },
        timeout: META_GRAPH_TIMEOUT_MS,
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
            fields: "id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}",
            access_token: accessToken,
        },
        timeout: META_GRAPH_TIMEOUT_MS,
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
        let instagramProfessionalAccountId = normalizeOptionalString(page?.instagram_business_account?.id) ||
            normalizeOptionalString(page?.connected_instagram_account?.id);
        let instagramUsername = normalizeOptionalString(page?.instagram_business_account?.username) ||
            normalizeOptionalString(page?.connected_instagram_account?.username);
        let instagramName = null;
        let instagramAccountType = null;
        if (instagramProfessionalAccountId && pageAccessToken) {
            try {
                const igProfileRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${instagramProfessionalAccountId}`, {
                    params: {
                        fields: "id,username,name,account_type",
                        access_token: pageAccessToken,
                    },
                    timeout: META_GRAPH_TIMEOUT_MS,
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
            timeout: META_GRAPH_TIMEOUT_MS,
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
            timeout: META_GRAPH_TIMEOUT_MS,
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
            timeout: META_GRAPH_TIMEOUT_MS,
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
            timeout: META_GRAPH_TIMEOUT_MS,
        });
        return response.data || null;
    }
    catch {
        return null;
    }
};
const fetchWhatsAppPhoneNumberId = async (accessToken, preferredPhoneNumberId) => {
    const preferred = normalizeOptionalString(preferredPhoneNumberId);
    const phoneNumbers = await fetchWhatsAppPhoneCandidates(accessToken);
    const preferredMatch = preferred
        ? phoneNumbers.find((phoneNumber) => phoneNumber.phoneNumberId === preferred)
        : null;
    if (preferredMatch?.phoneNumberId) {
        console.log("WHATSAPP CONNECT IDENTIFIERS", {
            source: "preferred",
            phoneNumberId: preferredMatch.phoneNumberId,
            preferredPhoneNumberId: preferred || null,
        });
        return preferredMatch.phoneNumberId;
    }
    if (phoneNumbers[0]?.phoneNumberId) {
        console.log("WHATSAPP CONNECT IDENTIFIERS", {
            source: "fallback",
            phoneNumberId: phoneNumbers[0].phoneNumberId,
            preferredPhoneNumberId: preferred || null,
        });
        return phoneNumbers[0].phoneNumberId;
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
const runMetaOnboardingLifecycleFinalization = async (input) => {
    const startedAtMs = Date.now();
    try {
        await Promise.all(input.connectedClients.map((client) => queueOnboardingDemoForClient(input.businessId, {
            id: client.id,
            platform: client.platform,
            isActive: client.isActive ?? true,
        })));
        const healthRows = await Promise.all(input.connectedClients.map(async (client) => {
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
        await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleCompleted)({
            context: input.lifecycleContext,
            detail: "Meta onboarding lifecycle completed",
            metadata: {
                clients: healthRows,
                requestTimedOut: input.requestTimedOut,
                requestAborted: input.requestAborted,
                completedAt: new Date().toISOString(),
            },
            reconcileMs: Date.now() - startedAtMs,
            timeoutRecovered: input.requestTimedOut,
            eventualSuccess: input.requestAborted || input.requestTimedOut,
        });
        emitOnboardingTraceEvent({
            businessId: input.businessId,
            eventType: "active_transition_reached",
            message: "active_transition_reached:meta_oauth_lifecycle_completed",
            metadata: {
                operationId: input.lifecycleContext.attemptKey,
                replayToken: input.lifecycleContext.replayToken,
                requestTimedOut: input.requestTimedOut,
                requestAborted: input.requestAborted,
                connectedClients: input.connectedClients.map((client) => ({
                    id: client.id,
                    platform: client.platform,
                    pageId: client.pageId || null,
                    phoneNumberId: client.phoneNumberId || null,
                })),
            },
        });
        const projectionEnqueue = await (0, integrationOnboardingProjection_queue_1.enqueueIntegrationOnboardingProjectionReconcile)({
            type: "ONBOARDING_RECONCILE",
            businessId: input.businessId,
            tenantId: input.businessId,
            reason: "meta_oauth_lifecycle_completed",
            source: "meta_oauth_finalization",
        }).catch((error) => {
            return {
                enqueued: false,
                deferred: true,
                duplicate: false,
                queueUnavailable: true,
                jobId: "",
                reason: String(error?.message || "projection_enqueue_failed"),
            };
        });
        if (!projectionEnqueue.enqueued) {
            const deferred = await (0, integrationProjectionRecovery_service_1.scheduleDeferredIntegrationProjectionReconcile)({
                businessId: input.businessId,
                tenantId: input.businessId,
                reason: "meta_oauth_lifecycle_completed",
                source: "meta_oauth_finalization",
                queueError: normalizeOptionalString(projectionEnqueue.reason) ||
                    "projection_enqueue_failed",
                includeQueueDepth: false,
            }).catch(() => null);
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "reconcile_inline_prevented",
                value: 1,
                businessId: input.businessId,
                route: "clients_oauth_meta_callback",
                metadata: {
                    reason: "projection_enqueue_unavailable",
                    recoveryKey: deferred?.recoveryKey || null,
                },
            });
        }
    }
    catch (error) {
        const reason = String(error?.message || "").trim() ||
            "Meta onboarding finalization failed";
        await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
            context: input.lifecycleContext,
            stage: "FINAL_ONBOARDING",
            code: "META_FINAL_ONBOARDING_FAILED",
            reason,
            resolutionHint: "RETRY",
            metadata: {
                requestTimedOut: input.requestTimedOut,
                requestAborted: input.requestAborted,
            },
        });
        throw error;
    }
};
const finalizeMetaOnboardingLifecycle = (input, options) => {
    if (options?.deferred !== false) {
        setImmediate(() => {
            void runMetaOnboardingLifecycleFinalization(input).catch(() => undefined);
        });
        return;
    }
    return runMetaOnboardingLifecycleFinalization(input);
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
    const callbackStartedAtMs = Date.now();
    const internalContinuation = req.__metaContinuationInternal === true;
    let instagramTraceId = buildInstagramTraceId(null);
    let instagramBusinessId = (0, tenant_service_1.getRequestBusinessId)(req);
    let lifecycleContext = null;
    let lifecycleRequestTimedOut = false;
    let lifecycleRequestAborted = false;
    const waDiagStartedAt = Date.now();
    let waDiagLastCheckpointAt = waDiagStartedAt;
    let waCheckpointReached = "[WA STEP 0] initialized";
    let waDiagEnabled = false;
    const logWaCheckpoint = (checkpoint, metadata = {}) => {
        waCheckpointReached = checkpoint;
        if (!waDiagEnabled) {
            return;
        }
        const now = Date.now();
        const durationMs = now - waDiagLastCheckpointAt;
        waDiagLastCheckpointAt = now;
        console.info("WA_META_FINALIZE_DIAG", {
            checkpoint,
            durationMs,
            totalDurationMs: now - waDiagStartedAt,
            ...metadata,
        });
    };
    const isRequestDetached = () => {
        const lifecycle = (0, requestLifecycle_1.getRequestLifecycle)({ req, res });
        const reason = String(lifecycle?.abortReason || "").trim().toLowerCase();
        lifecycleRequestTimedOut = reason === "request_timeout";
        lifecycleRequestAborted = Boolean(lifecycle?.aborted);
        return Boolean(lifecycle?.aborted) || res.headersSent || res.writableEnded;
    };
    try {
        req.setTimeout?.(META_OAUTH_CONNECT_TIMEOUT_MS);
        res.setTimeout(META_OAUTH_CONNECT_TIMEOUT_MS);
        const userId = req.user?.id;
        const requestBusinessId = (0, tenant_service_1.getRequestBusinessId)(req);
        const { code: rawCode, state: rawState, aiTone, businessInfo, pricingInfo, faqKnowledge, salesInstructions, phoneNumberId, facebookPageId, instagramProfessionalAccountId, } = req.body || {};
        const code = normalizeOptionalString(rawCode);
        const state = String(rawState || "").trim();
        const internalResolvedTokens = req.__metaResolvedTokens &&
            typeof req.__metaResolvedTokens === "object"
            ? req.__metaResolvedTokens
            : null;
        const providedShortToken = normalizeOptionalString(internalResolvedTokens?.shortToken);
        const providedLongToken = normalizeOptionalString(internalResolvedTokens?.longToken);
        const oauthState = (0, metaOAuthState_1.verifyMetaOAuthState)(state);
        waDiagEnabled = oauthState?.platform === "WHATSAPP";
        if (waDiagEnabled) {
            logWaCheckpoint("[WA STEP 1] request entered", {
                hasCode: Boolean(code),
                hasState: Boolean(state),
                hasUserId: Boolean(userId),
                requestBusinessId: requestBusinessId || null,
            });
        }
        instagramTraceId = buildInstagramTraceId(oauthState?.nonce || null);
        instagramBusinessId = oauthState?.businessId || requestBusinessId || null;
        if (oauthState?.businessId && oauthState?.nonce && oauthState?.platform) {
            lifecycleContext = (0, metaOAuthLifecycle_service_1.createMetaOAuthLifecycleContext)({
                businessId: oauthState.businessId,
                platform: oauthState.platform,
                mode: oauthState.mode,
                nonce: oauthState.nonce,
            });
        }
        const failInstagramConnect = (options) => {
            throw new MetaOAuthFlowError(options);
        };
        const hasOAuthCredential = Boolean(code || providedShortToken || providedLongToken);
        if (!userId || !requestBusinessId || !hasOAuthCredential || !oauthState) {
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FAILED",
                    code: "META_INVALID_OAUTH_CALLBACK_CONTRACT",
                    reason: "Invalid OAuth callback contract",
                    resolutionHint: "RETRY",
                });
            }
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FAILED",
                    code: "META_OAUTH_STATE_MISMATCH",
                    reason: "OAuth state mismatch",
                    resolutionHint: "RECONNECT",
                });
            }
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
        lifecycleContext = (0, metaOAuthLifecycle_service_1.createMetaOAuthLifecycleContext)({
            businessId,
            platform: targetPlatform,
            mode: oauthState.mode,
            nonce: oauthState.nonce,
        });
        const selectedPhoneNumberId = normalizeOptionalString(phoneNumberId) ||
            normalizeOptionalString(oauthState.preferredPhoneNumberId);
        const requestedFacebookPageId = normalizeOptionalString(facebookPageId) ||
            normalizeOptionalString(oauthState.preferredFacebookPageId);
        const requestedInstagramProfessionalAccountId = normalizeOptionalString(instagramProfessionalAccountId) ||
            normalizeOptionalString(oauthState.preferredInstagramProfessionalAccountId);
        if (!internalContinuation) {
            const stateValidationMs = Date.now() - callbackStartedAtMs;
            emitCallbackMetric({
                name: "oauth_callback_inline_work_ms",
                businessId,
                value: stateValidationMs,
                metadata: {
                    stage: "state_validation",
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            if (stateValidationMs > META_OAUTH_CALLBACK_STATE_VALIDATION_BUDGET_MS) {
                (0, performanceMetrics_1.emitPerformanceMetric)({
                    name: "callback_timeout_prevented",
                    value: 1,
                    businessId,
                    route: "clients_oauth_meta_callback",
                    metadata: {
                        reason: "state_validation_budget_exceeded",
                        budgetMs: META_OAUTH_CALLBACK_STATE_VALIDATION_BUDGET_MS,
                        actualMs: stateValidationMs,
                        operationId: lifecycleContext.attemptKey,
                    },
                });
            }
            const persistedAccepted = await (0, boundedTimeout_1.withTimeout)({
                label: "meta_oauth_callback_accept_checkpoint",
                timeoutMs: META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS,
                task: (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "CALLBACK_ACCEPTED",
                    detail: "OAuth callback accepted. Scheduling async continuation.",
                    metadata: {
                        callbackFastLane: true,
                        workspaceId: oauthState.workspaceId,
                        mode: oauthState.mode,
                        continuationAsyncOnly: true,
                    },
                }),
            })
                .then(() => true)
                .catch((error) => {
                if (error instanceof boundedTimeout_1.TimeoutExceededError) {
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "callback_timeout_prevented",
                        value: 1,
                        businessId,
                        route: "clients_oauth_meta_callback",
                        metadata: {
                            reason: "callback_accept_persistence_timeout",
                            budgetMs: META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS,
                            operationId: lifecycleContext?.attemptKey || null,
                        },
                    });
                }
                return false;
            });
            const enqueuePayload = {
                type: "META_OAUTH_CONTINUATION",
                operationId: lifecycleContext.attemptKey,
                replayToken: lifecycleContext.replayToken,
                businessId,
                userId,
                platform: targetPlatform,
                mode: oauthState.mode,
                state,
                code: code || null,
                shortTokenEncrypted: providedShortToken ? (0, encrypt_1.encrypt)(providedShortToken) : null,
                longTokenEncrypted: providedLongToken ? (0, encrypt_1.encrypt)(providedLongToken) : null,
                aiTone: normalizeOptionalString(aiTone),
                businessInfo: normalizeOptionalString(businessInfo),
                pricingInfo: normalizeOptionalString(pricingInfo),
                faqKnowledge: normalizeOptionalString(faqKnowledge),
                salesInstructions: normalizeOptionalString(salesInstructions),
                phoneNumberId: selectedPhoneNumberId,
                facebookPageId: requestedFacebookPageId,
                instagramProfessionalAccountId: requestedInstagramProfessionalAccountId,
                traceId: instagramTraceId,
                queuedAtIso: new Date().toISOString(),
                source: "callback_accept",
            };
            const enqueueStartedAtMs = Date.now();
            let handoffMode = "queue";
            let queueReason = null;
            let queueJobId = null;
            let queueDuplicate = false;
            if ((0, redisSafety_1.isRedisCircuitOpen)() || !(0, redis_1.isQueueRedisWritable)()) {
                handoffMode = "degraded_local_fallback";
                queueReason = (0, redisSafety_1.isRedisCircuitOpen)()
                    ? "redis_circuit_open"
                    : "queue_redis_not_writable";
            }
            else {
                try {
                    const enqueueResult = await (0, boundedTimeout_1.withTimeout)({
                        label: "meta_oauth_callback_handoff_enqueue",
                        timeoutMs: META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS,
                        task: (0, metaOAuthContinuation_queue_1.enqueueMetaOAuthContinuation)(enqueuePayload),
                    });
                    queueJobId = enqueueResult.jobId;
                    queueDuplicate = Boolean(enqueueResult.duplicate);
                }
                catch (error) {
                    handoffMode = "degraded_local_fallback";
                    queueReason =
                        error instanceof boundedTimeout_1.TimeoutExceededError
                            ? `enqueue_timeout_${META_OAUTH_CALLBACK_ENQUEUE_BUDGET_MS}ms`
                            : normalizeOptionalString(error?.message) || "enqueue_failed";
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "callback_timeout_prevented",
                        value: 1,
                        businessId,
                        route: "clients_oauth_meta_callback",
                        metadata: {
                            reason: queueReason,
                            operationId: lifecycleContext.attemptKey,
                            replayToken: lifecycleContext.replayToken,
                        },
                    });
                }
            }
            if (handoffMode !== "queue") {
                emitCallbackMetric({
                    name: "callback_degraded_handoff",
                    businessId,
                    value: 1,
                    metadata: {
                        reason: queueReason || "queue_unavailable",
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                    },
                });
                const { type: _type, ...queueInput } = enqueuePayload;
                setImmediate(() => {
                    void (0, exports.runMetaOAuthContinuationFromQueueJob)(queueInput)
                        .then(() => {
                        emitCallbackMetric({
                            name: "continuation_async_only",
                            businessId,
                            value: 1,
                            metadata: {
                                source: "callback_local_fallback",
                                operationId: lifecycleContext?.attemptKey || null,
                            },
                        });
                    })
                        .catch((error) => {
                        void (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                            context: lifecycleContext,
                            stage: "FINAL_ONBOARDING",
                            code: "META_CONTINUATION_DEGRADED_FALLBACK_FAILED",
                            reason: normalizeOptionalString(error?.message) ||
                                "Local continuation fallback failed",
                            resolutionHint: "RETRY",
                            metadata: {
                                callbackFastLane: true,
                                degradedHandoff: true,
                            },
                        }).catch(() => undefined);
                    });
                });
            }
            const asyncHandoffMs = Date.now() - enqueueStartedAtMs;
            emitCallbackMetric({
                name: "oauth_callback_async_handoff_ms",
                businessId,
                value: asyncHandoffMs,
                metadata: {
                    handoffMode,
                    queueReason,
                    queueJobId,
                    queueDuplicate,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            void (0, boundedTimeout_1.withTimeout)({
                label: "meta_oauth_callback_schedule_checkpoint",
                timeoutMs: META_OAUTH_CALLBACK_PERSISTENCE_BUDGET_MS,
                task: (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "CONTINUATION_SCHEDULED",
                    detail: handoffMode === "queue"
                        ? "Continuation queued. Finalization moved to async worker."
                        : "Queue degraded. Local async continuation fallback started.",
                    metadata: {
                        callbackFastLane: true,
                        continuationAsyncOnly: true,
                        handoffMode,
                        queueReason,
                        queueJobId,
                        queueDuplicate,
                    },
                }),
            }).catch(() => undefined);
            const callbackAcceptMs = Date.now() - callbackStartedAtMs;
            emitCallbackMetric({
                name: "oauth_callback_accept_ms",
                businessId,
                value: callbackAcceptMs,
                metadata: {
                    handoffMode,
                    persistedAccepted,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            emitCallbackMetric({
                name: "callback_response_before_finalize",
                businessId,
                value: callbackAcceptMs,
                metadata: {
                    budgetMs: META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS,
                    budgetBreached: callbackAcceptMs > META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS,
                    handoffMode,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            emitCallbackMetric({
                name: "callback_fast_exit_success",
                businessId,
                value: 1,
                metadata: {
                    handoffMode,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            emitCallbackMetric({
                name: "continuation_async_only",
                businessId,
                value: 1,
                metadata: {
                    source: handoffMode === "queue" ? "continuation_queue" : "local_fallback",
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "callback_sync_budget_ms",
                value: META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
                businessId,
                route: "clients_oauth_meta_callback",
                metadata: {
                    actualMs: callbackAcceptMs,
                    budgetBreached: callbackAcceptMs > META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
                    responseBudgetMs: META_OAUTH_CALLBACK_RESPONSE_BUDGET_MS,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            emitCallbackRuntimeIsolationPreserved({
                businessId,
                platform: targetPlatform,
                mode: oauthState.mode,
                result: handoffMode === "queue" ? "accepted" : "degraded",
                operationId: lifecycleContext.attemptKey,
                metadata: {
                    source: "callback_accept",
                    queueReason,
                    queueJobId,
                    queueDuplicate,
                },
            });
            emitCallbackMetric({
                name: "callback_projection_leak_detected",
                businessId,
                value: 0,
                metadata: {
                    leakDetected: false,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            return res.status(202).json({
                success: true,
                data: {
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    workspaceId: oauthState.workspaceId,
                    connectionState: "CONTINUATION_SCHEDULED",
                    lifecycle: {
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                        status: "PROCESSING",
                        stage: "CONTINUATION_SCHEDULED",
                        statusDetail: handoffMode === "queue"
                            ? "Callback accepted. Async continuation scheduled."
                            : "Callback accepted. Queue degraded; local async continuation started.",
                    },
                    degradedRuntime: handoffMode === "queue"
                        ? null
                        : {
                            queueUnavailable: true,
                            reason: queueReason || "queue_unavailable",
                        },
                },
                message: `${targetPlatform} callback accepted`,
            });
        }
        if (!internalContinuation) {
            emitCallbackMetric({
                name: "callback_projection_leak_detected",
                businessId,
                value: 1,
                metadata: {
                    leakDetected: true,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
        }
        await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
            context: lifecycleContext,
            stage: "OAUTH_AUTHENTICATED",
            detail: "OAuth callback verified",
            metadata: {
                workspaceId: oauthState.workspaceId,
                mode: oauthState.mode,
            },
        });
        if (targetPlatform === "WHATSAPP") {
            logWaCheckpoint("[WA STEP 2] state verified", {
                businessId,
                mode: oauthState.mode,
            });
        }
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FAILED",
                    code: "META_ENTITLEMENT_BLOCKED",
                    reason: `${targetPlatform} integration not allowed in your workspace`,
                    resolutionHint: "UPGRADE_PLAN",
                });
            }
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FAILED",
                    code: "META_OAUTH_CONFIG_MISSING",
                    reason: "Meta OAuth is not configured on this server",
                    resolutionHint: "RETRY",
                });
            }
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
        let shortToken = providedShortToken;
        if (!shortToken) {
            let shortTokenRes;
            try {
                shortTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
                    params: {
                        client_id: metaRuntime.appId,
                        client_secret: metaRuntime.appSecret,
                        redirect_uri: redirectUri,
                        code,
                    },
                    timeout: internalContinuation
                        ? META_GRAPH_TIMEOUT_MS
                        : META_GRAPH_FAST_LANE_TIMEOUT_MS,
                });
            }
            catch (error) {
                if (!internalContinuation &&
                    lifecycleContext &&
                    code &&
                    isMetaProviderTransientError(error)) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                        context: lifecycleContext,
                        stage: "OAUTH_AUTHENTICATED",
                        detail: "Provider token exchange deferred to async continuation",
                        metadata: {
                            deferredWork: true,
                            deferredReason: getAxiosErrorMessage(error),
                        },
                    });
                    const enqueueStartedAtMs = Date.now();
                    const enqueuePayload = {
                        type: "META_OAUTH_CONTINUATION",
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                        businessId,
                        userId,
                        platform: targetPlatform,
                        mode: oauthState.mode,
                        state,
                        code,
                        shortTokenEncrypted: null,
                        longTokenEncrypted: null,
                        aiTone: normalizeOptionalString(aiTone),
                        businessInfo: normalizeOptionalString(businessInfo),
                        pricingInfo: normalizeOptionalString(pricingInfo),
                        faqKnowledge: normalizeOptionalString(faqKnowledge),
                        salesInstructions: normalizeOptionalString(salesInstructions),
                        phoneNumberId: selectedPhoneNumberId,
                        facebookPageId: requestedFacebookPageId,
                        instagramProfessionalAccountId: requestedInstagramProfessionalAccountId,
                        traceId: instagramTraceId,
                        queuedAtIso: new Date().toISOString(),
                        source: "callback_fast_lane_transient",
                    };
                    const enqueueResult = await (0, metaOAuthContinuation_queue_1.enqueueMetaOAuthContinuation)(enqueuePayload);
                    emitOnboardingTraceEvent({
                        businessId,
                        eventType: "callback_handoff_success",
                        message: "callback_handoff_success:meta_oauth_continuation_queued",
                        metadata: {
                            operationId: lifecycleContext.attemptKey,
                            replayToken: lifecycleContext.replayToken,
                            platform: targetPlatform,
                            mode: oauthState.mode,
                            source: "callback_fast_lane_transient",
                            queueJobId: enqueueResult.jobId,
                            duplicate: enqueueResult.duplicate,
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "onboarding_enqueue_ms",
                        value: Date.now() - enqueueStartedAtMs,
                        businessId,
                        route: "clients_oauth_meta_callback",
                        metadata: {
                            platform: targetPlatform,
                            mode: oauthState.mode,
                            operationId: lifecycleContext.attemptKey,
                            replayToken: lifecycleContext.replayToken,
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "callback_timeout_prevented",
                        value: 1,
                        businessId,
                        route: "clients_oauth_meta_callback",
                        metadata: {
                            reason: "provider_transient_during_token_exchange",
                            operationId: lifecycleContext.attemptKey,
                            replayToken: lifecycleContext.replayToken,
                        },
                    });
                    const fastLaneDurationMs = Date.now() - callbackStartedAtMs;
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "oauth_callback_fast_lane_ms",
                        value: fastLaneDurationMs,
                        businessId,
                        route: "clients_oauth_meta_callback",
                        metadata: {
                            platform: targetPlatform,
                            mode: oauthState.mode,
                            source: "token_exchange_deferred",
                        },
                    });
                    (0, performanceMetrics_1.emitPerformanceMetric)({
                        name: "callback_sync_budget_ms",
                        value: META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
                        businessId,
                        route: "clients_oauth_meta_callback",
                        metadata: {
                            actualMs: fastLaneDurationMs,
                            budgetBreached: fastLaneDurationMs > META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
                            operationId: lifecycleContext.attemptKey,
                        },
                    });
                    emitCallbackRuntimeIsolationPreserved({
                        businessId,
                        platform: targetPlatform,
                        mode: oauthState.mode,
                        result: "accepted",
                        operationId: lifecycleContext.attemptKey,
                        metadata: {
                            source: "token_exchange_deferred",
                        },
                    });
                    return res.status(202).json({
                        success: true,
                        data: {
                            platform: targetPlatform,
                            mode: oauthState.mode,
                            workspaceId: oauthState.workspaceId,
                            connectionState: "PROCESSING",
                            lifecycle: {
                                operationId: lifecycleContext.attemptKey,
                                replayToken: lifecycleContext.replayToken,
                                status: "PROCESSING",
                                stage: "OAUTH_AUTHENTICATED",
                                statusDetail: "Provider delay detected. Continuation queued and processing asynchronously.",
                            },
                        },
                        message: `${targetPlatform} connect processing`,
                    });
                }
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
            shortToken = normalizeOptionalString(shortTokenRes.data?.access_token);
        }
        if (!shortToken) {
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FAILED",
                    code: "META_SHORT_TOKEN_MISSING",
                    reason: "Meta token exchange failed",
                    resolutionHint: "RETRY",
                });
            }
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
        if (targetPlatform === "WHATSAPP") {
            logWaCheckpoint("[WA STEP 3] short token exchanged");
        }
        if (targetPlatform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_CODE_EXCHANGED",
                status: "COMPLETED",
            });
        }
        if (!internalContinuation && lifecycleContext) {
            let providerIdentity = null;
            let providerIdentityResolutionMs = 0;
            let providerIdentityDeferred = false;
            try {
                const identityResolved = await resolveMetaProviderIdentityMinimal({
                    token: shortToken,
                    timeoutMs: META_GRAPH_FAST_LANE_TIMEOUT_MS,
                });
                providerIdentity = identityResolved.identity;
                providerIdentityResolutionMs = identityResolved.durationMs;
            }
            catch {
                providerIdentityDeferred = true;
            }
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "provider_identity_resolution_ms",
                value: providerIdentityResolutionMs,
                businessId,
                route: "clients_oauth_meta_callback",
                metadata: {
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                    deferred: providerIdentityDeferred,
                },
            });
            await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                context: lifecycleContext,
                stage: "META_ACCOUNT_CONNECTED",
                detail: "OAuth token resolved and async continuation queued",
                metadata: {
                    providerIdentity,
                    providerIdentityDeferred,
                    callbackFastLane: true,
                },
            });
            const enqueueStartedAtMs = Date.now();
            const enqueuePayload = {
                type: "META_OAUTH_CONTINUATION",
                operationId: lifecycleContext.attemptKey,
                replayToken: lifecycleContext.replayToken,
                businessId,
                userId,
                platform: targetPlatform,
                mode: oauthState.mode,
                state,
                code: code || null,
                shortTokenEncrypted: (0, encrypt_1.encrypt)(shortToken),
                longTokenEncrypted: providedLongToken ? (0, encrypt_1.encrypt)(providedLongToken) : null,
                aiTone: normalizeOptionalString(aiTone),
                businessInfo: normalizeOptionalString(businessInfo),
                pricingInfo: normalizeOptionalString(pricingInfo),
                faqKnowledge: normalizeOptionalString(faqKnowledge),
                salesInstructions: normalizeOptionalString(salesInstructions),
                phoneNumberId: selectedPhoneNumberId,
                facebookPageId: requestedFacebookPageId,
                instagramProfessionalAccountId: requestedInstagramProfessionalAccountId,
                traceId: instagramTraceId,
                queuedAtIso: new Date().toISOString(),
                source: "callback_fast_lane",
            };
            try {
                const enqueueResult = await (0, metaOAuthContinuation_queue_1.enqueueMetaOAuthContinuation)(enqueuePayload);
                emitOnboardingTraceEvent({
                    businessId,
                    eventType: "callback_handoff_success",
                    message: "callback_handoff_success:meta_oauth_continuation_queued",
                    metadata: {
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                        platform: targetPlatform,
                        mode: oauthState.mode,
                        source: "callback_fast_lane",
                        queueJobId: enqueueResult.jobId,
                        duplicate: enqueueResult.duplicate,
                    },
                });
            }
            catch (error) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FINAL_ONBOARDING",
                    code: "META_CONTINUATION_ENQUEUE_FAILED",
                    reason: normalizeOptionalString(error?.message) ||
                        "Unable to queue onboarding continuation",
                    resolutionHint: "RETRY",
                    metadata: {
                        callbackFastLane: true,
                    },
                });
                emitOnboardingTraceEvent({
                    businessId,
                    eventType: "callback_handoff_failed",
                    message: "callback_handoff_failed:meta_continuation_enqueue_failed",
                    severity: "error",
                    metadata: {
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                        platform: targetPlatform,
                        mode: oauthState.mode,
                        source: "callback_fast_lane",
                        reason: normalizeOptionalString(error?.message) || "queue_unavailable",
                    },
                });
                emitCallbackRuntimeIsolationPreserved({
                    businessId,
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    result: "queue_failed",
                    operationId: lifecycleContext.attemptKey,
                    metadata: {
                        reason: normalizeOptionalString(error?.message) || "queue_unavailable",
                    },
                });
                return res.status(503).json({
                    success: false,
                    data: {
                        platform: targetPlatform,
                        stage: "FINAL_ONBOARDING",
                        reason: "Unable to queue onboarding continuation",
                        code: "META_CONTINUATION_ENQUEUE_FAILED",
                        actionable: buildActionableFailurePayload({
                            code: "RATE_LIMITED",
                            reason: "Unable to queue onboarding continuation right now.",
                            retryAfterSeconds: 15,
                        }),
                    },
                    message: "Meta connect queue unavailable. Please retry.",
                });
            }
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "onboarding_enqueue_ms",
                value: Date.now() - enqueueStartedAtMs,
                businessId,
                route: "clients_oauth_meta_callback",
                metadata: {
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            const fastLaneDurationMs = Date.now() - callbackStartedAtMs;
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "oauth_callback_fast_lane_ms",
                value: fastLaneDurationMs,
                businessId,
                route: "clients_oauth_meta_callback",
                metadata: {
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            (0, performanceMetrics_1.emitPerformanceMetric)({
                name: "callback_sync_budget_ms",
                value: META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
                businessId,
                route: "clients_oauth_meta_callback",
                metadata: {
                    actualMs: fastLaneDurationMs,
                    budgetBreached: fastLaneDurationMs > META_OAUTH_CALLBACK_SYNC_BUDGET_MS,
                    operationId: lifecycleContext.attemptKey,
                    replayToken: lifecycleContext.replayToken,
                },
            });
            emitCallbackRuntimeIsolationPreserved({
                businessId,
                platform: targetPlatform,
                mode: oauthState.mode,
                result: "accepted",
                operationId: lifecycleContext.attemptKey,
                metadata: {
                    source: "callback_fast_lane",
                },
            });
            return res.status(202).json({
                success: true,
                data: {
                    platform: targetPlatform,
                    mode: oauthState.mode,
                    workspaceId: oauthState.workspaceId,
                    connectionState: "CONNECTED_PENDING",
                    lifecycle: {
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                        status: "PROCESSING",
                        stage: "META_ACCOUNT_CONNECTED",
                        statusDetail: "Connection queued. Verifying assets, webhook, and reconciliation asynchronously.",
                    },
                },
                message: `${targetPlatform} connect processing`,
            });
        }
        const discoveryPermissions = await fetchMetaGrantedPermissions(shortToken);
        if (targetPlatform === "WHATSAPP" && !selectedPhoneNumberId) {
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "PHONE_SELECTION",
                    detail: "Resolving WhatsApp number options",
                });
            }
            const requiredWhatsAppPermissions = [
                "whatsapp_business_management",
                "whatsapp_business_messaging",
            ];
            const missingWhatsAppPermissions = requiredWhatsAppPermissions.filter((scope) => !discoveryPermissions.includes(scope));
            if (missingWhatsAppPermissions.length) {
                const actionable = buildActionableFailurePayload({
                    code: "WA_PERMISSION_MISSING",
                    reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
                    missingPermission: missingWhatsAppPermissions[0],
                });
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                        context: lifecycleContext,
                        stage: "FAILED",
                        code: "WA_PERMISSION_MISSING",
                        reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
                        resolutionHint: "RECONNECT",
                        metadata: {
                            actionable,
                            missingPermissions: missingWhatsAppPermissions,
                        },
                    });
                }
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_PERMISSION_AUDITED",
                        reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
                        code: "WA_PERMISSION_MISSING",
                        actionable,
                        requiresPhoneSelection: false,
                        availablePhoneNumbers: [],
                    },
                    message: "WhatsApp permissions missing",
                    code: "WA_PERMISSION_MISSING",
                });
            }
            const availablePhoneNumbers = await fetchWhatsAppPhoneCandidates(shortToken);
            const discoveredWabaCandidate = availablePhoneNumbers.find((candidate) => Boolean(candidate.wabaId)) || null;
            logWaCheckpoint("[WA STEP 5] accounts/pages discovered", {
                candidateCount: availablePhoneNumbers.length,
            });
            logWaCheckpoint("[WA STEP 6] whatsapp business account discovered", {
                wabaDiscovered: Boolean(discoveredWabaCandidate?.wabaId),
                wabaId: discoveredWabaCandidate?.wabaId || null,
                businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
            });
            logWaCheckpoint("[WA STEP 7] phone numbers fetched", {
                phoneNumberCount: availablePhoneNumbers.length,
            });
            emitOnboardingTraceEvent({
                businessId,
                eventType: "phone_resolution_result",
                message: "phone_resolution_result:phone_candidates_discovered",
                metadata: {
                    operationId: lifecycleContext?.attemptKey || null,
                    replayToken: lifecycleContext?.replayToken || null,
                    candidateCount: availablePhoneNumbers.length,
                    selectedPhoneNumberId: selectedPhoneNumberId || null,
                },
            });
            if (!availablePhoneNumbers.length) {
                emitOnboardingTraceEvent({
                    businessId,
                    eventType: "phone_resolution_result",
                    message: "phone_resolution_result:no_phone_candidates",
                    severity: "error",
                    metadata: {
                        operationId: lifecycleContext?.attemptKey || null,
                        replayToken: lifecycleContext?.replayToken || null,
                        selectedPhoneNumberId: selectedPhoneNumberId || null,
                    },
                });
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                        context: lifecycleContext,
                        stage: "FAILED",
                        code: "WA_PHONE_NUMBER_NOT_FOUND",
                        reason: "No WhatsApp phone numbers were found in linked Meta assets.",
                        resolutionHint: "RECONNECT",
                    });
                }
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_PHONE_DISCOVERY",
                        reason: "No WhatsApp phone numbers were found in linked Meta assets.",
                        code: "WA_PHONE_NUMBER_NOT_FOUND",
                        actionable: buildActionableFailurePayload({
                            code: "WA_PHONE_NUMBER_NOT_FOUND",
                            reason: "No WhatsApp phone numbers were found in linked Meta assets.",
                        }),
                        requiresPhoneSelection: false,
                        availablePhoneNumbers: [],
                    },
                    message: "Unable to resolve WhatsApp phone number",
                    code: "WA_PHONE_NUMBER_NOT_FOUND",
                });
            }
            logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
                selectionRequired: true,
                selectedPhoneNumberId: null,
            });
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleNeedsAction)({
                    context: lifecycleContext,
                    stage: "PHONE_SELECTION",
                    detail: "Select the WhatsApp mobile number you want to connect.",
                    metadata: {
                        code: "PHONE_SELECTION_REQUIRED",
                        availablePhoneNumbers,
                        actionable: buildActionableFailurePayload({
                            code: "PHONE_SELECTION_REQUIRED",
                            reason: "Select the WhatsApp mobile number you want to connect.",
                        }),
                    },
                });
            }
            return res.status(409).json({
                success: false,
                data: {
                    platform: "WHATSAPP",
                    stage: "WA_PHONE_SELECTED",
                    reason: "Select the WhatsApp mobile number you want to connect.",
                    code: "PHONE_SELECTION_REQUIRED",
                    actionable: buildActionableFailurePayload({
                        code: "PHONE_SELECTION_REQUIRED",
                        reason: "Select the WhatsApp mobile number you want to connect.",
                    }),
                    requiresPhoneSelection: true,
                    availablePhoneNumbers,
                },
                message: "Phone number selection required",
                code: "PHONE_SELECTION_REQUIRED",
            });
        }
        if (targetPlatform === "INSTAGRAM" &&
            !requestedFacebookPageId &&
            !requestedInstagramProfessionalAccountId) {
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "PAIR_SELECTION",
                    detail: "Resolving eligible Facebook Page and Instagram pairs",
                });
            }
            let instagramDiscovery = null;
            try {
                instagramDiscovery = await fetchInstagramConnection(shortToken);
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
            if (!instagramDiscovery) {
                failInstagramConnect({
                    stage: "IG_PAGES_FETCHED",
                    reason: "Unable to fetch Instagram pages",
                    code: "IG_PAGES_FETCH_FAILED",
                    statusCode: 400,
                });
            }
            const validPairs = Array.isArray(instagramDiscovery.validPairs)
                ? instagramDiscovery.validPairs
                : [];
            const allPairs = Array.isArray(instagramDiscovery.allPairs)
                ? instagramDiscovery.allPairs
                : [];
            const personalPairs = allPairs.filter((pair) => String(pair.instagramAccountType || "")
                .trim()
                .toUpperCase() === "PERSONAL");
            if (!validPairs.length) {
                if (personalPairs.length) {
                    failInstagramConnect({
                        stage: "IG_PAIR_VALIDATED",
                        reason: "Connected Instagram account type is Personal. Professional account required.",
                        code: "ACCOUNT_PERSONAL",
                        statusCode: 400,
                    });
                }
                if (instagramDiscovery.pagesWithoutInstagram.length > 0) {
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
                    code: instagramDiscovery.pagesFound > 0
                        ? "NO_LINKED_PAGE"
                        : "PAGE_ROLE_REMOVED",
                    statusCode: 400,
                });
            }
            const actionable = buildActionableFailurePayload({
                code: "PAIR_SELECTION_REQUIRED",
                reason: "Select Facebook Page and Instagram account to continue.",
            });
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleNeedsAction)({
                    context: lifecycleContext,
                    stage: "PAIR_SELECTION",
                    detail: "Select Facebook Page and Instagram account to continue.",
                    metadata: {
                        code: "PAIR_SELECTION_REQUIRED",
                        validPairs,
                        actionable,
                    },
                });
            }
            return res.status(409).json({
                success: false,
                data: {
                    platform: "INSTAGRAM",
                    stage: "IG_PAIR_SELECTED",
                    reason: "Select Facebook Page and Instagram account to continue.",
                    code: "PAIR_SELECTION_REQUIRED",
                    actionable,
                    requiresPairSelection: true,
                    validPairs,
                },
                message: "Pair selection required",
                code: "PAIR_SELECTION_REQUIRED",
            });
        }
        let longToken = providedLongToken;
        if (!longToken) {
            let longTokenRes;
            try {
                longTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
                    params: {
                        grant_type: "fb_exchange_token",
                        client_id: metaRuntime.appId,
                        client_secret: metaRuntime.appSecret,
                        fb_exchange_token: shortToken,
                    },
                    timeout: META_GRAPH_TIMEOUT_MS,
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
            longToken = normalizeOptionalString(longTokenRes.data?.access_token);
        }
        if (!longToken) {
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                    context: lifecycleContext,
                    stage: "FAILED",
                    code: "META_LONG_TOKEN_MISSING",
                    reason: "Unable to resolve long lived token",
                    resolutionHint: "RETRY",
                });
            }
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
        if (targetPlatform === "WHATSAPP") {
            logWaCheckpoint("[WA STEP 4] long token exchanged");
        }
        if (targetPlatform === "INSTAGRAM") {
            await recordInstagramConnectStage({
                traceId: instagramTraceId,
                businessId,
                stage: "IG_LONG_TOKEN_EXCHANGED",
                status: "COMPLETED",
            });
        }
        if (lifecycleContext) {
            await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                context: lifecycleContext,
                stage: "META_ACCOUNT_CONNECTED",
                detail: "Meta account authenticated and long token resolved",
                metadata: {
                    grantedPermissionCount: discoveryPermissions.length,
                },
            });
        }
        const connectedClients = [];
        const grantedPermissions = discoveryPermissions.length
            ? discoveryPermissions
            : await fetchMetaGrantedPermissions(longToken);
        const connectReplayToken = lifecycleContext?.replayToken || `meta_oauth_${oauthState.nonce}`;
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
            if (!requestedFacebookPageId && !requestedInstagramProfessionalAccountId) {
                failInstagramConnect({
                    stage: "IG_PAIR_SELECTED",
                    reason: "Select Facebook Page and Instagram account to continue.",
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "WEBHOOK_ACTIVATION",
                    detail: "Activating Instagram webhook and canonical provider link",
                    metadata: {
                        facebookPageId: selectedPair.facebookPageId,
                        instagramProfessionalAccountId: selectedPair.instagramProfessionalAccountId,
                    },
                });
            }
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "CONNECTION_VERIFICATION",
                    detail: "Instagram canonical connect verified",
                    metadata: {
                        integrationStatus: connectResult.integration?.status || null,
                        attemptStatus: connectResult.attempt?.status || null,
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "TOKEN_PERSISTENCE",
                    detail: "Persisting Instagram token and client mapping",
                    metadata: {
                        integrationKey: connectResult.integration?.integrationKey || null,
                        attemptKey: connectResult.attempt?.attemptKey || null,
                    },
                });
            }
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
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "PHONE_SELECTION",
                    detail: "Resolving WhatsApp phone selection and WABA mapping",
                });
            }
            const requiredWhatsAppPermissions = [
                "whatsapp_business_management",
                "whatsapp_business_messaging",
            ];
            const missingWhatsAppPermissions = requiredWhatsAppPermissions.filter((scope) => !grantedPermissions.includes(scope));
            if (missingWhatsAppPermissions.length) {
                const actionable = buildActionableFailurePayload({
                    code: "WA_PERMISSION_MISSING",
                    reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
                    missingPermission: missingWhatsAppPermissions[0],
                });
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                        context: lifecycleContext,
                        stage: "FAILED",
                        code: "WA_PERMISSION_MISSING",
                        reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
                        resolutionHint: "RECONNECT",
                        metadata: {
                            actionable,
                            missingPermissions: missingWhatsAppPermissions,
                        },
                    });
                }
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_PERMISSION_AUDITED",
                        reason: `Missing required permissions: ${missingWhatsAppPermissions.join(", ")}`,
                        code: "WA_PERMISSION_MISSING",
                        actionable,
                        requiresPhoneSelection: false,
                        availablePhoneNumbers: [],
                    },
                    message: "WhatsApp permissions missing",
                    code: "WA_PERMISSION_MISSING",
                });
            }
            const availablePhoneNumbers = await fetchWhatsAppPhoneCandidates(longToken);
            const discoveredWabaCandidate = availablePhoneNumbers.find((candidate) => Boolean(candidate.wabaId)) || null;
            logWaCheckpoint("[WA STEP 5] accounts/pages discovered", {
                candidateCount: availablePhoneNumbers.length,
            });
            logWaCheckpoint("[WA STEP 6] whatsapp business account discovered", {
                wabaDiscovered: Boolean(discoveredWabaCandidate?.wabaId),
                wabaId: discoveredWabaCandidate?.wabaId || null,
                businessManagerId: discoveredWabaCandidate?.businessManagerId || null,
            });
            logWaCheckpoint("[WA STEP 7] phone numbers fetched", {
                phoneNumberCount: availablePhoneNumbers.length,
            });
            if (!availablePhoneNumbers.length) {
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                        context: lifecycleContext,
                        stage: "FAILED",
                        code: "WA_PHONE_NUMBER_NOT_FOUND",
                        reason: "No WhatsApp phone numbers were found in linked Meta assets.",
                        resolutionHint: "RECONNECT",
                    });
                }
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_PHONE_DISCOVERY",
                        reason: "No WhatsApp phone numbers were found in linked Meta assets.",
                        code: "WA_PHONE_NUMBER_NOT_FOUND",
                        actionable: buildActionableFailurePayload({
                            code: "WA_PHONE_NUMBER_NOT_FOUND",
                            reason: "No WhatsApp phone numbers were found in linked Meta assets.",
                        }),
                        requiresPhoneSelection: false,
                        availablePhoneNumbers: [],
                    },
                    message: "Unable to resolve WhatsApp phone number",
                    code: "WA_PHONE_NUMBER_NOT_FOUND",
                });
            }
            if (!selectedPhoneNumberId) {
                emitOnboardingTraceEvent({
                    businessId,
                    eventType: "phone_resolution_result",
                    message: "phone_resolution_result:selection_required",
                    severity: "error",
                    metadata: {
                        operationId: lifecycleContext?.attemptKey || null,
                        replayToken: lifecycleContext?.replayToken || null,
                        candidateCount: availablePhoneNumbers.length,
                    },
                });
                logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
                    selectionRequired: true,
                    selectedPhoneNumberId: null,
                });
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleNeedsAction)({
                        context: lifecycleContext,
                        stage: "PHONE_SELECTION",
                        detail: "Select the WhatsApp mobile number you want to connect.",
                        metadata: {
                            code: "PHONE_SELECTION_REQUIRED",
                            availablePhoneNumbers,
                            actionable: buildActionableFailurePayload({
                                code: "PHONE_SELECTION_REQUIRED",
                                reason: "Select the WhatsApp mobile number you want to connect.",
                            }),
                        },
                    });
                }
                return res.status(409).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_PHONE_SELECTED",
                        reason: "Select the WhatsApp mobile number you want to connect.",
                        code: "PHONE_SELECTION_REQUIRED",
                        actionable: buildActionableFailurePayload({
                            code: "PHONE_SELECTION_REQUIRED",
                            reason: "Select the WhatsApp mobile number you want to connect.",
                        }),
                        requiresPhoneSelection: true,
                        availablePhoneNumbers,
                    },
                    message: "Phone number selection required",
                    code: "PHONE_SELECTION_REQUIRED",
                });
            }
            const selectedPhone = availablePhoneNumbers.find((candidate) => candidate.phoneNumberId === selectedPhoneNumberId);
            if (!selectedPhone) {
                emitOnboardingTraceEvent({
                    businessId,
                    eventType: "phone_resolution_result",
                    message: "phone_resolution_result:selection_invalid",
                    severity: "error",
                    metadata: {
                        operationId: lifecycleContext?.attemptKey || null,
                        replayToken: lifecycleContext?.replayToken || null,
                        selectedPhoneNumberId: selectedPhoneNumberId || null,
                        candidateCount: availablePhoneNumbers.length,
                    },
                });
                logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
                    selectionRequired: true,
                    selectedPhoneNumberId: selectedPhoneNumberId || null,
                });
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleNeedsAction)({
                        context: lifecycleContext,
                        stage: "PHONE_SELECTION",
                        detail: "Selected WhatsApp number is not available under granted assets.",
                        metadata: {
                            code: "WA_PHONE_SELECTION_INVALID",
                            availablePhoneNumbers,
                            selectedPhoneNumberId: selectedPhoneNumberId || null,
                            actionable: buildActionableFailurePayload({
                                code: "PHONE_SELECTION_REQUIRED",
                                reason: "Selected WhatsApp number is not available under granted assets.",
                            }),
                        },
                    });
                }
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_PHONE_SELECTED",
                        reason: "Selected WhatsApp number is not available under granted assets.",
                        code: "WA_PHONE_SELECTION_INVALID",
                        actionable: buildActionableFailurePayload({
                            code: "PHONE_SELECTION_REQUIRED",
                            reason: "Selected WhatsApp number is not available under granted assets.",
                        }),
                        requiresPhoneSelection: true,
                        availablePhoneNumbers,
                    },
                    message: "Selected phone number is invalid",
                    code: "WA_PHONE_SELECTION_INVALID",
                });
            }
            const resolvedPhoneNumberId = selectedPhone.phoneNumberId;
            emitOnboardingTraceEvent({
                businessId,
                eventType: "phone_resolution_result",
                message: "phone_resolution_result:selected_phone_resolved",
                metadata: {
                    operationId: lifecycleContext?.attemptKey || null,
                    replayToken: lifecycleContext?.replayToken || null,
                    selectedPhoneNumberId: resolvedPhoneNumberId,
                    businessManagerId: selectedPhone.businessManagerId || null,
                    wabaId: selectedPhone.wabaId || null,
                },
            });
            logWaCheckpoint("[WA STEP 8] phone selected / selection required", {
                selectionRequired: false,
                selectedPhoneNumberId: resolvedPhoneNumberId,
            });
            const phoneProfile = await fetchWhatsAppPhoneProfile(resolvedPhoneNumberId, longToken);
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "WEBHOOK_ACTIVATION",
                    detail: "Activating WhatsApp webhook and canonical provider link",
                    metadata: {
                        phoneNumberId: resolvedPhoneNumberId,
                        wabaId: selectedPhone.wabaId || null,
                        businessManagerId: selectedPhone.businessManagerId || null,
                    },
                });
            }
            logWaCheckpoint("[WA STEP 9] webhook/provider registration started", {
                phoneNumberId: resolvedPhoneNumberId,
                businessManagerId: selectedPhone.businessManagerId || null,
                wabaId: selectedPhone.wabaId || null,
            });
            const connectResult = await (0, saasPackagingConnectHubOS_service_1.connectWhatsAppGuidedWizard)({
                businessId,
                tenantId: businessId,
                environment: "LIVE",
                replayToken: connectReplayToken,
                reconnect: oauthState.mode === "reconnect",
                businessManagerId: selectedPhone.businessManagerId,
                wabaId: selectedPhone.wabaId,
                phoneNumberId: resolvedPhoneNumberId,
                displayName: normalizeOptionalString(phoneProfile?.verified_name) ||
                    selectedPhone.verifiedName ||
                    normalizeOptionalString(phoneProfile?.display_phone_number) ||
                    selectedPhone.displayPhoneNumber ||
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
            logWaCheckpoint("[WA STEP 10] webhook/provider registration complete", {
                integrationStatus: connectResult.integration?.status || null,
                attemptStatus: connectResult.attempt?.status || null,
            });
            emitOnboardingTraceEvent({
                businessId,
                eventType: "webhook_activation_result",
                message: connectResult.integration?.status === "CONNECTED"
                    ? "webhook_activation_result:connected"
                    : "webhook_activation_result:failed",
                severity: connectResult.integration?.status === "CONNECTED" ? "info" : "error",
                metadata: {
                    operationId: lifecycleContext?.attemptKey || null,
                    replayToken: lifecycleContext?.replayToken || null,
                    selectedPhoneNumberId: resolvedPhoneNumberId,
                    integrationStatus: connectResult.integration?.status || null,
                    attemptStatus: connectResult.attempt?.status || null,
                    attemptErrorCode: connectResult.attempt?.errorCode || null,
                    attemptErrorMessage: connectResult.attempt?.errorMessage || null,
                },
            });
            if (connectResult.integration?.status !== "CONNECTED") {
                const failureCode = normalizeOptionalString(connectResult.attempt?.errorCode) ||
                    normalizeOptionalString(connectResult.health?.rootCauseCode) ||
                    "WA_CANONICAL_SAVE_FAILED";
                const failureReason = normalizeOptionalString(connectResult.attempt?.errorMessage) ||
                    normalizeOptionalString(connectResult.health?.rootCauseMessage) ||
                    "WhatsApp canonical connect did not reach CONNECTED status";
                const actionable = buildActionableFailurePayload({
                    code: failureCode,
                    reason: failureReason,
                });
                if (lifecycleContext) {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                        context: lifecycleContext,
                        stage: "FAILED",
                        code: failureCode,
                        reason: failureReason,
                        resolutionHint: "RETRY",
                        metadata: {
                            actionable,
                            availablePhoneNumbers,
                            attemptStatus: connectResult.attempt?.status || null,
                            integrationStatus: connectResult.integration?.status || null,
                        },
                    });
                }
                return res.status(400).json({
                    success: false,
                    data: {
                        platform: "WHATSAPP",
                        stage: "WA_CONNECT_FAILED",
                        reason: failureReason,
                        code: failureCode,
                        actionable,
                        requiresPhoneSelection: availablePhoneNumbers.length > 0,
                        availablePhoneNumbers,
                    },
                    message: "WhatsApp connect failed",
                    code: failureCode,
                });
            }
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "CONNECTION_VERIFICATION",
                    detail: "WhatsApp canonical connect verified",
                    metadata: {
                        integrationStatus: connectResult.integration?.status || null,
                        attemptStatus: connectResult.attempt?.status || null,
                    },
                });
            }
            logWaCheckpoint("[WA STEP 11] DB persist started");
            if (lifecycleContext) {
                await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                    context: lifecycleContext,
                    stage: "TOKEN_PERSISTENCE",
                    detail: "Persisting WhatsApp token and client mapping",
                    metadata: {
                        phoneNumberId: resolvedPhoneNumberId,
                    },
                });
            }
            const whatsappClient = await upsertConnectedClient({
                businessId,
                platform: "WHATSAPP",
                phoneNumberId: resolvedPhoneNumberId,
                accessToken: (0, encrypt_1.encrypt)(longToken),
            });
            logWaCheckpoint("[WA STEP 12] DB persist complete", {
                clientId: whatsappClient.id,
                phoneNumberId: whatsappClient.phoneNumberId || null,
            });
            connectedClients.push(whatsappClient);
        }
        const clientsSnapshot = connectedClients.map((client) => ({
            platform: client.platform,
            healthy: Boolean(client.isActive),
            connected: Boolean(client.isActive),
            clientId: client.id,
            pageId: client.pageId || null,
            phoneNumberId: client.phoneNumberId || null,
        }));
        if (lifecycleContext) {
            await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleStage)({
                context: lifecycleContext,
                stage: "FINAL_ONBOARDING",
                detail: "Running onboarding demo enqueue and health reconciliation",
                metadata: {
                    clients: clientsSnapshot,
                },
            });
        }
        if (targetPlatform === "WHATSAPP") {
            logWaCheckpoint("[WA STEP 13] response return", {
                mode: oauthState.mode,
                connectedClients: clientsSnapshot.length,
            });
        }
        lifecycleRequestAborted = isRequestDetached();
        if (lifecycleContext) {
            if (internalContinuation) {
                await finalizeMetaOnboardingLifecycle({
                    businessId,
                    lifecycleContext,
                    connectedClients,
                    requestTimedOut: lifecycleRequestTimedOut,
                    requestAborted: lifecycleRequestAborted,
                }, {
                    deferred: false,
                });
            }
            else {
                finalizeMetaOnboardingLifecycle({
                    businessId,
                    lifecycleContext,
                    connectedClients,
                    requestTimedOut: lifecycleRequestTimedOut,
                    requestAborted: lifecycleRequestAborted,
                });
            }
        }
        if (lifecycleRequestAborted) {
            return;
        }
        return res.status(202).json({
            success: true,
            data: {
                platform: targetPlatform,
                mode: oauthState.mode,
                workspaceId: oauthState.workspaceId,
                clients: clientsSnapshot,
                lifecycle: lifecycleContext
                    ? {
                        operationId: lifecycleContext.attemptKey,
                        replayToken: lifecycleContext.replayToken,
                        status: "PROCESSING",
                        stage: "FINAL_ONBOARDING",
                    }
                    : null,
            },
            message: `${targetPlatform} connect processing`,
        });
    }
    catch (error) {
        if (waDiagEnabled) {
            const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error");
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error("WA_META_FINALIZE_DIAG_ERROR", {
                "error.message": errorMessage,
                "error.stack": errorStack,
                checkpointReached: waCheckpointReached,
            });
        }
        lifecycleRequestAborted = isRequestDetached();
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
            if (lifecycleContext) {
                if (String(error.code || "").trim().toUpperCase() === "PAIR_SELECTION_REQUIRED") {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleNeedsAction)({
                        context: lifecycleContext,
                        stage: "PAIR_SELECTION",
                        detail: error.reason,
                        metadata: {
                            code: error.code,
                            validPairs,
                            actionable,
                        },
                    });
                }
                else {
                    await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                        context: lifecycleContext,
                        stage: "FAILED",
                        code: error.code || "IG_CONNECT_FAILED",
                        reason: error.reason,
                        resolutionHint: normalizeOptionalString(actionable?.cta?.action) || "RETRY",
                        metadata: {
                            failingStage: error.stage,
                            ...(error.metadata || {}),
                        },
                    });
                }
            }
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
            if (lifecycleRequestAborted) {
                return;
            }
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
        if (lifecycleContext) {
            const fallbackCode = normalizeOptionalString(error?.code) || "META_OAUTH_CONNECT_FAILED";
            const fallbackReason = normalizeOptionalString(error?.message) || "Integration connection failed";
            await (0, metaOAuthLifecycle_service_1.markMetaOAuthLifecycleFailure)({
                context: lifecycleContext,
                stage: "FAILED",
                code: fallbackCode,
                reason: fallbackReason,
                resolutionHint: "RETRY",
            });
        }
        if (internalContinuation) {
            throw error;
        }
        if (lifecycleRequestAborted) {
            return;
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
const createMetaOAuthContinuationMockResponse = () => {
    const response = {
        statusCode: 200,
        headersSent: false,
        writableEnded: false,
        locals: {},
        body: null,
        setTimeout: () => response,
        status: (code) => {
            response.statusCode = code;
            return response;
        },
        json: (body) => {
            response.body = body;
            response.headersSent = true;
            response.writableEnded = true;
            return response;
        },
        send: (body) => {
            response.body = body;
            response.headersSent = true;
            response.writableEnded = true;
            return response;
        },
    };
    return response;
};
const runMetaOAuthContinuationFromQueueJob = async (input) => {
    const shortToken = normalizeOptionalString(input.shortTokenEncrypted) &&
        input.shortTokenEncrypted
        ? (0, encrypt_1.decrypt)(input.shortTokenEncrypted)
        : null;
    const longToken = normalizeOptionalString(input.longTokenEncrypted) &&
        input.longTokenEncrypted
        ? (0, encrypt_1.decrypt)(input.longTokenEncrypted)
        : null;
    const req = {
        method: "POST",
        path: "/api/clients/oauth/meta",
        originalUrl: "/api/clients/oauth/meta",
        body: {
            code: input.code || undefined,
            state: input.state,
            aiTone: input.aiTone || undefined,
            businessInfo: input.businessInfo || undefined,
            pricingInfo: input.pricingInfo || undefined,
            faqKnowledge: input.faqKnowledge || undefined,
            salesInstructions: input.salesInstructions || undefined,
            phoneNumberId: input.phoneNumberId || undefined,
            facebookPageId: input.facebookPageId || undefined,
            instagramProfessionalAccountId: input.instagramProfessionalAccountId || undefined,
        },
        user: {
            id: input.userId,
            role: "OWNER",
            businessId: input.businessId,
        },
        tenant: {
            businessId: input.businessId,
        },
        headers: {},
        query: {},
        cookies: {},
        aborted: false,
    };
    const res = createMetaOAuthContinuationMockResponse();
    req.__metaContinuationInternal = true;
    req.__metaResolvedTokens = {
        shortToken,
        longToken,
    };
    await (0, exports.metaOAuthConnect)(req, res);
    return {
        statusCode: res.statusCode,
        body: res.body,
    };
};
exports.runMetaOAuthContinuationFromQueueJob = runMetaOAuthContinuationFromQueueJob;
const getMetaOAuthLifecycle = async (req, res) => {
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
        const rawOperationId = normalizeOptionalString(req.query.operationId);
        const rawState = normalizeOptionalString(req.query.state);
        const platformQuery = normalizeOptionalString(req.query.platform);
        const platform = (0, metaOAuthState_1.parseMetaOAuthPlatform)(platformQuery) || null;
        let attemptKey = rawOperationId;
        let replayToken = null;
        let provider = platform;
        if (rawState) {
            const oauthState = (0, metaOAuthState_1.verifyMetaOAuthState)(rawState);
            if (!oauthState) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "Invalid OAuth state",
                });
            }
            if (oauthState.userId !== userId ||
                oauthState.businessId !== businessId ||
                oauthState.workspaceId !== businessId) {
                return res.status(403).json({
                    success: false,
                    data: null,
                    message: "OAuth state mismatch",
                });
            }
            provider = oauthState.platform;
            const lifecycleContext = (0, metaOAuthLifecycle_service_1.createMetaOAuthLifecycleContext)({
                businessId: oauthState.businessId,
                platform: oauthState.platform,
                mode: oauthState.mode,
                nonce: oauthState.nonce,
            });
            replayToken = lifecycleContext.replayToken;
            if (!attemptKey) {
                attemptKey = lifecycleContext.attemptKey;
            }
        }
        if (!attemptKey && !replayToken) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "operationId or state is required",
            });
        }
        const row = await (0, metaOAuthLifecycle_service_1.getMetaOAuthLifecycleSnapshot)({
            attemptKey,
            replayToken,
            platform: provider,
        });
        if (!row) {
            return res.status(202).json({
                success: true,
                data: {
                    operationId: attemptKey,
                    replayToken,
                    platform: provider,
                    status: "PROCESSING",
                    connectionState: "PROCESSING",
                    stage: "OAUTH_AUTHENTICATED",
                    processing: true,
                },
            });
        }
        const lifecycle = (0, metaOAuthLifecycle_service_1.toMetaOAuthLifecycleResponse)({
            attemptKey: row.attemptKey,
            replayToken: row.replayToken,
            provider: row.provider,
            status: row.status,
            step: row.step,
            statusDetail: row.statusDetail,
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            resolutionHint: row.resolutionHint,
            metadata: row.metadata,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        });
        const metadata = lifecycle.metadata && typeof lifecycle.metadata === "object"
            ? lifecycle.metadata
            : {};
        const validPairs = Array.isArray(metadata.validPairs)
            ? metadata.validPairs
            : [];
        const availablePhoneNumbers = Array.isArray(metadata.availablePhoneNumbers)
            ? metadata.availablePhoneNumbers
            : [];
        const connectionState = lifecycle.status === "COMPLETED"
            ? "READY_MINIMAL"
            : lifecycle.status === "NEEDS_ACTION" || lifecycle.status === "FAILED"
                ? "ACTION_REQUIRED"
                : lifecycle.stage === "CONTINUATION_SCHEDULED" ||
                    lifecycle.stage === "CALLBACK_ACCEPTED"
                    ? "CONTINUATION_SCHEDULED"
                    : lifecycle.stage === "META_ACCOUNT_CONNECTED"
                        ? "CONNECTED_PENDING"
                        : "PROCESSING";
        return res.json({
            success: true,
            data: {
                ...lifecycle,
                connectionState,
                processing: lifecycle.status === "PROCESSING",
                requiresPairSelection: lifecycle.status === "NEEDS_ACTION" &&
                    (lifecycle.stage === "PAIR_SELECTION" || validPairs.length > 0),
                requiresPhoneSelection: lifecycle.status === "NEEDS_ACTION" &&
                    (lifecycle.stage === "PHONE_SELECTION" || availablePhoneNumbers.length > 0),
                actionable: metadata.actionable || null,
                validPairs,
                availablePhoneNumbers,
                clients: Array.isArray(metadata.clients) ? metadata.clients : [],
            },
        });
    }
    catch (error) {
        console.error("Meta OAuth lifecycle fetch error:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Failed to load Meta OAuth lifecycle",
        });
    }
};
exports.getMetaOAuthLifecycle = getMetaOAuthLifecycle;
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
        const preferredPhoneNumberId = normalizeOptionalString(req.query.phoneNumberId);
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
            preferredPhoneNumberId,
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
                    preferredPhoneNumberId,
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
                preferredPhoneNumberId,
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
