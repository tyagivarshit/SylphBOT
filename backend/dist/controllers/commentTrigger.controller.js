"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleCommentTrigger = exports.deleteCommentTrigger = exports.updateCommentTrigger = exports.getCommentTriggers = exports.createCommentTrigger = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const plan_config_1 = require("../config/plan.config");
const tenant_service_1 = require("../services/tenant.service");
/* --------------------------------------------------- */
/* GET BUSINESS */
/* --------------------------------------------------- */
const getBusinessId = async (req) => {
    const requestBusinessId = (0, tenant_service_1.getRequestBusinessId)(req) || req.businessId;
    if (requestBusinessId) {
        return requestBusinessId;
    }
    const userId = req.user?.id;
    if (!userId) {
        return null;
    }
    const business = await prisma_1.default.business.findFirst({
        where: { ownerId: userId },
        select: { id: true },
    });
    return business?.id || null;
};
/* --------------------------------------------------- */
/* NORMALIZE KEYWORD */
/* --------------------------------------------------- */
const normalizeKeyword = (keyword) => {
    return keyword
        .toLowerCase()
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .join(",");
};
/* --------------------------------------------------- */
/* CREATE */
/* --------------------------------------------------- */
const createCommentTrigger = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                data: null,
                message: "Unauthorized",
            });
        }
        const businessId = await getBusinessId(req);
        console.log("POST /triggers hit", {
            userId,
            businessId,
        });
        if (!businessId) {
            return res.status(404).json({
                success: false,
                data: null,
                message: "Business not found",
            });
        }
        const { clientId, reelId, keyword, replyText, dmText } = req.body;
        if (!clientId || !reelId || !keyword || !replyText) {
            return res.status(400).json({
                success: false,
                data: null,
                message: "clientId, reelId, keyword, replyText required",
            });
        }
        const normalizedKeyword = normalizeKeyword(keyword);
        const client = await prisma_1.default.client.findFirst({
            where: {
                id: String(clientId),
                businessId: String(businessId),
                platform: "INSTAGRAM",
                isActive: true,
            },
        });
        if (!client)
            return res.status(404).json({
                success: false,
                data: null,
                message: "Instagram client not found",
            });
        const subscription = await prisma_1.default.subscription.findUnique({
            where: { businessId: String(businessId) },
            include: { plan: true },
        });
        const triggerCount = await prisma_1.default.commentTrigger.count({
            where: {
                businessId: String(businessId),
                clientId: String(clientId),
                isActive: true,
            },
        });
        if (!(0, plan_config_1.canCreateTrigger)(subscription?.plan || null, triggerCount)) {
            return res.status(403).json({
                success: false,
                data: null,
                message: "Trigger limit reached",
                upgradeRequired: true,
            });
        }
        const existing = await prisma_1.default.commentTrigger.findFirst({
            where: {
                businessId: String(businessId),
                clientId: String(clientId),
                reelId,
                keyword: normalizedKeyword,
            },
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                data: existing,
                message: "Trigger already exists",
            });
        }
        const trigger = await prisma_1.default.commentTrigger.create({
            data: {
                businessId: String(businessId),
                clientId: String(clientId),
                reelId,
                keyword: normalizedKeyword,
                replyText,
                dmText: dmText || null,
                isActive: true,
            },
        });
        return res.status(201).json({
            success: true,
            data: trigger,
            trigger,
        });
    }
    catch (error) {
        console.error("API ERROR:", error);
        return res.status(500).json({
            success: false,
            data: null,
            message: "Internal error",
        });
    }
};
exports.createCommentTrigger = createCommentTrigger;
/* --------------------------------------------------- */
/* GET */
/* --------------------------------------------------- */
const getCommentTriggers = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                data: [],
                message: "Unauthorized",
            });
        }
        const businessId = await getBusinessId(req);
        console.log("GET /triggers hit", {
            userId,
            businessId,
        });
        if (!businessId) {
            return res.json({
                success: true,
                data: [],
                triggers: [],
            });
        }
        const triggers = await prisma_1.default.commentTrigger.findMany({
            where: {
                businessId: String(businessId),
                isActive: true,
            },
            orderBy: { createdAt: "desc" },
        });
        return res.json({
            success: true,
            data: triggers,
            triggers,
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
exports.getCommentTriggers = getCommentTriggers;
/* --------------------------------------------------- */
/* UPDATE */
/* --------------------------------------------------- */
const updateCommentTrigger = async (req, res) => {
    try {
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        if (!id)
            return res.status(400).json({ message: "Invalid ID" });
        const businessId = await getBusinessId(req);
        if (!businessId)
            return res.status(404).json({ message: "Business not found" });
        const trigger = await prisma_1.default.commentTrigger.findFirst({
            where: { id: String(id) },
        });
        if (!trigger || String(trigger.businessId) !== String(businessId)) {
            return res.status(404).json({ message: "Trigger not found" });
        }
        const { keyword, replyText, dmText } = req.body;
        if (!keyword || !replyText) {
            return res.status(400).json({
                message: "keyword and replyText required",
            });
        }
        const updated = await prisma_1.default.commentTrigger.update({
            where: { id: String(id) },
            data: {
                keyword: normalizeKeyword(keyword),
                replyText,
                dmText: dmText || null,
            },
        });
        return res.json({ success: true, trigger: updated });
    }
    catch (error) {
        console.error("Update trigger error:", error);
        return res.status(500).json({ message: "Failed to update trigger" });
    }
};
exports.updateCommentTrigger = updateCommentTrigger;
/* --------------------------------------------------- */
/* DELETE */
/* --------------------------------------------------- */
const deleteCommentTrigger = async (req, res) => {
    try {
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        if (!id)
            return res.status(400).json({ message: "Invalid ID" });
        const businessId = await getBusinessId(req);
        if (!businessId)
            return res.status(404).json({ message: "Business not found" });
        const trigger = await prisma_1.default.commentTrigger.findFirst({
            where: { id: String(id) },
        });
        if (!trigger || String(trigger.businessId) !== String(businessId)) {
            return res.status(404).json({ message: "Trigger not found" });
        }
        await prisma_1.default.commentTrigger.update({
            where: { id: String(id) },
            data: { isActive: false },
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("Delete trigger error:", error);
        return res.status(500).json({ message: "Failed to delete trigger" });
    }
};
exports.deleteCommentTrigger = deleteCommentTrigger;
/* --------------------------------------------------- */
/* TOGGLE */
/* --------------------------------------------------- */
const toggleCommentTrigger = async (req, res) => {
    try {
        const userId = req.user?.id;
        const id = req.params.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        if (!id)
            return res.status(400).json({ message: "Invalid ID" });
        const businessId = await getBusinessId(req);
        if (!businessId)
            return res.status(404).json({ message: "Business not found" });
        const trigger = await prisma_1.default.commentTrigger.findFirst({
            where: { id: String(id) },
        });
        if (!trigger || String(trigger.businessId) !== String(businessId)) {
            return res.status(404).json({ message: "Trigger not found" });
        }
        const updated = await prisma_1.default.commentTrigger.update({
            where: { id: String(id) },
            data: { isActive: !trigger.isActive },
        });
        return res.json({ success: true, trigger: updated });
    }
    catch (error) {
        console.error("Toggle trigger error:", error);
        return res.status(500).json({ message: "Failed to toggle trigger" });
    }
};
exports.toggleCommentTrigger = toggleCommentTrigger;
