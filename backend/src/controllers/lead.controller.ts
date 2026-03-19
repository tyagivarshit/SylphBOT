import { Request, Response } from "express";
import prisma from "../config/prisma";

export const toggleHumanControl = async (req: Request, res: Response) => {
  try {

    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: "leadId required",
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: "Lead not found",
      });
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        isHumanActive: !lead.isHumanActive
      }
    });

    return res.json({
      success: true,
      isHumanActive: updated.isHumanActive
    });

  } catch (error) {
    console.error("Toggle human error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle mode"
    });
  }
};