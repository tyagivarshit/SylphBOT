import { Request, Response } from "express";
import prisma from "../config/prisma";
import { createEmbedding } from "../services/embedding.service";

interface CustomRequest extends Request {
  user?: any;
}

/* ================= HELPER ================= */

const getOrCreateClient = async (businessId: string) => {

  let client = await prisma.client.findFirst({
    where: { businessId, isActive: true }
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        businessId,
        platform: "SYSTEM",
        accessToken: "AUTO_GENERATED",
        isActive: true
      }
    });

    console.log("✅ Auto-created client:", businessId);
  }

  return client;
};

/* ================= BUSINESS INFO ================= */

export const saveBusinessInfo = async (req: CustomRequest, res: Response) => {
  try {
    const { content } = req.body;
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Content required" });
    }

    const client = await getOrCreateClient(businessId);

    await prisma.client.update({
      where: { id: client.id },
      data: { businessInfo: content }
    });

    return res.json({ message: "Business info saved" });

  } catch (error) {
    console.error("Business info error:", error);
    return res.status(500).json({ message: "Failed to save business info" });
  }
};

/* ================= FAQ ================= */

export const saveFAQ = async (req: CustomRequest, res: Response) => {
  try {
    const { question, answer } = req.body;
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
        sourceType: "FAQ"
      }
    });

    return res.json({ message: "FAQ saved" });

  } catch (error) {
    console.error("FAQ error:", error);
    return res.status(500).json({ message: "Failed to save FAQ" });
  }
};

/* ================= AI SETTINGS ================= */

export const saveAISettings = async (req: CustomRequest, res: Response) => {
  try {
    const { aiTone, salesInstructions } = req.body;
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const client = await getOrCreateClient(businessId);

    await prisma.client.update({
      where: { id: client.id },
      data: {
        aiTone,
        salesInstructions
      }
    });

    return res.json({ message: "AI settings saved" });

  } catch (error) {
    console.error("AI settings error:", error);
    return res.status(500).json({ message: "Failed to save AI settings" });
  }
};