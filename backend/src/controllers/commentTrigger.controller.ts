import { Request, Response } from "express";
import prisma from "../config/prisma";

/* ---------------------------------------------------
HELPER
--------------------------------------------------- */

const getBusinessId = async (userId: string) => {

  const business = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  });

  return business?.id || null;
};

/* ---------------------------------------------------
CREATE TRIGGER
--------------------------------------------------- */

export const createCommentTrigger = async (
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

    const businessId = await getBusinessId(userId);

    if (!businessId) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const { clientId, reelId, keyword, replyText } = req.body;

    if (!clientId || !reelId || !keyword || !replyText) {
      return res.status(400).json({
        message: "clientId, reelId, keyword, replyText required",
      });
    }

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        businessId,
        platform: "INSTAGRAM",
        isActive: true,
      },
    });

    if (!client) {
      return res.status(404).json({
        message: "Instagram client not found",
      });
    }

    const trigger = await prisma.commentTrigger.create({
      data: {
        businessId,
        clientId,
        reelId,
        keyword: keyword.toLowerCase().trim(),
        replyText,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      trigger,
    });

  } catch (error) {

    console.error("Create comment trigger error:", error);

    return res.status(500).json({
      message: "Failed to create trigger",
    });

  }

};

/* ---------------------------------------------------
GET TRIGGERS
--------------------------------------------------- */

export const getCommentTriggers = async (
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

    const businessId = await getBusinessId(userId);

    if (!businessId) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const triggers = await prisma.commentTrigger.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(triggers);

  } catch (error) {

    console.error("Fetch triggers error:", error);

    return res.status(500).json({
      message: "Failed to fetch triggers",
    });

  }

};

/* ---------------------------------------------------
DELETE TRIGGER
--------------------------------------------------- */

export const deleteCommentTrigger = async (
  req: Request,
  res: Response
) => {

  try {

    const userId = req.user?.id;
    const id = req.params.id as string;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const businessId = await getBusinessId(userId);

    if (!businessId) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const trigger = await prisma.commentTrigger.findFirst({
      where: {
        id,
        businessId,
      },
    });

    if (!trigger) {
      return res.status(404).json({
        message: "Trigger not found",
      });
    }

    await prisma.commentTrigger.update({
      where: { id },
      data: {
        isActive: false,
      },
    });

    return res.json({
      success: true,
      message: "Trigger deleted",
    });

  } catch (error) {

    console.error("Delete trigger error:", error);

    return res.status(500).json({
      message: "Failed to delete trigger",
    });

  }

};