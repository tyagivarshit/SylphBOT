import { Request, Response } from "express";
import prisma from "../config/prisma";
import { generateAIReply } from "../services/ai.service";

interface CustomRequest extends Request {
  user?: any;
}

export const testAI = async (req: CustomRequest, res: Response) => {
  try {

    const { message } = req.body;

    // Message validation
    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    // Get logged user id safely
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get business of logged user
    const business = await prisma.business.findFirst({
      where: {
        ownerId: userId
      }
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Create dummy lead (schema requires platform)
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        name: "Test Lead",
        platform: "TEST"
      }
    });

    // Generate AI reply
    const reply = await generateAIReply({
      businessId: business.id,
      leadId: lead.id,
      message
    });

    // Return response
    return res.json({
      aiReply: reply,
      leadId: lead.id
    });

  } catch (error: any) {

    console.error("AI Test Error:", error);

    return res.status(500).json({
      message: "AI test failed",
      error: error.message
    });

  }
};