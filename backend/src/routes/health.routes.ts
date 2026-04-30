import crypto from "crypto";
import { type RequestHandler, Router } from "express";
import { getInboxDashboardProjection } from "../services/inboxDashboardProjection.service";
import { getQueueHealth } from "../services/queueHealth.service";
import { getReceptionMetricsSnapshot } from "../services/receptionMetrics.service";
import {
  getOwnerControlTowerProjection,
  replayDeadLetter,
  runReliabilityChaosScenario,
  runReliabilitySelfAudit,
} from "../services/reliability/reliabilityOS.service";
import {
  applyInfrastructureOverride,
  executeInfrastructureRecoveryPlan,
  getInfrastructureControlPlaneProjection,
  recordInfrastructureSignal,
  resolveInfrastructureOverride,
  runInfrastructureResilienceChaosScenario,
  runInfrastructureResilienceSelfAudit,
} from "../services/reliability/infrastructureResilienceOS.service";
import { collectReliabilityRuntimeSnapshot } from "../services/reliability/reliabilityRuntime.service";
import { getSystemHealth } from "../services/systemHealth.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

const isValidInternalKey = (
  providedKey: string | undefined,
  expectedKey: string | undefined
) => {
  if (!providedKey || !expectedKey) {
    return false;
  }

  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
};

const requireInternalHealthKey: RequestHandler = (req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  const internalKey = req.get("x-internal-key")?.trim();
  const expectedKey = process.env.INTERNAL_API_KEY?.trim();

  if (!isValidInternalKey(internalKey, expectedKey)) {
    return res.status(403).json({
      success: false,
      requestId: req.requestId,
      message: "Forbidden",
    });
  }

  return next();
};

router.use(requireInternalHealthKey);

router.get(
  "/queue",
  asyncHandler(async (req, res) => {
    const queues = await getQueueHealth();

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      queues,
    });
  })
);

router.get(
  "/system",
  asyncHandler(async (req, res) => {
    const health = await getSystemHealth();
    const businessId =
      typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : undefined;
    const runtime = await collectReliabilityRuntimeSnapshot({
      businessId: businessId || null,
    }).catch(() => null);

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      ...health,
      reliabilitySnapshot:
        runtime?.snapshots?.map((snapshot: any) => ({
          subsystem: snapshot.subsystem,
          healthState: snapshot.healthState,
          windowEnd: snapshot.windowEnd,
        })) || [],
    });
  })
);

router.get(
  "/reception-metrics",
  asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      requestId: req.requestId,
      metrics: getReceptionMetricsSnapshot(),
    });
  })
);

router.get(
  "/reception-dashboard",
  asyncHandler(async (req, res) => {
    const projection = await getInboxDashboardProjection();

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      projection,
    });
  })
);

router.get(
  "/control-tower",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const projection = await getOwnerControlTowerProjection({
      businessId,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      projection,
    });
  })
);

router.post(
  "/dlq/replay",
  asyncHandler(async (req, res) => {
    const deadLetterKey =
      typeof req.body?.deadLetterKey === "string"
        ? req.body.deadLetterKey.trim()
        : "";
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "manual_replay";
    const force = req.body?.force === true;

    const replayed = await replayDeadLetter({
      deadLetterKey,
      reason,
      force,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      replayed,
    });
  })
);

router.post(
  "/chaos",
  asyncHandler(async (req, res) => {
    const scenario =
      typeof req.body?.scenario === "string"
        ? req.body.scenario.trim()
        : "trace_replay";
    const businessId =
      typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const result = await runReliabilityChaosScenario({
      businessId,
      scenario: scenario as any,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      result,
    });
  })
);

router.get(
  "/self-audit",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const audit = await runReliabilitySelfAudit({
      businessId,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      audit,
    });
  })
);

router.get(
  "/infra/control-plane",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const tenantId =
      typeof req.query.tenantId === "string"
        ? req.query.tenantId.trim()
        : null;
    const projection = await getInfrastructureControlPlaneProjection({
      businessId,
      tenantId,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      projection,
    });
  })
);

router.get(
  "/infra/self-audit",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const tenantId =
      typeof req.query.tenantId === "string"
        ? req.query.tenantId.trim()
        : null;
    const audit = await runInfrastructureResilienceSelfAudit({
      businessId,
      tenantId,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      audit,
    });
  })
);

