import { Response } from "express";
import prisma from "../config/prisma";
import { getSalesAgentBlueprint } from "../services/salesAgent/blueprint.service";
import {
  buildSalesAgentRecoveryReply,
} from "../services/salesAgent/reply.service";
import { runRevenueBrainOrchestrator } from "../services/revenueBrain/orchestrator.service";
import { AuthenticatedRequest } from "../types/request";
import {
  finalizeAIUsageExecution,
  releaseAIUsageExecution,
  reserveAIUsageExecution,
  runWithContactUsageLimit,
} from "../services/usage.service";
import { isPhase5APreviewBypassEnabled } from "../services/runtimePolicy.service";

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
  let aiReservation:
    | Awaited<ReturnType<typeof reserveAIUsageExecution>>
    | null = null;
  let responseLeadId: string | null = null;

  try {
    if (!isPhase5APreviewBypassEnabled()) {
      return res.status(410).json({
        success: false,
        message:
          "Preview Revenue Brain access is disabled in production. Use the canonical reception runtime.",
      });
    }

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
      (
        await runWithContactUsageLimit(business.id, (tx) =>
          tx.lead.create({
            data: {
              businessId: business.id,
              clientId: req.body.clientId || null,
              name: "Test Lead",
              platform: "TEST",
            },
          })
        )
      ).result;

    responseLeadId = lead.id;

    const reply = await runRevenueBrainOrchestrator({
      businessId: business.id,
      leadId: lead.id,
      message,
      plan: business.subscription?.plan || null,
      source: "PREVIEW",
      preview: true,
      beforeAIReply: async () => {
        aiReservation = await reserveAIUsageExecution({
          businessId: business.id,
        });

        return {
          finalize: async () => {
            if (!aiReservation) {
              return;
            }

            const activeReservation = aiReservation;
            aiReservation = null;
            await finalizeAIUsageExecution(activeReservation);
          },
          release: async () => {
            if (!aiReservation) {
              return;
            }

            const activeReservation = aiReservation;
            aiReservation = null;
            await releaseAIUsageExecution(activeReservation);
          },
        };
      },
    });

    if (!reply?.message) {
      return res.json({
        success: true,
        aiReply: null,
        payload: reply?.structured || null,
        internalPayload: reply || null,
        leadId: responseLeadId,
      });
    }

    return res.json({
      success: true,
      aiReply: reply.message,
      payload: reply.structured || null,
      internalPayload: reply,
      leadId: responseLeadId,
    });
  } catch (error: any) {
    if (aiReservation) {
      await releaseAIUsageExecution(aiReservation).catch(() => undefined);
      aiReservation = null;
    }

    if (error?.code === "LIMIT_REACHED") {
      return res.status(429).json({
        success: false,
        message: "Usage limit reached",
      });
    }

    if (error?.code === "HOURLY_LIMIT_REACHED") {
      const fallback = buildSalesAgentRecoveryReply(
        normalizeMessage(req.body.message)
      );

      return res.json({
        success: true,
        aiReply: fallback.message,
        payload: fallback.structured || null,
        internalPayload: fallback,
        leadId: responseLeadId,
      });
    }

    if (error?.code === "USAGE_CHECK_FAILED") {
      return res.status(503).json({
        success: false,
        message: "AI temporarily unavailable",
      });
    }

    console.error("AI Test Error:", error);

    return res.status(500).json({
      success: false,
      message: "AI test failed",
      error: error.message,
    });
  }
};
