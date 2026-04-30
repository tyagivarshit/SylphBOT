import { Request, Response } from "express";
import prisma from "../config/prisma";
import { canCreateTrigger } from "../config/plan.config";
import { getRequestBusinessId } from "../services/tenant.service";
import { getCanonicalSubscriptionSnapshot } from "../services/subscriptionAuthority.service";

/* --------------------------------------------------- */
/* GET BUSINESS */
/* --------------------------------------------------- */

const getBusinessId = async (req: Request) => {
  const requestBusinessId = getRequestBusinessId(req) || req.businessId;

  if (requestBusinessId) {
    return requestBusinessId;
  }

  const userId = req.user?.id;

  if (!userId) {
    return null;
  }

  const business = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  });

  return business?.id || null;
};

/* --------------------------------------------------- */
/* NORMALIZE KEYWORD */
/* --------------------------------------------------- */

const normalizeKeyword = (keyword: string) => {
  return keyword
    .toLowerCase()
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .join(",");
};

/* --------------------------------------------------- */
/* CREATE */
/* --------------------------------------------------- */

export const createCommentTrigger = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Unauthorized",
      });
    }

    const businessId = await getBusinessId(req);

    console.log("POST /triggers hit", {
      userId,
      businessId,
    });

    if (!businessId) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Business not found",
      });
    }

    const { clientId, reelId, keyword, replyText, dmText, aiPrompt } = req.body;

    if (!clientId || !reelId || !keyword || !replyText) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "clientId, reelId, keyword, replyText required",
      });
    }

    const normalizedKeyword = normalizeKeyword(keyword);

    const client = await prisma.client.findFirst({
      where: {
        id: String(clientId),
        businessId: String(businessId),
        platform: "INSTAGRAM",
        isActive: true,
      },
    });

    if (!client)
      return res.status(404).json({
        success: false,
        data: null,
        message: "Instagram client not found",
      });

    const subscription = await getCanonicalSubscriptionSnapshot(String(businessId));

    const triggerCount = await prisma.commentTrigger.count({
      where: {
        businessId: String(businessId),
        clientId: String(clientId),
        isActive: true,
      },
    });

    if (!canCreateTrigger(subscription?.plan || null, triggerCount)) {
      return res.status(403).json({
        success: false,
        data: null,
        message: "Trigger limit reached",
        upgradeRequired: true,
      });
    }

    const existing = await prisma.commentTrigger.findFirst({
      where: {
        businessId: String(businessId),
        clientId: String(clientId),
        reelId,
        keyword: normalizedKeyword,
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        data: existing,
        message: "Trigger already exists",
      });
    }

    const trigger = await prisma.commentTrigger.create({
      data: {
        businessId: String(businessId),
        clientId: String(clientId),
        reelId,
        keyword: normalizedKeyword,
        replyText,
        dmText: dmText || null,
        aiPrompt: aiPrompt || null,
        isActive: true,
      },
    });

    console.log("Comment automation trigger saved", {
      businessId,
      clientId,
      triggerId: trigger.id,
      hasAiPrompt: Boolean(aiPrompt),
    });

    return res.status(201).json({
      success: true,
      data: trigger,
      trigger,
    });
  } catch (error) {
    console.error("API ERROR:", error);
    return res.status(500).json({
      success: false,
      data: null,
      message: "Internal error",
    });
  }
};

/* --------------------------------------------------- */
/* GET */
/* --------------------------------------------------- */

export const getCommentTriggers = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        data: [],
        message: "Unauthorized",
      });
    }

    const businessId = await getBusinessId(req);

    console.log("GET /comment-automation/triggers hit", {
      userId,
      businessId,
    });

    if (!businessId) {
      console.log("Comment triggers fetched:", []);
      return res.status(200).json([]);
    }

    const triggers = await prisma.commentTrigger.findMany({
      where: {
        businessId: String(businessId),
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    console.log("Comment triggers fetched:", triggers);

    return res.status(200).json(triggers || []);
  } catch (error) {
    console.error("❌ triggers error:", error);
    return res.status(200).json([]);
  }
};

/* --------------------------------------------------- */
/* UPDATE */
/* --------------------------------------------------- */

export const updateCommentTrigger = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const id = req.params.id;

    if (!userId)
      return res.status(401).json({ message: "Unauthorized" });

    if (!id)
      return res.status(400).json({ message: "Invalid ID" });

    const businessId = await getBusinessId(req);

    if (!businessId)
      return res.status(404).json({ message: "Business not found" });

    const trigger = await prisma.commentTrigger.findFirst({
      where: { id: String(id) },
    });

    if (!trigger || String(trigger.businessId) !== String(businessId)) {
      return res.status(404).json({ message: "Trigger not found" });
    }

    const { keyword, replyText, dmText, aiPrompt } = req.body;

    if (!keyword || !replyText) {
      return res.status(400).json({
        message: "keyword and replyText required",
      });
    }

    const updated = await prisma.commentTrigger.update({
      where: { id: String(id) },
      data: {
        keyword: normalizeKeyword(keyword),
        replyText,
        dmText: dmText || null,
        aiPrompt: aiPrompt || null,
      },
    });

    return res.json({ success: true, trigger: updated });
  } catch (error) {
    console.error("Update trigger error:", error);
    return res.status(500).json({ message: "Failed to update trigger" });
  }
};

/* --------------------------------------------------- */
/* DELETE */
/* --------------------------------------------------- */

export const deleteCommentTrigger = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const id = req.params.id;

    if (!userId)
      return res.status(401).json({ message: "Unauthorized" });

    if (!id)
      return res.status(400).json({ message: "Invalid ID" });

    const businessId = await getBusinessId(req);

    if (!businessId)
      return res.status(404).json({ message: "Business not found" });

    const trigger = await prisma.commentTrigger.findFirst({
      where: { id: String(id) },
    });

    if (!trigger || String(trigger.businessId) !== String(businessId)) {
      return res.status(404).json({ message: "Trigger not found" });
    }

    await prisma.commentTrigger.update({
      where: { id: String(id) },
      data: { isActive: false },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Delete trigger error:", error);
    return res.status(500).json({ message: "Failed to delete trigger" });
  }
};

/* --------------------------------------------------- */
/* TOGGLE */
/* --------------------------------------------------- */

export const toggleCommentTrigger = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const id = req.params.id;

    if (!userId)
      return res.status(401).json({ message: "Unauthorized" });

    if (!id)
      return res.status(400).json({ message: "Invalid ID" });

    const businessId = await getBusinessId(req);

    if (!businessId)
      return res.status(404).json({ message: "Business not found" });

    const trigger = await prisma.commentTrigger.findFirst({
      where: { id: String(id) },
    });

    if (!trigger || String(trigger.businessId) !== String(businessId)) {
      return res.status(404).json({ message: "Trigger not found" });
    }

    const updated = await prisma.commentTrigger.update({
      where: { id: String(id) },
      data: { isActive: !trigger.isActive },
    });

    return res.json({ success: true, trigger: updated });
  } catch (error) {
    console.error("Toggle trigger error:", error);
    return res.status(500).json({ message: "Failed to toggle trigger" });
  }
};
