import { Request, Response } from "express";
import prisma from "../config/prisma";
import { generateAIReply } from "../services/ai.service";

interface CustomRequest extends Request {
  user?: any;
}

export const testAI = async (req: CustomRequest, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    // Get business of logged user
    const business = await prisma.business.findFirst({
      where: { ownerId: req.user.userId },
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Create dummy lead (for testing)
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        name: "Test Lead",
      },
    });

    const reply = await generateAIReply({
      businessId: business.id,
      leadId: lead.id,
      message,
    });

    res.json({
      aiReply: reply,
      leadId: lead.id,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "AI test failed",
      error: error.message,
    });
  }
};