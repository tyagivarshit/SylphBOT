"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMetaTokenRefreshCron = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encrypt_1 = require("../utils/encrypt");
const log = (...args) => {
    console.log("[META TOKEN CRON]", ...args);
};
const startMetaTokenRefreshCron = () => {
    log("Meta token refresh cron started");
    /*
    ---------------------------------------------------
    RUN EVERY DAY AT 3 AM
    ---------------------------------------------------
    */
    return node_cron_1.default.schedule("0 3 * * *", async () => {
        try {
            log("Checking Instagram tokens...");
            const clients = await prisma_1.default.client.findMany({
                where: {
                    platform: "INSTAGRAM",
                    isActive: true,
                },
            });
            for (const client of clients) {
                try {
                    const currentToken = (0, encrypt_1.decrypt)(client.accessToken);
                    const response = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
                        params: {
                            grant_type: "fb_exchange_token",
                            client_id: process.env.META_APP_ID,
                            client_secret: process.env.META_APP_SECRET,
                            fb_exchange_token: currentToken,
                        },
                    });
                    const newToken = response.data.access_token;
                    if (!newToken) {
                        log("Token refresh failed for client:", client.id);
                        continue;
                    }
                    const encrypted = (0, encrypt_1.encrypt)(newToken);
                    await prisma_1.default.client.update({
                        where: { id: client.id },
                        data: {
                            accessToken: encrypted,
                        },
                    });
                    log("Token refreshed:", client.id);
                }
                catch (err) {
                    log("Refresh error for client:", client.id, err.response?.data || err.message);
                }
            }
            log("Token refresh cycle complete");
        }
        catch (error) {
            log("Cron failed:", error);
        }
    });
};
exports.startMetaTokenRefreshCron = startMetaTokenRefreshCron;
