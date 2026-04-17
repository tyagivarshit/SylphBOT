"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteKnowledge = exports.updateKnowledge = exports.getSingleKnowledge = exports.getKnowledge = exports.createKnowledge = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const embedding_service_1 = require("../services/embedding.service");
const clientScope_service_1 = require("../services/clientScope.service");
const getRequestedClientId = (req) => (0, clientScope_service_1.normalizeClientId)(req.body?.clientId || req.query?.clientId);
const getScopedKnowledgeClientId = (client) => client.platform === "SYSTEM" ? null : client.id;
/* =====================================================
CREATE KNOWLEDGE
===================================================== */
const createKnowledge = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const { title, content, sourceUrl } = req.body;
        const requestedClientId = getRequestedClientId(req);
        const client = await (0, clientScope_service_1.getScopedTrainingClient)(businessId, requestedClientId);
        const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: "Title and content required",
            });
        }
        /* 🔥 EMBEDDING */
        const embedding = await (0, embedding_service_1.createEmbedding)(`${title} ${content}`);
        /* 🔥 CREATE (STRICT MANUAL KB ONLY) */
        const knowledge = await prisma_1.default.knowledgeBase.create({
            data: {
                businessId,
                clientId: scopedKnowledgeClientId,
                title,
                content,
                sourceType: "MANUAL", // 🔥 FORCE MANUAL
                sourceUrl: sourceUrl || null,
                priority: "MEDIUM", // 🔥 DEFAULT PRIORITY
                embedding,
                isActive: true,
            },
        });
        return res.status(201).json({
            success: true,
            message: "Knowledge created successfully",
            knowledge,
        });
    }
    catch (error) {
        console.error("Create knowledge error:", error);
        return res.status(error?.message === "Client not found" ? 404 : 500).json({
            success: false,
            message: error?.message === "Client not found"
                ? "Client not found"
                : "Knowledge creation failed",
        });
    }
};
exports.createKnowledge = createKnowledge;
/* =====================================================
GET KNOWLEDGE LIST
===================================================== */
const getKnowledge = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const requestedClientId = getRequestedClientId(req);
        const client = await (0, clientScope_service_1.getScopedTrainingClient)(businessId, requestedClientId);
        const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);
        const knowledge = await prisma_1.default.knowledgeBase.findMany({
            where: {
                businessId,
                clientId: scopedKnowledgeClientId,
                sourceType: "MANUAL", // 🔥 FILTER
                isActive: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return res.json({
            success: true,
            knowledge,
        });
    }
    catch (error) {
        console.error("Fetch knowledge error:", error);
        return res.status(error?.message === "Client not found" ? 404 : 500).json({
            success: false,
            message: error?.message === "Client not found"
                ? "Client not found"
                : "Fetch knowledge failed",
        });
    }
};
exports.getKnowledge = getKnowledge;
/* =====================================================
GET SINGLE KNOWLEDGE
===================================================== */
const getSingleKnowledge = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const knowledge = await prisma_1.default.knowledgeBase.findFirst({
            where: {
                id,
                businessId,
                sourceType: "MANUAL", // 🔥 SAFE FILTER
                isActive: true,
            },
        });
        if (!knowledge) {
            return res.status(404).json({
                success: false,
                message: "Knowledge not found",
            });
        }
        return res.json({
            success: true,
            knowledge,
        });
    }
    catch (error) {
        console.error("Fetch knowledge error:", error);
        return res.status(500).json({
            success: false,
            message: "Fetch knowledge failed",
        });
    }
};
exports.getSingleKnowledge = getSingleKnowledge;
/* =====================================================
UPDATE KNOWLEDGE
===================================================== */
const updateKnowledge = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const { title, content, sourceUrl } = req.body;
        const knowledge = await prisma_1.default.knowledgeBase.findFirst({
            where: {
                id,
                businessId,
                sourceType: "MANUAL", // 🔥 SAFE
                isActive: true,
            },
        });
        if (!knowledge) {
            return res.status(404).json({
                success: false,
                message: "Knowledge not found",
            });
        }
        const requestedClientId = getRequestedClientId(req);
        const currentScopeClient = knowledge.clientId
            ? await (0, clientScope_service_1.getScopedTrainingClient)(businessId, knowledge.clientId)
            : await (0, clientScope_service_1.getSystemClient)(businessId);
        const nextScopeClient = requestedClientId
            ? await (0, clientScope_service_1.getScopedTrainingClient)(businessId, requestedClientId)
            : currentScopeClient;
        /* 🔥 RE-EMBED IF CONTENT CHANGED */
        let embedding = knowledge.embedding;
        if (title || content) {
            embedding = await (0, embedding_service_1.createEmbedding)(`${title || knowledge.title} ${content || knowledge.content}`);
        }
        const updatedKnowledge = await prisma_1.default.knowledgeBase.update({
            where: { id },
            data: {
                clientId: getScopedKnowledgeClientId(nextScopeClient),
                title: title ?? knowledge.title,
                content: content ?? knowledge.content,
                sourceUrl: sourceUrl ?? knowledge.sourceUrl,
                embedding,
            },
        });
        return res.json({
            success: true,
            message: "Knowledge updated successfully",
            knowledge: updatedKnowledge,
        });
    }
    catch (error) {
        console.error("Update knowledge error:", error);
        return res.status(error?.message === "Client not found" ? 404 : 500).json({
            success: false,
            message: error?.message === "Client not found"
                ? "Client not found"
                : "Knowledge update failed",
        });
    }
};
exports.updateKnowledge = updateKnowledge;
/* =====================================================
DELETE KNOWLEDGE
===================================================== */
const deleteKnowledge = async (req, res) => {
    try {
        const businessId = req.user?.businessId;
        const id = req.params.id;
        if (!businessId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }
        const knowledge = await prisma_1.default.knowledgeBase.findFirst({
            where: {
                id,
                businessId,
                sourceType: "MANUAL", // 🔥 SAFE
                isActive: true,
            },
        });
        if (!knowledge) {
            return res.status(404).json({
                success: false,
                message: "Knowledge not found",
            });
        }
        /* 🔥 SOFT DELETE */
        await prisma_1.default.knowledgeBase.update({
            where: { id },
            data: {
                isActive: false,
            },
        });
        return res.json({
            success: true,
            message: "Knowledge deleted successfully",
        });
    }
    catch (error) {
        console.error("Delete knowledge error:", error);
        return res.status(500).json({
            success: false,
            message: "Knowledge delete failed",
        });
    }
};
exports.deleteKnowledge = deleteKnowledge;
