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
import { getEmbeddingRuntimeState } from "../services/embedding.service";
import { getStartupIsolationSnapshot } from "../runtime/startupIsolation.service";
import { asyncHandler } from "../utils/asyncHandler";
import { container } from "../runtime/kernel/diContainer";
import { executiveStartupMetrics } from "../services/executive/plugin";
import logger from "../utils/logger";
import {
  getBuildTimestamp,
  getGitCommit,
  getInternalApiKeyMetadata,
  startupTimestamp,
} from "../utils/internalHealthDiagnostics";

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
  const headerPresent = Boolean(internalKey);
  const envPresent = Boolean(expectedKey);
  const headerLength = internalKey?.length || 0;
  const envLength = expectedKey?.length || 0;
  const comparisonPossible =
    headerPresent && envPresent && headerLength === envLength;

  logger.info(
    {
      event: "internal_health_key_validation_input",
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      remoteIP: req.ip || req.socket.remoteAddress || null,
      headerPresent,
      headerLength,
      envPresent,
      envLength,
      comparisonPossible,
    },
    "Internal health key validation input"
  );

  const validationPassed = isValidInternalKey(internalKey, expectedKey);
  const failureReason = validationPassed
    ? null
    : !headerPresent
    ? "HEADER_MISSING"
    : !envPresent
    ? "ENV_MISSING"
    : headerLength !== envLength
    ? "LENGTH_MISMATCH"
    : comparisonPossible
    ? "TIMING_SAFE_EQUAL_FAILED"
    : "UNKNOWN";

  logger.info(
    {
      event: "internal_health_key_validation_result",
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      validationPassed,
      validationFailed: !validationPassed,
      failureReason,
    },
    "Internal health key validation result"
  );

  if (!validationPassed) {
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
      startup: getStartupIsolationSnapshot(),
      aiRuntime: {
        embedding: getEmbeddingRuntimeState(),
      },
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
  "/executive",
  asyncHandler(async (req, res) => {
    const report: any = {
      success: true,
      requestId: req.requestId,
      pluginLoaded: false,
      diHealthy: false,
      repositoriesHealthy: false,
      servicesHealthy: false,
      capabilitiesHealthy: false,
      contractsHealthy: false,
      ...getInternalApiKeyMetadata(),
      startupTimestamp,
      gitCommit: getGitCommit(),
      buildTimestamp: getBuildTimestamp(),
      startupTimeMs: executiveStartupMetrics.startupTime,
      initializationTimeMs: executiveStartupMetrics.initializationTime,
      memoryOverheadBytes: executiveStartupMetrics.memoryOverheadBytes,
      details: {}
    };

    try {
      if (!container.has("IPluginRegistry")) {
        return res.status(500).json({
          success: false,
          message: "Core PluginRegistry not initialized"
        });
      }

      const pluginRegistry = container.resolve<any>("IPluginRegistry");
      const plugin = pluginRegistry.getPlugin("plugin.executive.identity");
      report.pluginLoaded = !!plugin;
      report.details.pluginId = plugin ? plugin.id : null;
      report.details.pluginName = plugin ? plugin.name : null;

      // 1. Check Repositories
      const keyRepos = [
        "IExecutiveRepository",
        "IExecutiveMemoryRepository",
        "IExecutiveMemoryArchitectureRepository",
        "IExecutiveMemoryConsolidationRepository",
        "IExecutiveMemoryRetrievalRepository",
        "IExecutiveMemoryAssociationRepository",
        "IExecutiveSemanticMemoryRepository",
        "IExecutiveOrganizationalKnowledgeRepository",
        "IExecutiveMemoryOptimizationRepository",
        "IExecutiveMemoryGovernanceRepository",
        "IExecutiveMemoryCertificationRepository",
        "IExecutiveGoalRepository",
        "IGoalAssumptionRepository",
        "IExecutiveStrategyRepository",
        "IExecutivePlanningRepository",
        "IExecutiveTimelineRepository",
        "IExecutiveScenarioRepository",
        "IExecutivePlanningOptimizationRepository",
        "IExecutiveRiskRepository",
        "IExecutiveResourceRepository",
        "IExecutivePlanningGovernanceRepository",
        "IExecutivePlanningHardeningRepository",
        "IExecutiveDecisionRepository",
        "IExecutiveEvidenceRepository",
        "IExecutiveAlternativeRepository",
        "IExecutiveDecisionEvaluationRepository",
        "IExecutiveSimulationRepository",
        "IExecutiveDecisionSelectionRepository",
        "IExecutiveDecisionAuthorizationRepository",
        "IExecutiveDecisionDispatchRepository",
        "IExecutiveDecisionMonitoringRepository",
        "IExecutiveDecisionHardeningRepository",
        "IExecutiveExecutionRepository",
        "IExecutiveExecutionHardeningRepository",
        "IExecutiveExecutionGraphRepository",
        "IExecutiveExecutionAdapterRepository",
        "IExecutiveExecutionDriverRepository",
        "IExecutiveWorkflowRepository",
        "IExecutiveAdaptiveExecutionRepository",
        "IExecutiveSupervisorRepository",
        "IExecutiveOperationsSupervisorRepository",
        "IExecutiveSchedulerRepository",
        "IExecutiveExecutionLearningRepository",
        "IExecutiveExecutionCertificationRepository"
      ];
      
      const missingRepos = [];
      for (const repo of keyRepos) {
        if (!container.has(repo)) {
          missingRepos.push(repo);
        } else {
          try {
            container.resolve(repo);
          } catch (e: any) {
            missingRepos.push(`${repo} (resolve failed: ${e.message})`);
          }
        }
      }
      report.repositoriesHealthy = missingRepos.length === 0;
      report.details.missingRepositories = missingRepos;

      // 2. Check Services
      const keyServices = [
        "IExecutiveIdentityService",
        "IExecutivePerceptionService",
        "IExecutiveCognitionService",
        "IExecutiveMemoryService",
        "IExecutiveMemoryArchitectureService",
        "IExecutiveMemoryConsolidationService",
        "IExecutiveMemoryRetrievalService",
        "IExecutiveMemoryAssociationService",
        "IExecutiveSemanticMemoryService",
        "IExecutiveOrganizationalKnowledgeService",
        "IExecutiveMemoryOptimizationService",
        "IExecutiveMemoryGovernanceService",
        "IExecutiveMemoryCertificationService",
        "IExecutiveGoalIntelligenceService",
        "IExecutiveStrategyIntelligenceService",
        "IExecutivePlanningService",
        "IExecutiveTimelineService",
        "IExecutiveScenarioService",
        "IExecutivePlanningOptimizationService",
        "IExecutiveRiskService",
        "IExecutiveResourceService",
        "IExecutivePlanningGovernanceService",
        "IExecutivePlanningHardeningService",
        "IExecutiveDecisionIntelligenceService",
        "IExecutiveEvidenceValidationService",
        "IExecutiveAlternativeGenerationService",
        "IExecutiveDecisionEvaluationService",
        "IExecutiveSimulationService",
        "IExecutiveDecisionSelectionService",
        "IExecutiveDecisionAuthorizationService",
        "IExecutiveDecisionDispatchService",
        "IExecutiveDecisionMonitoringService",
        "IExecutiveDecisionHardeningService",
        "IExecutiveExecutionService",
        "IExecutiveExecutionHardeningService",
        "IExecutiveExecutionGraphService",
        "IExecutiveExecutionAdapterService",
        "IExecutiveExecutionDriverService",
        "IExecutiveWorkflowOrchestratorService",
        "IExecutiveAdaptiveExecutionService",
        "IExecutiveSupervisorService",
        "IExecutiveOperationsSupervisorService",
        "IExecutiveSchedulerService",
        "IExecutiveExecutionLearningService",
        "IExecutiveExecutionCertificationService"
      ];

      const missingServices = [];
      for (const service of keyServices) {
        if (!container.has(service)) {
          missingServices.push(service);
        } else {
          try {
            container.resolve(service);
          } catch (e: any) {
            missingServices.push(`${service} (resolve failed: ${e.message})`);
          }
        }
      }
      report.servicesHealthy = missingServices.length === 0;
      report.details.missingServices = missingServices;

      // 3. DI Container Overall Health
      report.diHealthy = report.repositoriesHealthy && report.servicesHealthy;

      // 4. Check Capabilities
      if (container.has("ICapabilityRegistry")) {
        const capabilityRegistry = container.resolve<any>("ICapabilityRegistry");
        const sampleCapabilities = [
          "create_executive_identity",
          "validate_executive_authority",
          "check_executive_boundary",
          "select_best_decision",
          "adaptive_execution",
          "executive_supervisor"
        ];
        const missingCapabilities = sampleCapabilities.filter(c => !capabilityRegistry.has(c));
        report.capabilitiesHealthy = missingCapabilities.length === 0;
        report.details.missingCapabilities = missingCapabilities;
      } else {
        report.details.missingCapabilities = ["ICapabilityRegistry missing from DI"];
      }

      // 5. Check Contracts
      if (container.has("IContractRegistry")) {
        const contractRegistry = container.resolve<any>("IContractRegistry");
        const sampleContracts = [
          "executive.created",
          "executive.status.updated",
          "executive.boundary.breached",
          "executive.escalated",
          "executive.lifecycle.transitioned",
          "executive.health.updated"
        ];
        const missingContracts = sampleContracts.filter(c => !contractRegistry.has(c));
        report.contractsHealthy = missingContracts.length === 0;
        report.details.missingContracts = missingContracts;
      } else {
        report.details.missingContracts = ["IContractRegistry missing from DI"];
      }

      const overallHealthy =
        report.pluginLoaded &&
        report.diHealthy &&
        report.capabilitiesHealthy &&
        report.contractsHealthy;

      return res.status(overallHealthy ? 200 : 500).json(report);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to run health check",
        error: error.message || String(error)
      });
    }
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
