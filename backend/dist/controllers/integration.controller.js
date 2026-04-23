"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstagramAccounts = exports.getOnboarding = exports.getIntegrations = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = __importDefault(require("../config/prisma"));
const encrypt_1 = require("../utils/encrypt");
const onboarding_service_1 = require("../services/onboarding.service");
const instagramProfile_service_1 = require("../services/instagramProfile.service");
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
