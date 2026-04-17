"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMetaOAuth = exports.getSingleClient = exports.deleteClient = exports.updateClient = exports.getClients = exports.updateAITraining = exports.metaOAuthConnect = exports.createClient = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const clientUpsert_service_1 = require("../services/clientUpsert.service");
const encrypt_1 = require("../utils/encrypt");
const axios_1 = __importDefault(require("axios"));
/*
---------------------------------------------------
HELPER FUNCTIONS
---------------------------------------------------
*/
const getBusinessByOwner = async (userId) => {
    return prisma_1.default.business.findFirst({
        where: { ownerId: userId },
        select: { id: true },
    });
};
const getSubscription = async (businessId) => {
    return prisma_1.default.subscription.findUnique({
        where: { businessId },
        include: { plan: true },
    });
};
/*
---------------------------------------------------
CREATE CLIENT
---------------------------------------------------
*/
const createClient = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        let { platform, phoneNumberId, pageId, accessToken, aiTone, businessInfo, pricingInfo, 
        /* NEW AI TRAINING FIELDS */
        faqKnowledge, salesInstructions } = req.body;
        if (!platform || !accessToken) {
            return res.status(400).json({
                message: "platform and accessToken required",
            });
        }
        platform = platform.toUpperCase();
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const subscription = await getSubscription(business.id);
        if (!subscription) {
            return res.status(403).json({
                message: "No active subscription found",
            });
        }
        const planName = subscription.plan.name;
        const now = new Date();
        let allowedPlatforms = [];
        if (planName === "FREE_TRIAL") {
            if (subscription.currentPeriodEnd &&
                now < subscription.currentPeriodEnd) {
                allowedPlatforms = ["WHATSAPP", "INSTAGRAM"];
            }
            else {
                return res.status(403).json({
                    message: "Your 7-day trial has expired. Please upgrade your plan.",
                });
            }
        }
        else if (planName === "PRO_1999") {
            allowedPlatforms = ["WHATSAPP", "INSTAGRAM"];
        }
        else {
            return res.status(403).json({
                message: "Invalid subscription plan",
            });
        }
        if (!allowedPlatforms.includes(platform)) {
            return res.status(403).json({
                message: `${platform} integration not allowed in your plan`,
            });
        }
        const encryptedToken = (0, encrypt_1.encrypt)(accessToken);
        const client = await (0, clientUpsert_service_1.upsertClientByUniqueKey)({
            businessId: business.id,
            platform,
            phoneNumberId,
            pageId,
            accessToken: encryptedToken,
            aiTone,
            businessInfo,
            pricingInfo,
            faqKnowledge,
            salesInstructions,
        });
        return res.status(201).json({
            message: "Client created successfully",
            client,
        });
    }
    catch (error) {
        if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
            return res.status(400).json({
                message: "phoneNumberId or pageId required",
            });
        }
        if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
            return res.status(400).json({
                message: "This connected account already exists for another business",
            });
        }
        if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT") {
            return res.status(400).json({
                message: "This connected account already exists for your business",
            });
        }
        if (error.code === "P2002") {
            return res.status(400).json({
                message: "This connected account already exists for your business",
            });
        }
        console.error("Create client error:", error);
        return res.status(500).json({
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
        const { code, aiTone, businessInfo, pricingInfo, 
        /* NEW */
        faqKnowledge, salesInstructions } = req.body;
        if (!userId || !code) {
            return res.status(400).json({
                message: "Invalid request",
            });
        }
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({
                message: "Business not found",
            });
        }
        const shortTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
            params: {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                redirect_uri: `${process.env.BACKEND_URL}/api/oauth/meta/callback`,
                code,
            },
        });
        const shortToken = shortTokenRes.data.access_token;
        const longTokenRes = await axios_1.default.get("https://graph.facebook.com/v19.0/oauth/access_token", {
            params: {
                grant_type: "fb_exchange_token",
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                fb_exchange_token: shortToken,
            },
        });
        const longToken = longTokenRes.data.access_token;
        const pagesRes = await axios_1.default.get("https://graph.facebook.com/v19.0/me/accounts", {
            params: {
                access_token: longToken,
            },
        });
        const page = pagesRes.data.data?.[0];
        if (!page) {
            return res.status(400).json({
                message: "No Facebook page found",
            });
        }
        const igRes = await axios_1.default.get(`https://graph.facebook.com/v19.0/${page.id}`, {
            params: {
                fields: "instagram_business_account",
                access_token: page.access_token,
            },
        });
        const instagramId = igRes.data.instagram_business_account?.id;
        if (!instagramId) {
            return res.status(400).json({
                message: "Instagram business account not connected to this page",
            });
        }
        const encryptedToken = (0, encrypt_1.encrypt)(page.access_token);
        const client = await (0, clientUpsert_service_1.upsertClientByUniqueKey)({
            businessId: business.id,
            platform: "INSTAGRAM",
            pageId: instagramId,
            accessToken: encryptedToken,
            aiTone,
            businessInfo,
            pricingInfo,
            faqKnowledge,
            salesInstructions,
        });
        return res.json({
            message: "Instagram connected successfully",
            client,
        });
    }
    catch (error) {
        if (error.code === "CLIENT_UNIQUE_KEY_REQUIRED") {
            return res.status(400).json({
                message: "phoneNumberId or pageId required",
            });
        }
        if (error.code === "CLIENT_OWNERSHIP_CONFLICT") {
            return res.status(400).json({
                message: "This connected account already exists for another business",
            });
        }
        if (error.code === "CLIENT_DUPLICATE_KEY_CONFLICT") {
            return res.status(400).json({
                message: "This connected account already exists for your business",
            });
        }
        if (error.code === "P2002") {
            return res.status(400).json({
                message: "This connected account already exists for your business",
            });
        }
        console.error("Meta OAuth error:", error);
        return res.status(500).json({
            message: "Instagram connection failed",
        });
    }
};
exports.metaOAuthConnect = metaOAuthConnect;
/*
---------------------------------------------------
AI TRAINING UPDATE
---------------------------------------------------
*/
const updateAITraining = async (req, res) => {
    try {
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { businessInfo, pricingInfo, aiTone, faqKnowledge, salesInstructions } = req.body;
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId: business.id,
                isActive: true
            }
        });
        if (!client) {
            return res.status(404).json({
                message: "Client not found"
            });
        }
        const updatedClient = await prisma_1.default.client.update({
            where: { id },
            data: {
                businessInfo,
                pricingInfo,
                aiTone,
                faqKnowledge,
                salesInstructions
            }
        });
        return res.json({
            message: "AI training updated successfully",
            client: updatedClient
        });
    }
    catch (error) {
        console.error("AI training update error:", error);
        return res.status(500).json({
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
            return res.status(401).json({ message: "Unauthorized" });
        }
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const clients = await prisma_1.default.client.findMany({
            where: {
                businessId: business.id,
                isActive: true,
            },
            orderBy: { createdAt: "desc" },
        });
        return res.json(clients);
    }
    catch (error) {
        console.error("Fetch clients error:", error);
        return res.status(500).json({
            message: "Fetch failed",
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
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { accessToken } = req.body;
        if (!accessToken) {
            return res.status(400).json({
                message: "Access token required",
            });
        }
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId: business.id,
                isActive: true,
            },
            select: { id: true },
        });
        if (!client) {
            return res.status(404).json({
                message: "Client not found",
            });
        }
        const encryptedToken = (0, encrypt_1.encrypt)(accessToken);
        await prisma_1.default.client.update({
            where: { id },
            data: { accessToken: encryptedToken },
        });
        return res.json({
            message: "Client updated successfully",
        });
    }
    catch (error) {
        console.error("Update client error:", error);
        return res.status(500).json({
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
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId: business.id,
                isActive: true,
            },
            select: { id: true },
        });
        if (!client) {
            return res.status(404).json({
                message: "Client not found",
            });
        }
        await prisma_1.default.client.update({
            where: { id },
            data: {
                isActive: false,
                deletedAt: new Date(),
            },
        });
        return res.json({
            message: "Client deleted successfully",
        });
    }
    catch (error) {
        console.error("Delete client error:", error);
        return res.status(500).json({
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
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const business = await getBusinessByOwner(userId);
        if (!business) {
            return res.status(404).json({ message: "Business not found" });
        }
        const client = await prisma_1.default.client.findFirst({
            where: {
                id,
                businessId: business.id,
                isActive: true,
            },
        });
        if (!client) {
            return res.status(404).json({
                message: "Client not found",
            });
        }
        return res.json(client);
    }
    catch (error) {
        console.error("Fetch client error:", error);
        return res.status(500).json({
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
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const redirectUri = `${process.env.BACKEND_URL}/api/oauth/meta/callback`;
        const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${redirectUri}&scope=pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_messages,whatsapp_business_management&response_type=code&state=${userId}`;
        return res.json({ url });
    }
    catch (error) {
        console.error("Start OAuth error:", error);
        return res.status(500).json({
            message: "Failed to start OAuth",
        });
    }
};
exports.startMetaOAuth = startMetaOAuth;
