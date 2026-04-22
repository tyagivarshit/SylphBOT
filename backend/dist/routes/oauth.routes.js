"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
/*
---------------------------------------------------
META OAUTH CALLBACK
---------------------------------------------------
*/
router.get("/meta/callback", async (req, res) => {
    try {
        const { code, state } = req.query;
        if (!code || !state) {
            return res.status(400).send("Invalid OAuth request");
        }
        const userId = state;
        /*
        🔥 CALL YOUR EXISTING CONTROLLER
        (metaOAuthConnect ko reuse karenge)
        */
        const response = await axios_1.default.post(`${process.env.BACKEND_URL}/api/clients/oauth/meta`, {
            code,
        }, {
            headers: {
                Cookie: req.headers.cookie || "", // 🔥 session pass karne ke liye
            },
        });
        /*
        🔥 SUCCESS → FRONTEND REDIRECT
        */
        return res.redirect(`${process.env.FRONTEND_URL}/settings?integration=success&onboarding=1`);
    }
    catch (error) {
        console.error("OAuth callback error:", error);
        return res.redirect(`${process.env.FRONTEND_URL}/settings?integration=error`);
    }
});
exports.default = router;
