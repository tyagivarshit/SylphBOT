"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const metaOAuthState_1 = require("../utils/metaOAuthState");
const router = (0, express_1.Router)();
const buildSettingsRedirect = (params) => {
    const url = new URL("/settings", env_1.env.FRONTEND_URL);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
};
router.get("/meta/callback", async (req, res) => {
    try {
        const code = String(req.query.code || "").trim();
        const rawState = String(req.query.state || "").trim();
        const oauthState = (0, metaOAuthState_1.verifyMetaOAuthState)(rawState);
        if (!oauthState) {
            return res.redirect(buildSettingsRedirect({
                integration: "error",
                reason: "invalid_oauth_state",
            }));
        }
        const requestUserId = String(req.user?.id || "").trim();
        const requestBusinessId = String(req.user?.businessId || "").trim();
        if (!requestUserId ||
            !requestBusinessId ||
            oauthState.userId !== requestUserId ||
            oauthState.businessId !== requestBusinessId) {
            return res.redirect(buildSettingsRedirect({
                integration: "error",
                reason: "oauth_state_mismatch",
                platform: oauthState.platform.toLowerCase(),
            }));
        }
        if (!code) {
            return res.redirect(buildSettingsRedirect({
                integration: "error",
                reason: "oauth_code_missing",
                platform: oauthState.platform.toLowerCase(),
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
        return res.redirect(buildSettingsRedirect({
            integration: "error",
            reason: "oauth_callback_failed",
        }));
    }
});
exports.default = router;
