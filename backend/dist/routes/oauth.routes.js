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
const buildInstagramTraceId = (nonce) => {
    const normalizedNonce = String(nonce || "").trim();
    return normalizedNonce
        ? `ig_connect_${normalizedNonce}`
        : `ig_connect_${Date.now()}`;
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
        eventType: `meta.instagram.callback.${input.stage.toLowerCase()}`,
        message: `Instagram callback stage ${input.stage}`,
        severity,
        context: {
            traceId: input.traceId,
            correlationId: input.traceId,
            provider: "INSTAGRAM",
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
                stage: "IG_STATE_VERIFIED",
                platform: "instagram",
            }));
        }
        const traceId = buildInstagramTraceId(oauthState.nonce);
        if (oauthState.platform === "INSTAGRAM") {
            await recordMetaCallbackStage({
                businessId: oauthState.businessId,
                traceId,
                stage: "IG_CALLBACK_RECEIVED",
                status: "COMPLETED",
                metadata: {
                    mode: oauthState.mode,
                },
            });
            await recordMetaCallbackStage({
                businessId: oauthState.businessId,
                traceId,
                stage: "IG_STATE_VERIFIED",
                status: "COMPLETED",
            });
        }
        if (providerError) {
            if (oauthState.platform === "INSTAGRAM") {
                await recordMetaCallbackStage({
                    businessId: oauthState.businessId,
                    traceId,
                    stage: "IG_CONNECT_FAILED",
                    status: "FAILED",
                    metadata: {
                        failingStage: "IG_CALLBACK_RECEIVED",
                        reason: providerErrorDescription || providerErrorReason || providerError,
                        code: "IG_PROVIDER_DENIED",
                    },
                    endedAt: new Date(),
                });
            }
            return res.redirect(buildMetaCallbackRedirect({
                platform: oauthState.platform.toLowerCase(),
                mode: oauthState.mode,
                state: rawState,
                stage: "IG_CALLBACK_RECEIVED",
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
            if (oauthState.platform === "INSTAGRAM") {
                await recordMetaCallbackStage({
                    businessId: oauthState.businessId,
                    traceId,
                    stage: "IG_CONNECT_FAILED",
                    status: "FAILED",
                    metadata: {
                        failingStage: "IG_CODE_EXCHANGED",
                        reason: "Meta callback did not include authorization code",
                        code: "IG_OAUTH_CODE_MISSING",
                    },
                    endedAt: new Date(),
                });
            }
            return res.redirect(buildMetaCallbackRedirect({
                platform: oauthState.platform.toLowerCase(),
                mode: oauthState.mode,
                state: rawState,
                reason: "oauth_code_missing",
                stage: "IG_CODE_EXCHANGED",
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
            stage: "IG_CALLBACK_RECEIVED",
            platform: "instagram",
        }));
    }
});
exports.default = router;
