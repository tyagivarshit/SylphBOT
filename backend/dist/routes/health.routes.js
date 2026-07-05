"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const inboxDashboardProjection_service_1 = require("../services/inboxDashboardProjection.service");
const queueHealth_service_1 = require("../services/queueHealth.service");
const receptionMetrics_service_1 = require("../services/receptionMetrics.service");
const reliabilityOS_service_1 = require("../services/reliability/reliabilityOS.service");
const infrastructureResilienceOS_service_1 = require("../services/reliability/infrastructureResilienceOS.service");
const reliabilityRuntime_service_1 = require("../services/reliability/reliabilityRuntime.service");
const systemHealth_service_1 = require("../services/systemHealth.service");
const embedding_service_1 = require("../services/embedding.service");
const startupIsolation_service_1 = require("../runtime/startupIsolation.service");
const asyncHandler_1 = require("../utils/asyncHandler");
const diContainer_1 = require("../runtime/kernel/diContainer");
const plugin_1 = require("../services/executive/plugin");
const router = (0, express_1.Router)();
const isValidInternalKey = (providedKey, expectedKey) => {
    if (!providedKey || !expectedKey) {
        return false;
    }
    const providedBuffer = Buffer.from(providedKey);
    const expectedBuffer = Buffer.from(expectedKey);
    return (providedBuffer.length === expectedBuffer.length &&
        crypto_1.default.timingSafeEqual(providedBuffer, expectedBuffer));
};
const requireInternalHealthKey = (req, res, next) => {
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
router.get("/queue", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const queues = await (0, queueHealth_service_1.getQueueHealth)();
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        queues,
    });
}));
router.get("/system", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const health = await (0, systemHealth_service_1.getSystemHealth)();
    const businessId = typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : undefined;
    const runtime = await (0, reliabilityRuntime_service_1.collectReliabilityRuntimeSnapshot)({
        businessId: businessId || null,
    }).catch(() => null);
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        ...health,
        startup: (0, startupIsolation_service_1.getStartupIsolationSnapshot)(),
        aiRuntime: {
            embedding: (0, embedding_service_1.getEmbeddingRuntimeState)(),
        },
        reliabilitySnapshot: runtime?.snapshots?.map((snapshot) => ({
            subsystem: snapshot.subsystem,
            healthState: snapshot.healthState,
            windowEnd: snapshot.windowEnd,
        })) || [],
    });
}));
router.get("/executive", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const report = {
        success: true,
        requestId: req.requestId,
        pluginLoaded: false,
        diHealthy: false,
        repositoriesHealthy: false,
        servicesHealthy: false,
        capabilitiesHealthy: false,
        contractsHealthy: false,
        startupTimeMs: plugin_1.executiveStartupMetrics.startupTime,
        initializationTimeMs: plugin_1.executiveStartupMetrics.initializationTime,
        memoryOverheadBytes: plugin_1.executiveStartupMetrics.memoryOverheadBytes,
        details: {}
    };
    try {
        if (!diContainer_1.container.has("IPluginRegistry")) {
            return res.status(500).json({
                success: false,
                message: "Core PluginRegistry not initialized"
            });
        }
        const pluginRegistry = diContainer_1.container.resolve("IPluginRegistry");
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
            if (!diContainer_1.container.has(repo)) {
                missingRepos.push(repo);
            }
            else {
                try {
                    diContainer_1.container.resolve(repo);
                }
                catch (e) {
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
            if (!diContainer_1.container.has(service)) {
                missingServices.push(service);
            }
            else {
                try {
                    diContainer_1.container.resolve(service);
                }
                catch (e) {
                    missingServices.push(`${service} (resolve failed: ${e.message})`);
                }
            }
        }
        report.servicesHealthy = missingServices.length === 0;
        report.details.missingServices = missingServices;
        // 3. DI Container Overall Health
        report.diHealthy = report.repositoriesHealthy && report.servicesHealthy;
        // 4. Check Capabilities
        if (diContainer_1.container.has("ICapabilityRegistry")) {
            const capabilityRegistry = diContainer_1.container.resolve("ICapabilityRegistry");
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
        }
        else {
            report.details.missingCapabilities = ["ICapabilityRegistry missing from DI"];
        }
        // 5. Check Contracts
        if (diContainer_1.container.has("IContractRegistry")) {
            const contractRegistry = diContainer_1.container.resolve("IContractRegistry");
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
        }
        else {
            report.details.missingContracts = ["IContractRegistry missing from DI"];
        }
        const overallHealthy = report.pluginLoaded &&
            report.diHealthy &&
            report.capabilitiesHealthy &&
            report.contractsHealthy;
        return res.status(overallHealthy ? 200 : 500).json(report);
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to run health check",
            error: error.message || String(error)
        });
    }
}));
router.get("/reception-metrics", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        metrics: (0, receptionMetrics_service_1.getReceptionMetricsSnapshot)(),
    });
}));
router.get("/reception-dashboard", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const projection = await (0, inboxDashboardProjection_service_1.getInboxDashboardProjection)();
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        projection,
    });
}));
router.get("/control-tower", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const projection = await (0, reliabilityOS_service_1.getOwnerControlTowerProjection)({
        businessId,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        projection,
    });
}));
router.post("/dlq/replay", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const deadLetterKey = typeof req.body?.deadLetterKey === "string"
        ? req.body.deadLetterKey.trim()
        : "";
    const reason = typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : "manual_replay";
    const force = req.body?.force === true;
    const replayed = await (0, reliabilityOS_service_1.replayDeadLetter)({
        deadLetterKey,
        reason,
        force,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        replayed,
    });
}));
router.post("/chaos", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const scenario = typeof req.body?.scenario === "string"
        ? req.body.scenario.trim()
        : "trace_replay";
    const businessId = typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const result = await (0, reliabilityOS_service_1.runReliabilityChaosScenario)({
        businessId,
        scenario: scenario,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        result,
    });
}));
router.get("/self-audit", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const audit = await (0, reliabilityOS_service_1.runReliabilitySelfAudit)({
        businessId,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        audit,
    });
}));
router.get("/infra/control-plane", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const tenantId = typeof req.query.tenantId === "string"
        ? req.query.tenantId.trim()
        : null;
    const projection = await (0, infrastructureResilienceOS_service_1.getInfrastructureControlPlaneProjection)({
        businessId,
        tenantId,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        projection,
    });
}));
router.get("/infra/self-audit", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const tenantId = typeof req.query.tenantId === "string"
        ? req.query.tenantId.trim()
        : null;
    const audit = await (0, infrastructureResilienceOS_service_1.runInfrastructureResilienceSelfAudit)({
        businessId,
        tenantId,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        audit,
    });
}));
router.post("/infra/signal", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const tenantId = typeof req.body?.tenantId === "string"
        ? req.body.tenantId.trim()
        : null;
    const authority = typeof req.body?.authority === "string"
        ? req.body.authority.trim()
        : "OBSERVABILITY_FABRIC";
    const subsystem = typeof req.body?.subsystem === "string"
        ? req.body.subsystem.trim()
        : "";
    const engine = typeof req.body?.engine === "string" ? req.body.engine.trim() : "";
    const signalId = typeof req.body?.signalId === "string" ? req.body.signalId.trim() : null;
    const occurredAtRaw = typeof req.body?.occurredAt === "string" ? req.body.occurredAt.trim() : "";
    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : undefined;
    const signal = await (0, infrastructureResilienceOS_service_1.recordInfrastructureSignal)({
        businessId,
        tenantId,
        authority: authority,
        subsystem,
        engine,
        signalId,
        occurredAt: occurredAt && Number.isFinite(occurredAt.getTime()) ? occurredAt : undefined,
        latencyMs: Number(req.body?.latencyMs),
        errorRate: Number(req.body?.errorRate),
        saturation: Number(req.body?.saturation),
        backlog: Number(req.body?.backlog),
        consecutiveFailures: Number(req.body?.consecutiveFailures),
        metadata: req.body?.metadata && typeof req.body.metadata === "object"
            ? req.body.metadata
            : null,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        signal,
    });
}));
router.post("/infra/override", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const tenantId = typeof req.body?.tenantId === "string"
        ? req.body.tenantId.trim()
        : null;
    const authority = typeof req.body?.authority === "string"
        ? req.body.authority.trim()
        : "RECOVERY_FABRIC";
    const subsystem = typeof req.body?.subsystem === "string"
        ? req.body.subsystem.trim()
        : "";
    const engine = typeof req.body?.engine === "string" ? req.body.engine.trim() : null;
    const scope = typeof req.body?.scope === "string" ? req.body.scope.trim() : "RECOVERY";
    const action = typeof req.body?.action === "string" ? req.body.action.trim() : "THROTTLE";
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const createdBy = typeof req.body?.createdBy === "string" ? req.body.createdBy.trim() : null;
    const idempotencyKey = typeof req.body?.idempotencyKey === "string"
        ? req.body.idempotencyKey.trim()
        : null;
    const expiresAtRaw = typeof req.body?.expiresAt === "string" ? req.body.expiresAt.trim() : "";
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    const override = await (0, infrastructureResilienceOS_service_1.applyInfrastructureOverride)({
        businessId,
        tenantId,
        authority: authority,
        subsystem,
        engine,
        scope,
        action: action,
        reason,
        priority: Number(req.body?.priority),
        expiresAt: expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
        createdBy,
        idempotencyKey,
        metadata: req.body?.metadata && typeof req.body.metadata === "object"
            ? req.body.metadata
            : null,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        override,
    });
}));
router.get("/infra/override/resolve", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.query.businessId === "string"
        ? req.query.businessId.trim()
        : null;
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : null;
    const authority = typeof req.query.authority === "string"
        ? req.query.authority.trim()
        : "RECOVERY_FABRIC";
    const scope = typeof req.query.scope === "string" ? req.query.scope.trim() : "RECOVERY";
    const subsystem = typeof req.query.subsystem === "string" ? req.query.subsystem.trim() : "";
    const engine = typeof req.query.engine === "string" ? req.query.engine.trim() : null;
    const override = await (0, infrastructureResilienceOS_service_1.resolveInfrastructureOverride)({
        businessId,
        tenantId,
        authority: authority,
        scope,
        subsystem,
        engine,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        override,
    });
}));
router.post("/infra/chaos", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : "";
    const scenario = typeof req.body?.scenario === "string"
        ? req.body.scenario.trim()
        : "engine_degradation";
    const result = await (0, infrastructureResilienceOS_service_1.runInfrastructureResilienceChaosScenario)({
        businessId,
        scenario: scenario,
    });
    res.status(200).json({
        success: true,
        requestId: req.requestId,
        result,
    });
}));
router.post("/infra/recovery", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const businessId = typeof req.body?.businessId === "string"
        ? req.body.businessId.trim()
        : null;
    const tenantId = typeof req.body?.tenantId === "string"
        ? req.body.tenantId.trim()
        : null;
    const authority = typeof req.body?.authority === "string"
        ? req.body.authority.trim()
        : "RECOVERY_FABRIC";
    const subsystem = typeof req.body?.subsystem === "string"
        ? req.body.subsystem.trim()
        : "";
    const engine = typeof req.body?.engine === "string"
        ? req.body.engine.trim()
        : null;
    const trigger = typeof req.body?.trigger === "string"
        ? req.body.trigger.trim()
        : "MANUAL_RECOVERY";
    const replayToken = typeof req.body?.replayToken === "string"
        ? req.body.replayToken.trim()
        : null;
    const requestedActions = Array.isArray(req.body?.requestedActions)
        ? req.body.requestedActions
        : null;
    const reason = typeof req.body?.reason === "string"
        ? req.body.reason.trim()
        : null;
    const recovery = await (0, infrastructureResilienceOS_service_1.executeInfrastructureRecoveryPlan)({
        businessId,
        tenantId,
        authority: authority,
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
}));
exports.default = router;
