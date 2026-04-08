import { Response } from "express";
import prisma from "../config/prisma";
import { createEmbedding } from "../services/embedding.service";
import { AuthenticatedRequest } from "../types/request";

type BusinessInfoBody = {
  content?: string;
};

type FAQBody = {
  question?: string;
  answer?: string;
};

type AISettingsBody = {
  aiTone?: string;
  salesInstructions?: string;
};

const getOrCreateClient = async (businessId: string) => {
  let client = await prisma.client.findFirst({
    where: { businessId, isActive: true },
  });

  if (!client) {
    client = await prisma.client.create({
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

export const saveBusinessInfo = async (
  req: AuthenticatedRequest<BusinessInfoBody>,
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

    const client = await getOrCreateClient(businessId);

    await prisma.client.update({
      where: { id: client.id },
      data: { businessInfo: content },
    });

    await prisma.knowledgeBase.deleteMany({
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
      const embedding = await createEmbedding(chunk);

      await prisma.knowledgeBase.create({
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
  } catch (error) {
    console.error("Business info error:", error);
    return res.status(500).json({ message: "Failed to save business info" });
  }
};

export const getBusinessInfo = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: { businessId, isActive: true },
      select: {
        businessInfo: true,
      },
    });

    return res.json({
      content: client?.businessInfo || "",
    });
  } catch (error) {
    console.error("Get business info error:", error);
    return res.status(500).json({ message: "Failed to fetch business info" });
  }
};

export const saveFAQ = async (
  req: AuthenticatedRequest<FAQBody>,
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

    const content = `Q: ${question}\nA: ${answer}`;
    const embedding = await createEmbedding(content);

    await prisma.knowledgeBase.create({
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
  } catch (error) {
    console.error("FAQ error:", error);
    return res.status(500).json({ message: "Failed to save FAQ" });
  }
};

export const getFAQs = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const faqs = await prisma.knowledgeBase.findMany({
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
  } catch (error) {
    console.error("Get FAQs error:", error);
    return res.status(500).json({ message: "Failed to fetch FAQs" });
  }
};

export const saveAISettings = async (
  req: AuthenticatedRequest<AISettingsBody>,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const client = await getOrCreateClient(businessId);

    await prisma.client.update({
      where: { id: client.id },
      data: {
        aiTone: req.body.aiTone,
        salesInstructions: req.body.salesInstructions,
      },
    });

    return res.json({ message: "AI settings saved" });
  } catch (error) {
    console.error("AI settings error:", error);
    return res.status(500).json({ message: "Failed to save AI settings" });
  }
};

export const getAISettings = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: { businessId, isActive: true },
      select: {
        aiTone: true,
        salesInstructions: true,
      },
    });

    return res.json(client || {});
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ message: "Failed to fetch settings" });
  }
};
