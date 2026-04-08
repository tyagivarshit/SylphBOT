"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAISettings = exports.saveAISettings = exports.getFAQs = exports.saveFAQ = exports.getBusinessInfo = exports.saveBusinessInfo = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const embedding_service_1 = require("../services/embedding.service");
const getOrCreateClient = async (businessId) => {
    let client = await prisma_1.default.client.findFirst({
        where: { businessId, isActive: true },
    });
    if (!client) {
        client = await prisma_1.default.client.create({
            data: {
                businessId,
                platform: "SYSTEM",
                accessToken: "AUTO_GENERATED",
                isActive: true,
            },
        });
        console.log("Auto-created client:", businessId);
    }
    return client;
};
const saveBusinessInfo = async (req, res) => {
    try {
        const content = req.body.content?.trim() || "";
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (!content) {
            return res.status(400).json({ message: "Content required" });
        }
        const client = await getOrCreateClient(businessId);
        await prisma_1.default.client.update({
            where: { id: client.id },
            data: { businessInfo: content },
        });
        await prisma_1.default.knowledgeBase.deleteMany({
            where: {
                businessId,
                sourceType: "SYSTEM",
                title: "BUSINESS_INFO",
            },
        });
        const chunks = content
            .split(/\.|\n/)
            .map((chunk) => chunk.trim())
            .filter((chunk) => chunk.length > 20);
        for (const chunk of chunks) {
            const embedding = await (0, embedding_service_1.createEmbedding)(chunk);
            await prisma_1.default.knowledgeBase.create({
                data: {
                    businessId,
                    title: "BUSINESS_INFO",
                    content: chunk,
                    embedding,
                    sourceType: "SYSTEM",
                    priority: "HIGH",
                    isActive: true,
                },
            });
        }
        return res.json({ message: "Business info saved" });
    }
    catch (error) {
        console.error("Business info error:", error);
        return res.status(500).json({ message: "Failed to save business info" });
    }
};
exports.saveBusinessInfo = saveBusinessInfo;
const getBusinessInfo = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const client = await prisma_1.default.client.findFirst({
            where: { businessId, isActive: true },
            select: {
                businessInfo: true,
            },
        });
        return res.json({
            content: client?.businessInfo || "",
        });
    }
    catch (error) {
        console.error("Get business info error:", error);
        return res.status(500).json({ message: "Failed to fetch business info" });
    }
};
exports.getBusinessInfo = getBusinessInfo;
const saveFAQ = async (req, res) => {
    try {
        const question = req.body.question?.trim() || "";
        const answer = req.body.answer?.trim() || "";
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (!question || !answer) {
            return res.status(400).json({ message: "Question & Answer required" });
        }
        const content = `Q: ${question}\nA: ${answer}`;
        const embedding = await (0, embedding_service_1.createEmbedding)(content);
        await prisma_1.default.knowledgeBase.create({
            data: {
                businessId,
                title: question,
                content,
                embedding,
                sourceType: "FAQ",
                priority: "HIGH",
                isActive: true,
            },
        });
        return res.json({
            id: "new",
            question,
            answer,
        });
    }
    catch (error) {
        console.error("FAQ error:", error);
        return res.status(500).json({ message: "Failed to save FAQ" });
    }
};
exports.saveFAQ = saveFAQ;
const getFAQs = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const faqs = await prisma_1.default.knowledgeBase.findMany({
            where: {
                businessId,
                sourceType: "FAQ",
                isActive: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                id: true,
                title: true,
                content: true,
            },
        });
        const formatted = faqs.map((faq) => {
            const parts = faq.content.split("\n");
            return {
                id: faq.id,
                question: faq.title,
                answer: parts[1]?.replace("A: ", "") || "",
            };
        });
        return res.json(formatted);
    }
    catch (error) {
        console.error("Get FAQs error:", error);
        return res.status(500).json({ message: "Failed to fetch FAQs" });
    }
};
exports.getFAQs = getFAQs;
const saveAISettings = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const client = await getOrCreateClient(businessId);
        await prisma_1.default.client.update({
            where: { id: client.id },
            data: {
                aiTone: req.body.aiTone,
                salesInstructions: req.body.salesInstructions,
            },
        });
        return res.json({ message: "AI settings saved" });
    }
    catch (error) {
        console.error("AI settings error:", error);
        return res.status(500).json({ message: "Failed to save AI settings" });
    }
};
exports.saveAISettings = saveAISettings;
const getAISettings = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const client = await prisma_1.default.client.findFirst({
            where: { businessId, isActive: true },
            select: {
                aiTone: true,
                salesInstructions: true,
            },
        });
        return res.json(client || {});
    }
    catch (error) {
        console.error("Get settings error:", error);
        return res.status(500).json({ message: "Failed to fetch settings" });
    }
};
exports.getAISettings = getAISettings;
