import { Request, Response } from "express";
import prisma from "../config/prisma";
import { createEmbedding } from "../services/embedding.service";

/* =====================================================
CREATE KNOWLEDGE
===================================================== */

export const createKnowledge = async (req: Request, res: Response) => {

  try {

    const businessId = (req as any).user?.businessId;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const {
      title,
      content,
      sourceType,
      sourceUrl
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content required"
      });
    }

    /* GENERATE EMBEDDING */

    const embedding = await createEmbedding(
      `${title} ${content}`
    );

    const knowledge = await prisma.knowledgeBase.create({
      data: {
        businessId,
        title,
        content,
        sourceType: sourceType || "MANUAL",
        sourceUrl: sourceUrl || null,
        embedding,
        isActive: true
      }
    });

    return res.status(201).json({
      success: true,
      message: "Knowledge created successfully",
      knowledge
    });

  } catch (error) {

    console.error("Create knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Knowledge creation failed"
    });

  }

};


/* =====================================================
GET KNOWLEDGE LIST
===================================================== */

export const getKnowledge = async (req: Request, res: Response) => {

  try {

    const businessId = (req as any).user?.businessId;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const knowledge = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        isActive: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json({
      success: true,
      knowledge
    });

  } catch (error) {

    console.error("Fetch knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Fetch knowledge failed"
    });

  }

};


/* =====================================================
GET SINGLE KNOWLEDGE
===================================================== */

export const getSingleKnowledge = async (req: Request, res: Response) => {

  try {

    const businessId = (req as any).user?.businessId;
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const knowledge = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        isActive: true
      }
    });

    if (!knowledge) {
      return res.status(404).json({
        success: false,
        message: "Knowledge not found"
      });
    }

    return res.json({
      success: true,
      knowledge
    });

  } catch (error) {

    console.error("Fetch knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Fetch knowledge failed"
    });

  }

};


/* =====================================================
UPDATE KNOWLEDGE
===================================================== */

export const updateKnowledge = async (req: Request, res: Response) => {

  try {

    const businessId = (req as any).user?.businessId;
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const {
      title,
      content,
      sourceType,
      sourceUrl
    } = req.body;

    const knowledge = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        isActive: true
      }
    });

    if (!knowledge) {
      return res.status(404).json({
        success: false,
        message: "Knowledge not found"
      });
    }

    /* UPDATE EMBEDDING IF CONTENT CHANGED */

    let embedding = knowledge.embedding;

    if (title || content) {

      embedding = await createEmbedding(
        `${title || knowledge.title} ${content || knowledge.content}`
      );

    }

    const updatedKnowledge = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        title: title ?? knowledge.title,
        content: content ?? knowledge.content,
        sourceType: sourceType ?? knowledge.sourceType,
        sourceUrl: sourceUrl ?? knowledge.sourceUrl,
        embedding
      }
    });

    return res.json({
      success: true,
      message: "Knowledge updated successfully",
      knowledge: updatedKnowledge
    });

  } catch (error) {

    console.error("Update knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Knowledge update failed"
    });

  }

};


/* =====================================================
DELETE KNOWLEDGE
===================================================== */

export const deleteKnowledge = async (req: Request, res: Response) => {

  try {

    const businessId = (req as any).user?.businessId;
    const id = req.params.id as string;

    if (!businessId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const knowledge = await prisma.knowledgeBase.findFirst({
      where: {
        id,
        businessId,
        isActive: true
      }
    });

    if (!knowledge) {
      return res.status(404).json({
        success: false,
        message: "Knowledge not found"
      });
    }

    await prisma.knowledgeBase.update({
      where: { id },
      data: {
        isActive: false
      }
    });

    return res.json({
      success: true,
      message: "Knowledge deleted successfully"
    });

  } catch (error) {

    console.error("Delete knowledge error:", error);

    return res.status(500).json({
      success: false,
      message: "Knowledge delete failed"
    });

  }

};