router.post(
  "/infra/signal",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const tenantId =
      typeof req.body?.tenantId === "string"
        ? req.body.tenantId.trim()
        : null;
    const authority =
      typeof req.body?.authority === "string"
        ? req.body.authority.trim()
        : "OBSERVABILITY_FABRIC";
    const subsystem =
      typeof req.body?.subsystem === "string"
        ? req.body.subsystem.trim()
        : "";
    const engine =
      typeof req.body?.engine === "string" ? req.body.engine.trim() : "";
    const signalId =
      typeof req.body?.signalId === "string" ? req.body.signalId.trim() : null;
    const occurredAtRaw =
      typeof req.body?.occurredAt === "string" ? req.body.occurredAt.trim() : "";
    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : undefined;

    const signal = await recordInfrastructureSignal({
      businessId,
      tenantId,
      authority: authority as any,
      subsystem,
      engine,
      signalId,
      occurredAt:
        occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : undefined,
      latencyMs: Number(req.body?.latencyMs),
      errorRate: Number(req.body?.errorRate),
      saturation: Number(req.body?.saturation),
      backlog: Number(req.body?.backlog),
      consecutiveFailures: Number(req.body?.consecutiveFailures),
      metadata:
        req.body?.metadata && typeof req.body.metadata === "object"
          ? req.body.metadata
          : null,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      signal,
    });
  })
);

router.post(
  "/infra/override",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const tenantId =
      typeof req.body?.tenantId === "string"
        ? req.body.tenantId.trim()
        : null;
    const authority =
      typeof req.body?.authority === "string"
        ? req.body.authority.trim()
        : "RECOVERY_FABRIC";
    const subsystem =
      typeof req.body?.subsystem === "string"
        ? req.body.subsystem.trim()
        : "";
    const engine =
      typeof req.body?.engine === "string" ? req.body.engine.trim() : null;
    const scope =
      typeof req.body?.scope === "string" ? req.body.scope.trim() : "RECOVERY";
    const action =
      typeof req.body?.action === "string" ? req.body.action.trim() : "THROTTLE";
    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const createdBy =
      typeof req.body?.createdBy === "string" ? req.body.createdBy.trim() : null;
    const idempotencyKey =
      typeof req.body?.idempotencyKey === "string"
        ? req.body.idempotencyKey.trim()
        : null;
    const expiresAtRaw =
      typeof req.body?.expiresAt === "string" ? req.body.expiresAt.trim() : "";
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    const override = await applyInfrastructureOverride({
      businessId,
      tenantId,
      authority: authority as any,
      subsystem,
      engine,
      scope,
      action: action as any,
      reason,
      priority: Number(req.body?.priority),
      expiresAt:
        expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
      createdBy,
      idempotencyKey,
      metadata:
        req.body?.metadata && typeof req.body.metadata === "object"
          ? req.body.metadata
          : null,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      override,
    });
  })
);

router.get(
  "/infra/override/resolve",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const tenantId =
      typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : null;
    const authority =
      typeof req.query.authority === "string"
        ? req.query.authority.trim()
        : "RECOVERY_FABRIC";
    const scope =
      typeof req.query.scope === "string" ? req.query.scope.trim() : "RECOVERY";
    const subsystem =
      typeof req.query.subsystem === "string" ? req.query.subsystem.trim() : "";
    const engine =
      typeof req.query.engine === "string" ? req.query.engine.trim() : null;

    const override = await resolveInfrastructureOverride({
      businessId,
      tenantId,
      authority: authority as any,
      scope,
      subsystem,
      engine,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      override,
    });
  })
);

router.post(
  "/infra/chaos",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : "";
    const scenario =
      typeof req.body?.scenario === "string"
        ? req.body.scenario.trim()
        : "engine_degradation";
    const result = await runInfrastructureResilienceChaosScenario({
      businessId,
      scenario: scenario as any,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      result,
    });
  })
);

router.post(
  "/infra/recovery",
  asyncHandler(async (req, res) => {
    const businessId =
      typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const tenantId =
      typeof req.body?.tenantId === "string"
        ? req.body.tenantId.trim()
        : null;
    const authority =
      typeof req.body?.authority === "string"
        ? req.body.authority.trim()
        : "RECOVERY_FABRIC";
    const subsystem =
      typeof req.body?.subsystem === "string"
        ? req.body.subsystem.trim()
        : "";
    const engine =
      typeof req.body?.engine === "string"
        ? req.body.engine.trim()
        : null;
    const trigger =
      typeof req.body?.trigger === "string"
        ? req.body.trigger.trim()
        : "MANUAL_RECOVERY";
    const replayToken =
      typeof req.body?.replayToken === "string"
        ? req.body.replayToken.trim()
        : null;
    const requestedActions = Array.isArray(req.body?.requestedActions)
      ? req.body.requestedActions
      : null;
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : null;

    const recovery = await executeInfrastructureRecoveryPlan({
      businessId,
      tenantId,
      authority: authority as any,
      subsystem,
      engine,
      trigger,
      replayToken,
      requestedActions,
      reason,
    });

    res.status(200).json({
      success: true,
      requestId: req.requestId,
      recovery,
    });
  })
);

export default router;
