import { Request, Response } from "express";
import prisma from "../config/prisma";

export const createAutomationFlow = async (
  req: Request,
  res: Response
) => {

  try {

    const { businessId, name, triggerValue } = req.body;

    const flow = await prisma.automationFlow.create({
      data: {
        businessId,
        name,
        channel: "INSTAGRAM",
        triggerType: "KEYWORD",
        triggerValue,
      },
    });

    return res.json(flow);

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: "Failed to create flow",
    });

  }

};

export const getFlows = async (
  req: Request,
  res: Response
) => {

  const { businessId } = req.query;

  const flows = await prisma.automationFlow.findMany({
    where: { businessId: String(businessId) },
  });

  res.json(flows);

};