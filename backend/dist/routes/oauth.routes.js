"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const metaOAuthState_1 = require("../utils/metaOAuthState");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
const router = (0, express_1.Router)();
const buildMetaCallbackRedirect = (params) => {
    const url = new URL("/integrations/meta/callback", env_1.env.FRONTEND_URL);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
};
const buildMetaTraceId = (nonce) => {
    const normalizedNonce = String(nonce || "").trim();
    return normalizedNonce
        ? `meta_connect_${normalizedNonce}`
        : `meta_connect_${Date.now()}`;
};
const getProviderStage = (provider, stage) => {
    if (provider === "WHATSAPP") {
        if (stage === "CALLBACK_RECEIVED") {
            return "WA_CALLBACK_RECEIVED";
        }
        if (stage === "STATE_VERIFIED") {
            return "WA_STATE_VERIFIED";
        }
        if (stage === "CONNECT_FAILED") {
            return "WA_CONNECT_FAILED";
        }
        return "WA_CODE_EXCHANGED";
    }
    if (stage === "CALLBACK_RECEIVED") {
        return "IG_CALLBACK_RECEIVED";
    }
    if (stage === "STATE_VERIFIED") {
        return "IG_STATE_VERIFIED";
    }
    if (stage === "CONNECT_FAILED") {
        return "IG_CONNECT_FAILED";
    }
    return "IG_CODE_EXCHANGED";
};
const recordMetaCallbackStage = async (input) => {
    const metadata = input.metadata || {};
    const severity = input.status === "FAILED" ? "error" : "info";
    await (0, reliabilityOS_service_1.recordTraceLedger)({
        traceId: input.traceId,
        correlationId: input.traceId,
        businessId: input.businessId,
        tenantId: input.businessId,
        stage: input.stage,
        status: input.status,
        metadata,
        endedAt: input.endedAt || null,
    }).catch(() => undefined);
    await (0, reliabilityOS_service_1.recordObservabilityEvent)({
        businessId: input.businessId,
        tenantId: input.businessId,
        eventType: `meta.${input.provider.toLowerCase()}.callback.${input.stage.toLowerCase()}`,
        message: `${input.provider} callback stage ${input.stage}`,
        severity,
        context: {
            traceId: input.traceId,
            correlationId: input.traceId,
            provider: input.provider,
            component: "meta-oauth-callback",
            phase: "connect",
        },
        metadata: {
            status: input.status,
            ...metadata,
        },
    }).catch(() => undefined);
};
router.get("/meta/callback", async (req, res) => {
    try {
        const code = String(req.query.code || "").trim();
        const rawState = String(req.query.state || "").trim();
        const providerError = String(req.query.error || "").trim();
        const providerErrorReason = String(req.query.error_reason || "").trim();
        const providerErrorDescription = String(req.query.error_description || "").trim();
        const oauthState = (0, metaOAuthState_1.verifyMetaOAuthState)(rawState);
        if (!oauthState) {
            return res.redirect(buildMetaCallbackRedirect({
                integration: "error",
                reason: "invalid_oauth_state",
                stage: getProviderStage("INSTAGRAM", "STATE_VERIFIED"),
                platform: "instagram",
            }));
        }
        const traceId = buildMetaTraceId(oauthState.nonce);
        const provider = oauthState.platform === "WHATSAPP" ? "WHATSAPP" : "INSTAGRAM";
        const callbackReceivedStage = getProviderStage(provider, "CALLBACK_RECEIVED");
        const stateVerifiedStage = getProviderStage(provider, "STATE_VERIFIED");
        const connectFailedStage = getProviderStage(provider, "CONNECT_FAILED");
        const codeExchangedStage = getProviderStage(provider, "CODE_EXCHANGED");
        await recordMetaCallbackStage({
            businessId: oauthState.businessId,
            traceId,
            provider,
            stage: callbackReceivedStage,
            status: "COMPLETED",
            metadata: {
                mode: oauthState.mode,
            },
        });
        await recordMetaCallbackStage({
            businessId: oauthState.businessId,
            traceId,
            provider,
            stage: stateVerifiedStage,
            status: "COMPLETED",
        });
        if (providerError) {
            await recordMetaCallbackStage({
                businessId: oauthState.businessId,
                traceId,
                provider,
                stage: connectFailedStage,
                status: "FAILED",
                metadata: {
                    failingStage: callbackReceivedStage,
                    reason: providerErrorDescription || providerErrorReason || providerError,
                    code: `${provider === "WHATSAPP" ? "WA" : "IG"}_PROVIDER_DENIED`,
                },
                endedAt: new Date(),
            });
            return res.redirect(buildMetaCallbackRedirect({
                platform: oauthState.platform.toLowerCase(),
                mode: oauthState.mode,
                state: rawState,
                stage: callbackReceivedStage,
                error: providerError,
                error_reason: providerErrorReason || "oauth_provider_denied",
                error_description: providerErrorDescription ||
                    providerErrorReason ||
                    providerError ||
                    "OAuth provider denied requested permissions",
                reason: "oauth_provider_denied",
                integration: "error",
            }));
        }
        if (!code) {
            await recordMetaCallbackStage({
                businessId: oauthState.businessId,
                traceId,
                provider,
                stage: connectFailedStage,
                status: "FAILED",
                metadata: {
                    failingStage: codeExchangedStage,
                    reason: "Meta callback did not include authorization code",
                    code: `${provider === "WHATSAPP" ? "WA" : "IG"}_OAUTH_CODE_MISSING`,
                },
                endedAt: new Date(),
            });
            return res.redirect(buildMetaCallbackRedirect({
                platform: oauthState.platform.toLowerCase(),
                mode: oauthState.mode,
                state: rawState,
                reason: "oauth_code_missing",
                stage: codeExchangedStage,
                integration: "error",
            }));
        }
        const callbackUrl = new URL("/integrations/meta/callback", env_1.env.FRONTEND_URL);
        callbackUrl.searchParams.set("code", code);
        callbackUrl.searchParams.set("state", rawState);
        callbackUrl.searchParams.set("platform", oauthState.platform.toLowerCase());
        callbackUrl.searchParams.set("mode", oauthState.mode);
        return res.redirect(callbackUrl.toString());
    }
    catch (error) {
        console.error("OAuth callback error:", error);
        return res.redirect(buildMetaCallbackRedirect({
            integration: "error",
            reason: "oauth_callback_failed",
            stage: getProviderStage("INSTAGRAM", "CALLBACK_RECEIVED"),
            platform: "instagram",
        }));
    }
});
exports.default = router;
