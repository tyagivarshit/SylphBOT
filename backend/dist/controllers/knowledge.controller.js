"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteKnowledge = exports.updateKnowledge = exports.getSingleKnowledge = exports.getKnowledge = exports.createKnowledge = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const embedding_service_1 = require("../services/embedding.service");
const projectionCoordinator_service_1 = require("../services/projectionCoordinator.service");
const clientScope_service_1 = require("../services/clientScope.service");
const requestLifecycle_1 = require("../utils/requestLifecycle");
const KNOWLEDGE_PROJECTION_CACHE_TTL_MS = 10000;
const KNOWLEDGE_PROJECTION_STALE_TTL_MS = 60000;
const KNOWLEDGE_PROJECTION_WAIT_MS = 120;
const KNOWLEDGE_PROJECTION_COMPUTE_BUDGET_MS = 4000;
const KNOWLEDGE_PROJECTION_MAX_ROWS = 300;
const KNOWLEDGE_PROJECTION_CACHE_PREFIX = "knowledge:list:v1:";
const getRequestedClientId = (req) => (0, clientScope_service_1.normalizeClientId)(req.body?.clientId || req.query?.clientId);
const getScopedKnowledgeClientId = (client) => client.platform === "SYSTEM" ? null : client.id;
const hasResponseCommitted = (res) => res.headersSent || res.writableEnded || res.writableFinished;
const buildKnowledgeProjectionCacheKey = (businessId, scopedClientId) => `${KNOWLEDGE_PROJECTION_CACHE_PREFIX}${businessId}:${scopedClientId || "shared"}`;
const buildKnowledgeProjectionBusinessPrefix = (businessId) => `${KNOWLEDGE_PROJECTION_CACHE_PREFIX}${businessId}:`;
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
        const embedding = await (0, embedding_service_1.createEmbedding)(`${title} ${content}`);
        const knowledge = await prisma_1.default.knowledgeBase.create({
            data: {
                businessId,
                clientId: scopedKnowledgeClientId,
                title,
                content,
                sourceType: "MANUAL",
                sourceUrl: sourceUrl || null,
                priority: "MEDIUM",
                embedding,
                isActive: true,
            },
        });
        (0, projectionCoordinator_service_1.invalidateProjectionSnapshots)({
            prefix: buildKnowledgeProjectionBusinessPrefix(businessId),
        });
        return res.status(201).json({
            success: true,
            message: "Knowledge created successfully",
            knowledge,
        });
    }
    catch (error) {
        console.error("Create knowledge error:", error);
        if (hasResponseCommitted(res)) {
            return;
        }
        return res.status(error?.message === "Client not found" ? 404 : 500).json({
            success: false,
            message: error?.message === "Client not found"
                ? "Client not found"
                : "Knowledge creation failed",
        });
    }
};
exports.createKnowledge = createKnowledge;
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
        const projection = await (0, projectionCoordinator_service_1.getProjectionSnapshot)({
            cacheKey: buildKnowledgeProjectionCacheKey(businessId, scopedKnowledgeClientId),
            label: "knowledge_projection",
            businessId,
            cacheTtlMs: KNOWLEDGE_PROJECTION_CACHE_TTL_MS,
            staleTtlMs: KNOWLEDGE_PROJECTION_STALE_TTL_MS,
            computeBudgetMs: KNOWLEDGE_PROJECTION_COMPUTE_BUDGET_MS,
            initialWaitMs: KNOWLEDGE_PROJECTION_WAIT_MS,
            requestSignal: (0, requestLifecycle_1.getRequestAbortSignal)({ req, res }),
            fallback: [],
            compute: () => prisma_1.default.knowledgeBase.findMany({
                where: {
                    businessId,
                    clientId: scopedKnowledgeClientId,
                    sourceType: "MANUAL",
                    isActive: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
                take: KNOWLEDGE_PROJECTION_MAX_ROWS,
                select: {
                    id: true,
                    businessId: true,
                    clientId: true,
                    title: true,
                    content: true,
                    sourceType: true,
                    sourceUrl: true,
                    priority: true,
                    reinforcementScore: true,
                    retrievalCount: true,
                    successCount: true,
                    lastRetrievedAt: true,
                    lastReinforcedAt: true,
                    isActive: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
        });
        console.info("KNOWLEDGE_PROJECTION_READY", {
            businessId,
            clientId: scopedKnowledgeClientId,
            source: projection.meta.source,
            stale: projection.meta.stale,
            deduped: projection.meta.deduped,
            cancelled: projection.meta.cancelled,
            budgetExceeded: projection.meta.budgetExceeded,
            count: Array.isArray(projection.value) ? projection.value.length : 0,
        });
        return res.json({
            success: true,
            knowledge: projection.value,
        });
    }
    catch (error) {
        console.error("Fetch knowledge error:", error);
        if (hasResponseCommitted(res)) {
            return;
        }
        return res.status(error?.message === "Client not found" ? 404 : 500).json({
            success: false,
            message: error?.message === "Client not found"
                ? "Client not found"
                : "Fetch knowledge failed",
        });
    }
};
exports.getKnowledge = getKnowledge;
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
                sourceType: "MANUAL",
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
        if (hasResponseCommitted(res)) {
            return;
        }
        return res.status(500).json({
            success: false,
            message: "Fetch knowledge failed",
        });
    }
};
exports.getSingleKnowledge = getSingleKnowledge;
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
                sourceType: "MANUAL",
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
        (0, projectionCoordinator_service_1.invalidateProjectionSnapshots)({
            prefix: buildKnowledgeProjectionBusinessPrefix(businessId),
        });
        return res.json({
            success: true,
            message: "Knowledge updated successfully",
            knowledge: updatedKnowledge,
        });
    }
    catch (error) {
        console.error("Update knowledge error:", error);
        if (hasResponseCommitted(res)) {
            return;
        }
        return res.status(error?.message === "Client not found" ? 404 : 500).json({
            success: false,
            message: error?.message === "Client not found"
                ? "Client not found"
                : "Knowledge update failed",
        });
    }
};
exports.updateKnowledge = updateKnowledge;
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
                sourceType: "MANUAL",
                isActive: true,
            },
        });
        if (!knowledge) {
            return res.status(404).json({
                success: false,
                message: "Knowledge not found",
            });
        }
        await prisma_1.default.knowledgeBase.update({
            where: { id },
            data: {
                isActive: false,
            },
        });
        (0, projectionCoordinator_service_1.invalidateProjectionSnapshots)({
            prefix: buildKnowledgeProjectionBusinessPrefix(businessId),
        });
        return res.json({
            success: true,
            message: "Knowledge deleted successfully",
        });
    }
    catch (error) {
        console.error("Delete knowledge error:", error);
        if (hasResponseCommitted(res)) {
            return;
        }
        return res.status(500).json({
            success: false,
            message: "Knowledge delete failed",
        });
    }
};
exports.deleteKnowledge = deleteKnowledge;
