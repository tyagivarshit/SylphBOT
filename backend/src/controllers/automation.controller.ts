import { Request, Response } from "express";
import prisma from "../config/prisma";
import { getPlanKey, type PlanType } from "../config/plan.config";

/* ---------------- CREATE FLOW ---------------- */

export const createAutomationFlow = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user?.id as string | undefined;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    /* 🔥 GET BUSINESS + PLAN (OPTIMIZED SELECT) */

    const business = await prisma.business.findFirst({
      where: { ownerId: userId },
      select: {
        id: true,
        subscription: {
          select: {
            plan: {
              select: {
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!business) {
      return res.status(404).json({
        message: "Business not found",
      });
    }

    const planKey = getPlanKey(business.subscription?.plan || null);

    const {
      name,
      triggerValue,
      triggerType = "KEYWORD",
      channel = "INSTAGRAM",
      steps = [],
    } = req.body;

    /* ---------------- VALIDATION ---------------- */

    const cleanName = name?.trim();
    const cleanTrigger = triggerValue?.toLowerCase().trim();

    if (!cleanName || !cleanTrigger) {
      return res.status(400).json({
        message: "Name and triggerValue are required",
      });
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({
        message: "At least 1 step is required",
      });
    }

    /* 🔥 STEP SANITIZATION (IMPORTANT) */

    const sanitizedSteps = steps.map((step: any, index: number) => ({
      stepKey: `STEP_${index + 1}`,
      stepType: step.type,
      message: step.config?.message || null,
      condition: step.config?.condition || null,
      nextStep:
        index < steps.length - 1
          ? `STEP_${index + 2}`
          : null,
      metadata: step.config || {},
    }));

    /* ---------------- PLAN RESTRICTIONS ---------------- */

    const allowedStepTypesByPlan: Record<PlanType, string[]> = {
      FREE_LOCKED: [],
      BASIC: ["MESSAGE"],
      PRO: ["MESSAGE", "DELAY", "CONDITION"],
      ELITE: ["MESSAGE", "DELAY", "CONDITION", "BOOKING"],
    };
    const allowedStepTypes = allowedStepTypesByPlan[planKey];
    const invalidStep = sanitizedSteps.find(
      (step: any) => !allowedStepTypes.includes(step.stepType)
    );

    if (invalidStep) {
      return res.status(403).json({
        message: `Step '${invalidStep.stepType}' not allowed in ${planKey} plan`,
      });
    }

    /* ---------------- CREATE FLOW + STEPS ---------------- */

    const flow = await prisma.$transaction(async (tx) => {
      const createdFlow = await tx.automationFlow.create({
        data: {
          businessId: business.id,
          name: cleanName,
          channel,
          triggerType,
          triggerValue: cleanTrigger,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      await tx.automationStep.createMany({
        data: sanitizedSteps.map((step) => ({
          ...step,
          flowId: createdFlow.id,
        })),
      });

      return tx.automationFlow.findUnique({
        where: { id: createdFlow.id },
        include: {
          steps: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
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
    const userId = (req as any).user?.id as string | undefined;

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
      select: {
        id: true,
        name: true,
        channel: true,
        triggerType: true,
        triggerValue: true,
        status: true,
        createdAt: true,
        steps: {
          select: {
            stepKey: true,
            stepType: true,
            message: true,
            condition: true,
            nextStep: true,
          },
          orderBy: { createdAt: "asc" },
        },
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
