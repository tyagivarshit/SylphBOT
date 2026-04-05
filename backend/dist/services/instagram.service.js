"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchInstagramMedia = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encrypt_1 = require("../utils/encrypt");
const fetchInstagramMedia = async (clientId) => {
    const client = await prisma_1.default.client.findUnique({
        where: { id: clientId },
    });
    if (!client) {
        throw new Error("Client not found");
    }
    if (!client.accessToken || !client.pageId) {
        throw new Error("Instagram not connected properly");
    }
    const accessToken = (0, encrypt_1.decrypt)(client.accessToken);
    try {
        const res = await axios_1.default.get(`https://graph.facebook.com/v19.0/${client.pageId}/media`, {
            params: {
                fields: "id,caption,media_type,media_url,permalink,timestamp",
                access_token: accessToken,
                limit: 25,
            },
            timeout: 10000,
        });
        const media = res.data?.data || [];
        return media.map((m) => ({
            id: m.id,
            caption: m.caption || "",
            media_type: m.media_type,
            media_url: m.media_url,
            permalink: m.permalink,
        }));
    }
    catch (error) {
        console.error("Instagram fetch error:", error.response?.data || error.message);
        throw new Error("Failed to fetch Instagram media");
    }
};
exports.fetchInstagramMedia = fetchInstagramMedia;
