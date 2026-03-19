import { Request, Response } from "express";
import prisma from "../config/prisma";
import { generateAIReply } from "../services/ai.service";

interface CustomRequest extends Request {
  user?: any;
}

export const testAI = async (req: CustomRequest, res: Response) => {
  try {

    const { message } = req.body;

    /* ================= VALIDATION ================= */

    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message required" });
    }

    const userId = req.user?.id; // ✅ FIXED

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    /* ================= BUSINESS FETCH ================= */

    const business = await prisma.business.findFirst({
      where: {
        ownerId: userId
      }
    });

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    /* ================= CREATE TEST LEAD ================= */

    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        name: "Test Lead",
        platform: "TEST"
      }
    });

    /* ================= GENERATE AI ================= */

    const reply = await generateAIReply({
      businessId: business.id,
      leadId: lead.id,
      message
    });

    /* ================= RESPONSE ================= */

    return res.json({
      success: true,
      aiReply: reply,
      leadId: lead.id
    });

  } catch (error: any) {

    console.error("🚨 AI Test Error:", error);

    return res.status(500).json({
      success: false,
      message: "AI test failed",
      error: error.message
    });

  }
};