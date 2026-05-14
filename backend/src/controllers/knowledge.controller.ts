import { Response } from "express";
import prisma from "../config/prisma";
import { createEmbedding } from "../services/embedding.service";
import {
  getProjectionSnapshot,
  invalidateProjectionSnapshots,
} from "../services/projectionCoordinator.service";
import {
  getScopedTrainingClient,
  getSystemClient,
  normalizeClientId,
} from "../services/clientScope.service";
import { AuthenticatedRequest } from "../types/request";
import { getRequestAbortSignal } from "../utils/requestLifecycle";

type KnowledgeQuery = {
  clientId?: string;
};

type KnowledgeBody = {
  title?: string;
  content?: string;
  sourceUrl?: string;
  clientId?: string;
};

const KNOWLEDGE_PROJECTION_CACHE_TTL_MS = 10_000;
const KNOWLEDGE_PROJECTION_STALE_TTL_MS = 60_000;
const KNOWLEDGE_PROJECTION_WAIT_MS = 120;
const KNOWLEDGE_PROJECTION_COMPUTE_BUDGET_MS = 4_000;
const KNOWLEDGE_PROJECTION_MAX_ROWS = 300;
const KNOWLEDGE_PROJECTION_CACHE_PREFIX = "knowledge:list:v1:";

const getRequestedClientId = (
  req: AuthenticatedRequest<any, any, KnowledgeQuery>
) => normalizeClientId(req.body?.clientId || req.query?.clientId);

const getScopedKnowledgeClientId = (client: { platform?: string; id: string }) =>
  client.platform === "SYSTEM" ? null : client.id;

const hasResponseCommitted = (res: Response) =>
  res.headersSent || res.writableEnded || res.writableFinished;

const buildKnowledgeProjectionCacheKey = (
  businessId: string,
  scopedClientId: string | null
) => `${KNOWLEDGE_PROJECTION_CACHE_PREFIX}${businessId}:${scopedClientId || "shared"}`;

const buildKnowledgeProjectionBusinessPrefix = (businessId: string) =>
  `${KNOWLEDGE_PROJECTION_CACHE_PREFIX}${businessId}:`;

export const createKnowledge = async (
  req: AuthenticatedRequest<KnowledgeBody, any, KnowledgeQuery>,
  res: Response
) => {
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
    const client = await getScopedTrainingClient(businessId, requestedClientId);
    const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content required",
      });
    }

    const embedding = await createEmbedding(`${title} ${content}`);

    const knowledge = await prisma.knowledgeBase.create({
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

    invalidateProjectionSnapshots({
      prefix: buildKnowledgeProjectionBusinessPrefix(businessId),
    });

    return res.status(201).json({
      success: true,
      message: "Knowledge created successfully",
      knowledge,
    });
  } catch (error: any) {
    console.error("Create knowledge error:", error);
    if (hasResponseCommitted(res)) {
      return;
    }

    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      success: false,
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Knowledge creation failed",
    });
  }
};

export const getKnowledge = async (
  req: AuthenticatedRequest<any, any, KnowledgeQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);
    const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);

    const projection = await getProjectionSnapshot({
      cacheKey: buildKnowledgeProjectionCacheKey(
        businessId,
        scopedKnowledgeClientId
      ),
      label: "knowledge_projection",
      businessId,
      cacheTtlMs: KNOWLEDGE_PROJECTION_CACHE_TTL_MS,
      staleTtlMs: KNOWLEDGE_PROJECTION_STALE_TTL_MS,
      computeBudgetMs: KNOWLEDGE_PROJECTION_COMPUTE_BUDGET_MS,
      initialWaitMs: KNOWLEDGE_PROJECTION_WAIT_MS,
      requestSignal: getRequestAbortSignal({ req, res }),
      fallback: [] as Array<Record<string, unknown>>,
      compute: () =>
        prisma.knowledgeBase.findMany({
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
  } catch (error: any) {
    console.error("Fetch knowledge error:", error);
    if (hasResponseCommitted(res)) {
      return;
    }

    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      success: false,
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Fetch knowledge failed",
    });
  }
};

export const getSingleKnowledge = async (
  req: AuthenticatedRequest<any, { id: string }, KnowledgeQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const knowledge = await prisma.knowledgeBase.findFirst({
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
  } catch (error) {
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

export const updateKnowledge = async (
  req: AuthenticatedRequest<KnowledgeBody, { id: string }, KnowledgeQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { title, content, sourceUrl } = req.body;

    const knowledge = await prisma.knowledgeBase.findFirst({
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
      ? await getScopedTrainingClient(businessId, knowledge.clientId)
      : await getSystemClient(businessId);
    const nextScopeClient = requestedClientId
      ? await getScopedTrainingClient(businessId, requestedClientId)
      : currentScopeClient;

    let embedding = knowledge.embedding;
    if (title || content) {
      embedding = await createEmbedding(
        `${title || knowledge.title} ${content || knowledge.content}`
      );
    }

    const updatedKnowledge = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        clientId: getScopedKnowledgeClientId(nextScopeClient),
        title: title ?? knowledge.title,
        content: content ?? knowledge.content,
        sourceUrl: sourceUrl ?? knowledge.sourceUrl,
        embedding,
      },
    });

    invalidateProjectionSnapshots({
      prefix: buildKnowledgeProjectionBusinessPrefix(businessId),
    });

    return res.json({
      success: true,
      message: "Knowledge updated successfully",
      knowledge: updatedKnowledge,
    });
  } catch (error: any) {
    console.error("Update knowledge error:", error);
    if (hasResponseCommitted(res)) {
      return;
    }

    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      success: false,
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Knowledge update failed",
    });
  }
};

export const deleteKnowledge = async (
  req: AuthenticatedRequest<any, { id: string }, KnowledgeQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const knowledge = await prisma.knowledgeBase.findFirst({
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

    await prisma.knowledgeBase.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    invalidateProjectionSnapshots({
      prefix: buildKnowledgeProjectionBusinessPrefix(businessId),
    });

    return res.json({
      success: true,
      message: "Knowledge deleted successfully",
    });
  } catch (error) {
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
