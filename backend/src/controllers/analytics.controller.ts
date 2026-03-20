import { Request, Response } from "express";
import * as service from "../services/analytics.service"
import prisma from "../config/prisma";

const getBusinessId = async (userId: string) => {
  const business = await prisma.business.findFirst({
    where: { ownerId: userId }
  });

  if (!business) throw new Error("Business not found");

  return business.id;
};

export const getAnalyticsOverview = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || "7d";

    const businessId = await getBusinessId(userId);

    const data = await service.getOverview(businessId, range);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Overview Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getAnalyticsCharts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const range = (req.query.range as string) || "7d";

    const businessId = await getBusinessId(userId);

    const data = await service.getCharts(businessId, range);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Charts Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getConversionFunnel = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessId = await getBusinessId(userId);

    const data = await service.getFunnel(businessId);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Funnel Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const getTopSources = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const businessId = await getBusinessId(userId);

    const data = await service.getSources(businessId);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Sources Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};