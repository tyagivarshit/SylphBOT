import { Response } from "express";
import prisma from "../config/prisma";
import { createEmbedding } from "../services/embedding.service";
import {
  getScopedTrainingClient,
  getSystemClient,
  normalizeClientId,
} from "../services/clientScope.service";
import { AuthenticatedRequest } from "../types/request";

type KnowledgeQuery = {
  clientId?: string;
};

type KnowledgeBody = {
  title?: string;
  content?: string;
  sourceUrl?: string;
  clientId?: string;
};

const getRequestedClientId = (
  req: AuthenticatedRequest<any, any, KnowledgeQuery>
) => normalizeClientId(req.body?.clientId || req.query?.clientId);

const getScopedKnowledgeClientId = (client: { platform?: string; id: string }) =>
  client.platform === "SYSTEM" ? null : client.id;

/* =====================================================
CREATE KNOWLEDGE
===================================================== */

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

    /* 🔥 EMBEDDING */
    const embedding = await createEmbedding(`${title} ${content}`);

    /* 🔥 CREATE (STRICT MANUAL KB ONLY) */
    const knowledge = await prisma.knowledgeBase.create({
      data: {
        businessId,
        clientId: scopedKnowledgeClientId,
        title,
        content,
        sourceType: "MANUAL", // 🔥 FORCE MANUAL
        sourceUrl: sourceUrl || null,
        priority: "MEDIUM",   // 🔥 DEFAULT PRIORITY
        embedding,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Knowledge created successfully",
      knowledge,
    });
  } catch (error: any) {
    console.error("Create knowledge error:", error);

    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      success: false,
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Knowledge creation failed",
    });
  }
};

/* =====================================================
GET KNOWLEDGE LIST
===================================================== */

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

    const knowledge = await prisma.knowledgeBase.findMany({
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
  } catch (error: any) {
    console.error("Fetch knowledge error:", error);

    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      success: false,
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Fetch knowledge failed",
    });
  }
};

/* =====================================================
GET SINGLE KNOWLEDGE
===================================================== */

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
  } catch (error) {
    console.error("Fetch knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Fetch knowledge failed",
    });
  }
};

/* =====================================================
UPDATE KNOWLEDGE
===================================================== */

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
      ? await getScopedTrainingClient(businessId, knowledge.clientId)
      : await getSystemClient(businessId);
    const nextScopeClient = requestedClientId
      ? await getScopedTrainingClient(businessId, requestedClientId)
      : currentScopeClient;

    /* 🔥 RE-EMBED IF CONTENT CHANGED */
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

    return res.json({
      success: true,
      message: "Knowledge updated successfully",
      knowledge: updatedKnowledge,
    });
  } catch (error: any) {
    console.error("Update knowledge error:", error);

    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      success: false,
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Knowledge update failed",
    });
  }
};

/* =====================================================
DELETE KNOWLEDGE
===================================================== */

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
    await prisma.knowledgeBase.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    return res.json({
      success: true,
      message: "Knowledge deleted successfully",
    });
  } catch (error) {
    console.error("Delete knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Knowledge delete failed",
    });
  }
};
