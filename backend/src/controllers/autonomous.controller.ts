import type { Request, Response } from "express";
import { getAutonomousDashboard } from "../services/autonomous/dashboard.service";
import { runAutonomousSchedulerAsLeader } from "../services/autonomous/scheduler.service";
import {
  applyManualIntelligenceOverride,
  rollbackOptimizationDecision,
  runIntelligenceLoop,
  runIntelligenceSimulation,
} from "../services/intelligence/intelligenceOS.service";

type AutonomousRequest = Request & {
  user?: {
    businessId?: string | null;
  };
  tenant?: {
    businessId?: string | null;
  };
};

const getBusinessId = (req: AutonomousRequest) =>
  req.tenant?.businessId || req.user?.businessId || null;

export const getAutonomousDashboardController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const data = await getAutonomousDashboard(businessId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Autonomous dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const runAutonomousSchedulerController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const autoDispatch = req.body?.autoDispatch !== false;
    const data = await runAutonomousSchedulerAsLeader({
      businessId,
      autoDispatch,
    });

    return res.json({
      success: true,
      data,
      leaderAcquired: Boolean(data),
    });
  } catch (error) {
    console.error("Autonomous scheduler error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const runIntelligenceLoopController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const replayToken =
      typeof req.body?.replayToken === "string"
        ? req.body.replayToken.trim()
        : null;
    const asOf =
      typeof req.body?.asOf === "string" && req.body.asOf.trim()
        ? new Date(req.body.asOf)
        : new Date();

    if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid asOf timestamp",
      });
    }

    const data = await runIntelligenceLoop({
      businessId,
      asOf,
      replayToken,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Intelligence loop error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const runIntelligenceSimulationController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const scenarioType = String(req.body?.scenarioType || "").trim();

    if (!scenarioType) {
      return res.status(400).json({
        success: false,
        message: "scenarioType is required",
      });
    }

    const assumptions =
      req.body?.assumptions &&
      typeof req.body.assumptions === "object" &&
      !Array.isArray(req.body.assumptions)
        ? req.body.assumptions
        : {};

    const asOf =
      typeof req.body?.asOf === "string" && req.body.asOf.trim()
        ? new Date(req.body.asOf)
        : new Date();

    if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid asOf timestamp",
      });
    }

    const data = await runIntelligenceSimulation({
      businessId,
      scenarioType,
      assumptions,
      asOf,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Intelligence simulation error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const applyIntelligenceOverrideController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const scope = String(req.body?.scope || "").trim();
    const action = String(req.body?.action || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const expiresAtRaw = String(req.body?.expiresAt || "").trim();
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (!scope || !action || !reason || !expiresAt) {
      return res.status(400).json({
        success: false,
        message: "scope, action, reason, and expiresAt are required",
      });
    }

    if (Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid expiresAt timestamp",
      });
    }

    const data = await applyManualIntelligenceOverride({
      businessId,
      scope,
      action,
      reason,
      expiresAt,
      createdBy: (req as any)?.user?.id || null,
      targetType: typeof req.body?.targetType === "string" ? req.body.targetType : "BUSINESS",
      targetId: typeof req.body?.targetId === "string" ? req.body.targetId : null,
      priority:
        Number.isFinite(Number(req.body?.priority)) && Number(req.body?.priority) > 0
          ? Number(req.body.priority)
          : 100,
      metadata:
        req.body?.metadata &&
        typeof req.body.metadata === "object" &&
        !Array.isArray(req.body.metadata)
          ? req.body.metadata
          : undefined,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Intelligence override error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const rollbackIntelligenceDecisionController = async (
  req: AutonomousRequest,
  res: Response
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        message: "Business context is required",
      });
    }

    const decisionKey = String(req.body?.decisionKey || "").trim();
    const reason = String(req.body?.reason || "").trim() || "manual_rollback";

    if (!decisionKey) {
      return res.status(400).json({
        success: false,
        message: "decisionKey is required",
      });
    }

    const data = await rollbackOptimizationDecision({
      businessId,
      decisionKey,
      reason,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Intelligence rollback error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
