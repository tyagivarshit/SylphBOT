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

    /* 🔥 SAVE IN CLIENT */
    await prisma.client.update({
      where: { id: client.id },
      data: { businessInfo: content }
    });

    /* 🔥 DELETE OLD */
    await prisma.knowledgeBase.deleteMany({
      where: {
        businessId,
        sourceType: "SYSTEM",
        title: "BUSINESS_INFO"
      }
    });

    /* 🔥 CHUNKING */
    const chunks = content
      .split(/\.|\n/)
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 20);

    for (const chunk of chunks) {
      const embedding = await createEmbedding(chunk);

      await prisma.knowledgeBase.create({
        data: {
          businessId,
          title: "BUSINESS_INFO",
          content: chunk,
          embedding,
          sourceType: "SYSTEM",   // ✅ NEW
          priority: "HIGH",       // ✅ IMPORTANT
          isActive: true
        }
      });
    }

    return res.json({ message: "Business info saved" });

  } catch (error) {
    console.error("Business info error:", error);
    return res.status(500).json({ message: "Failed to save business info" });
  }
};

/* ================= GET BUSINESS INFO ================= */

export const getBusinessInfo = async (req: CustomRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: { businessId, isActive: true },
      select: {
        businessInfo: true
      }
    });

    return res.json({
      content: client?.businessInfo || ""
    });

  } catch (error) {
    console.error("Get business info error:", error);
    return res.status(500).json({ message: "Failed to fetch business info" });
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
        sourceType: "FAQ",  // ✅ NEW
        priority: "HIGH",     // ✅ FAQ important hota hai
        isActive: true
      }
    });

    return res.json({
      id: "new",
      question,
      answer
    });

  } catch (error) {
    console.error("FAQ error:", error);
    return res.status(500).json({ message: "Failed to save FAQ" });
  }
};

/* ================= GET FAQs ================= */

export const getFAQs = async (req: CustomRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const faqs = await prisma.knowledgeBase.findMany({
      where: {
        businessId,
        sourceType: "FAQ",
        isActive: true
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        title: true,
        content: true
      }
    });

    const formatted = faqs.map(faq => {
      const parts = faq.content.split("\n");
      return {
        id: faq.id,
        question: faq.title,
        answer: parts[1]?.replace("A: ", "") || ""
      };
    });

    return res.json(formatted);

  } catch (error) {
    console.error("Get FAQs error:", error);
    return res.status(500).json({ message: "Failed to fetch FAQs" });
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

/* ================= GET AI SETTINGS ================= */

export const getAISettings = async (req: CustomRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;

    if (!businessId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const client = await prisma.client.findFirst({
      where: { businessId, isActive: true },
      select: {
        aiTone: true,
        salesInstructions: true
      }
    });

    return res.json(client || {});

  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ message: "Failed to fetch settings" });
  }
};