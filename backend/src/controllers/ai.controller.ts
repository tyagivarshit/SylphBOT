import { Response } from "express";
import prisma from "../config/prisma";
import { generateAIReply } from "../services/ai.service";
import { AuthenticatedRequest } from "../types/request";

type TestAIBody = {
  message?: string;
};

const normalizeMessage = (message?: string) => message?.trim() || "";

export const testAI = async (
  req: AuthenticatedRequest<TestAIBody>,
  res: Response
) => {
  try {
    const message = normalizeMessage(req.body.message);

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await prisma.business.findFirst({
      where: {
        ownerId: userId,
      },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        name: "Test Lead",
        platform: "TEST",
      },
    });

    const reply = await generateAIReply({
      businessId: business.id,
      leadId: lead.id,
      message,
    });

    return res.json({
      success: true,
      aiReply: reply,
      leadId: lead.id,
    });
  } catch (error: any) {
    console.error("AI Test Error:", error);

    return res.status(500).json({
      success: false,
      message: "AI test failed",
      error: error.message,
    });
  }
};
