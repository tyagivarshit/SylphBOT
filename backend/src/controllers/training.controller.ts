import { Response } from "express";
import prisma from "../config/prisma";
import { createEmbedding } from "../services/embedding.service";
import {
  getScopedTrainingClient,
  normalizeClientId,
} from "../services/clientScope.service";
import { AuthenticatedRequest } from "../types/request";

type TrainingQuery = {
  clientId?: string;
};

type BusinessInfoBody = {
  content?: string;
  clientId?: string;
};

type FAQBody = {
  question?: string;
  answer?: string;
  clientId?: string;
};

type AISettingsBody = {
  aiTone?: string;
  salesInstructions?: string;
  clientId?: string;
};

const getScopedKnowledgeClientId = (client: { platform?: string; id: string }) =>
  client.platform === "SYSTEM" ? null : client.id;

const syncScopedFAQKnowledge = async ({
  businessId,
  clientId,
}: {
  businessId: string;
  clientId: string | null;
}) => {
  const scopeClient = await getScopedTrainingClient(businessId, clientId);
  const scopedKnowledgeClientId = getScopedKnowledgeClientId(scopeClient);

  const faqs = await prisma.knowledgeBase.findMany({
    where: {
      businessId,
      clientId: scopedKnowledgeClientId,
      sourceType: "FAQ",
      isActive: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      content: true,
    },
  });

  await prisma.client.update({
    where: {
      id: scopeClient.id,
    },
    data: {
      faqKnowledge:
        faqs.length > 0 ? faqs.map((item) => item.content).join("\n\n") : null,
    },
  });
};

const getRequestedClientId = (
  req: AuthenticatedRequest<any, any, TrainingQuery>
) => normalizeClientId(req.body?.clientId || req.query?.clientId);

export const saveBusinessInfo = async (
  req: AuthenticatedRequest<BusinessInfoBody, any, TrainingQuery>,
  res: Response
) => {
  try {
    const content = req.body.content?.trim() || "";
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!content) {
      return res.status(400).json({ message: "Content required" });
    }

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);
    const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);

    await prisma.client.update({
      where: { id: client.id },
      data: { businessInfo: content },
    });

    await prisma.knowledgeBase.deleteMany({
      where: {
        businessId,
        clientId: scopedKnowledgeClientId,
        sourceType: "SYSTEM",
        title: "BUSINESS_INFO",
      },
    });

    const chunks = content
      .split(/\.|\n/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 20);

    for (const chunk of chunks) {
      const embedding = await createEmbedding(chunk);

      await prisma.knowledgeBase.create({
        data: {
          businessId,
          clientId: scopedKnowledgeClientId,
          title: "BUSINESS_INFO",
          content: chunk,
          embedding,
          sourceType: "SYSTEM",
          priority: "HIGH",
          isActive: true,
        },
      });
    }

    return res.json({
      message: "Business info saved",
      clientId: requestedClientId,
    });
  } catch (error: any) {
    console.error("Business info error:", error);
    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Failed to save business info",
    });
  }
};

export const getBusinessInfo = async (
  req: AuthenticatedRequest<any, any, TrainingQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);

    return res.json({
      content: client?.businessInfo || "",
      clientId: requestedClientId,
    });
  } catch (error: any) {
    console.error("Get business info error:", error);
    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Failed to fetch business info",
    });
  }
};

export const saveFAQ = async (
  req: AuthenticatedRequest<FAQBody, any, TrainingQuery>,
  res: Response
) => {
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

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);
    const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);

    const content = `Q: ${question}\nA: ${answer}`;
    const embedding = await createEmbedding(content);

    const faq = await prisma.knowledgeBase.create({
      data: {
        businessId,
        clientId: scopedKnowledgeClientId,
        title: question,
        content,
        embedding,
        sourceType: "FAQ",
        priority: "HIGH",
        isActive: true,
      },
    });

    await syncScopedFAQKnowledge({
      businessId,
      clientId: requestedClientId,
    });

    return res.json({
      id: faq.id,
      question,
      answer,
      clientId: requestedClientId,
    });
  } catch (error: any) {
    console.error("FAQ error:", error);
    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Failed to save FAQ",
    });
  }
};

export const getFAQs = async (
  req: AuthenticatedRequest<any, any, TrainingQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);
    const scopedKnowledgeClientId = getScopedKnowledgeClientId(client);

    const faqs = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        clientId: scopedKnowledgeClientId,
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
        clientId: requestedClientId,
      };
    });

    return res.json(formatted);
  } catch (error: any) {
    console.error("Get FAQs error:", error);
    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Failed to fetch FAQs",
    });
  }
};

export const saveAISettings = async (
  req: AuthenticatedRequest<AISettingsBody, any, TrainingQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);

    await prisma.client.update({
      where: { id: client.id },
      data: {
        aiTone: req.body.aiTone,
        salesInstructions: req.body.salesInstructions,
      },
    });

    return res.json({
      message: "AI settings saved",
      clientId: requestedClientId,
    });
  } catch (error: any) {
    console.error("AI settings error:", error);
    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Failed to save AI settings",
    });
  }
};

export const getAISettings = async (
  req: AuthenticatedRequest<any, any, TrainingQuery>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const requestedClientId = getRequestedClientId(req);
    const client = await getScopedTrainingClient(businessId, requestedClientId);

    return res.json({
      aiTone: client.aiTone || null,
      salesInstructions: client.salesInstructions || null,
      clientId: requestedClientId,
    });
  } catch (error: any) {
    console.error("Get settings error:", error);
    return res.status(error?.message === "Client not found" ? 404 : 500).json({
      message:
        error?.message === "Client not found"
          ? "Client not found"
          : "Failed to fetch settings",
    });
  }
};
