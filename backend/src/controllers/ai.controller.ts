import { Response } from "express";
import prisma from "../config/prisma";
import { getSalesAgentBlueprint } from "../services/salesAgent/blueprint.service";
import { generateSalesAgentReply } from "../services/salesAgent/reply.service";
import { AuthenticatedRequest } from "../types/request";

type TestAIBody = {
  message?: string;
  leadId?: string;
  clientId?: string;
};

const normalizeMessage = (message?: string) => message?.trim() || "";

const getBusinessForUser = async (userId?: string | null) => {
  if (!userId) {
    return null;
  }

  return prisma.business.findFirst({
    where: {
      ownerId: userId,
    },
    include: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });
};

export const getSalesBlueprint = async (
  _req: AuthenticatedRequest,
  res: Response
) => {
  return res.json({
    success: true,
    blueprint: getSalesAgentBlueprint(),
  });
};

export const testAI = async (
  req: AuthenticatedRequest<TestAIBody>,
  res: Response
) => {
  try {
    const message = normalizeMessage(req.body.message);

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const business = await getBusinessForUser(userId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    if (req.body.clientId) {
      const client = await prisma.client.findFirst({
        where: {
          id: req.body.clientId,
          businessId: business.id,
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
    }

    const lead =
      (req.body.leadId
        ? await prisma.lead.findFirst({
            where: {
              id: req.body.leadId,
              businessId: business.id,
            },
          })
        : null) ||
      (await prisma.lead.create({
        data: {
          businessId: business.id,
          clientId: req.body.clientId || null,
          name: "Test Lead",
          platform: "TEST",
        },
      }));

    const reply = await generateSalesAgentReply({
      businessId: business.id,
      leadId: lead.id,
      message,
      plan: business.subscription?.plan || null,
      source: "PREVIEW",
      preview: true,
    });

    return res.json({
      success: true,
      aiReply: reply?.message || null,
      payload: reply,
      leadId: lead.id,
    });
  } catch (error: any) {
    console.error("AI Test Error:", error);

    return res.status(500).json({
      success: false,
      message: "AI test failed",
      error: error.message,
    });
  }
};
