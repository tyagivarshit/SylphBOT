import type { Request, Response } from "express";
import { getAutonomousDashboard } from "../services/autonomous/dashboard.service";
import { getProjectionSnapshot } from "../services/projectionCoordinator.service";
import { runAutonomousSchedulerAsLeader } from "../services/autonomous/scheduler.service";
import {
  applyManualIntelligenceOverride,
  rollbackOptimizationDecision,
  runIntelligenceLoop,
  runIntelligenceSimulation,
} from "../services/intelligence/intelligenceOS.service";
import {
  getGrowthExpansionProjection,
  runGrowthExpansionSelfAudit,
} from "../services/growthExpansionOS.service";
import { getRequestAbortSignal } from "../utils/requestLifecycle";

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

const AUTONOMOUS_PROJECTION_CACHE_TTL_MS = 10_000;
const AUTONOMOUS_PROJECTION_STALE_TTL_MS = 45_000;
const AUTONOMOUS_PROJECTION_WAIT_MS = 150;
const AUTONOMOUS_PROJECTION_COMPUTE_BUDGET_MS = 4_500;

const buildAutonomousDashboardFallback = () => ({
  generatedAt: new Date().toISOString(),
  summary: {
    pending: 0,
    queued: 0,
    dispatchedToday: 0,
    blocked: 0,
    avgScore: 0,
  },
  engines: [] as unknown[],
  opportunities: [] as unknown[],
  campaigns: [] as unknown[],
  observability: {
    lastSchedulerRunAt: null as string | null,
    recentEvents: [] as unknown[],
    blockedReasons: [] as unknown[],
  },
});

const buildGrowthProjectionFallback = (businessId: string) => ({
  phaseVersion: "phase6f.final.v1",
  tenantId: businessId,
  tenantKey: `tenant:${businessId}`,
  summary: {
    campaigns: 0,
    executions: 0,
    acquisitions: 0,
    attributions: 0,
    referrals: 0,
    churnOpen: 0,
    expansionOpen: 0,
    channelSaturated: 0,
    revenueAttributedMinor: 0,
    costAttributedMinor: 0,
  },
  engines: {} as Record<string, number>,
  authorities: {} as Record<string, number>,
  wiringDomains: [] as string[],
  recentFailures: [] as unknown[],
});

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

    const projection = await getProjectionSnapshot({
      cacheKey: `autonomous:dashboard:v1:${businessId}`,
      label: "autonomous_dashboard_projection",
      businessId,
      cacheTtlMs: AUTONOMOUS_PROJECTION_CACHE_TTL_MS,
      staleTtlMs: AUTONOMOUS_PROJECTION_STALE_TTL_MS,
      computeBudgetMs: AUTONOMOUS_PROJECTION_COMPUTE_BUDGET_MS,
      initialWaitMs: AUTONOMOUS_PROJECTION_WAIT_MS,
      requestSignal: getRequestAbortSignal({ req, res }),
      fallback: buildAutonomousDashboardFallback(),
      compute: () => getAutonomousDashboard(businessId),
    });

    return res.json({
      success: true,
      data: projection.value,
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

export const getGrowthOSProjectionController = async (
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

    const projection = await getProjectionSnapshot({
      cacheKey: `growth:projection:v1:${businessId}`,
      label: "growth_projection",
      businessId,
      cacheTtlMs: AUTONOMOUS_PROJECTION_CACHE_TTL_MS,
      staleTtlMs: AUTONOMOUS_PROJECTION_STALE_TTL_MS,
      computeBudgetMs: AUTONOMOUS_PROJECTION_COMPUTE_BUDGET_MS,
      initialWaitMs: AUTONOMOUS_PROJECTION_WAIT_MS,
      requestSignal: getRequestAbortSignal({ req, res }),
      fallback: buildGrowthProjectionFallback(businessId),
      compute: () =>
        getGrowthExpansionProjection({
          businessId,
          tenantId: businessId,
        }),
    });

    return res.json({
      success: true,
      data: projection.value,
    });
  } catch (error) {
    console.error("Growth projection error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const runGrowthSelfAuditController = async (
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

    const data = await runGrowthExpansionSelfAudit({
      businessId,
      tenantId: businessId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Growth self audit error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
