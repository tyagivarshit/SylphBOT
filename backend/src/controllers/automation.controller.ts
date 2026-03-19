import { Request, Response } from "express";
import prisma from "../config/prisma";

/* ---------------- CREATE FLOW ---------------- */

export const createAutomationFlow = async (
  req: Request,
  res: Response
) => {

  try {

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    /* GET BUSINESS */

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (!business) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const { name, triggerValue } = req.body;

    if (!name || !triggerValue) {
      return res.status(400).json({
        message: "name and triggerValue required",
      });
    }

    const flow = await prisma.automationFlow.create({
      data: {
        businessId: business.id,
        name,
        channel: "INSTAGRAM",
        triggerType: "KEYWORD",
        triggerValue: triggerValue.toLowerCase().trim(),
        status: "ACTIVE", // ✅ FIX
      },
    });

    return res.status(201).json({
      success: true,
      flow,
    });

  } catch (error) {

    console.error("Create flow error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create flow",
    });

  }

};

/* ---------------- GET FLOWS ---------------- */

export const getFlows = async (
  req: Request,
  res: Response
) => {

  try {

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (!business) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const flows = await prisma.automationFlow.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(flows);

  } catch (error) {

    console.error("Fetch flows error:", error);

    return res.status(500).json({
      message: "Failed to fetch flows",
    });

  }

};