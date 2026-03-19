import { Request, Response } from "express";
import { fetchInstagramMedia } from "../services/instagram.service";
import prisma from "../config/prisma";

export const getInstagramMedia = async (
  req: Request,
  res: Response
) => {

  try {

    const userId = req.user?.id;
    const { clientId } = req.query;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    if (!clientId) {
      return res.status(400).json({
        message: "clientId required",
      });
    }

    /* BUSINESS VALIDATION */

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });

    if (!business) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    /* CLIENT VALIDATION */

    const client = await prisma.client.findFirst({
      where: {
        id: String(clientId),
        businessId: business.id,
        platform: "INSTAGRAM",
        isActive: true,
      },
    });

    if (!client) {
      return res.status(404).json({
        message: "Instagram client not found",
      });
    }

    const media = await fetchInstagramMedia(client.id);

    return res.json({
      success: true,
      data: media,
    });

  } catch (error: any) {

    console.error("Get Instagram media error:", error.message);

    return res.status(500).json({
      message: error.message || "Failed to fetch media",
    });

  }

};