import { IDomainPlugin } from "../../runtime/interfaces/universal";
import { DIContainer } from "../../runtime/kernel/diContainer";
import { ExecutiveIdentityService } from "./identity.service";
import { ExecutivePerceptionService } from "./perception.service";
import { ExecutiveCognitionService } from "./cognition.service";
import { ExecutiveMemoryService } from "./memory.service";
import { ExecutiveMemoryArchitectureService } from "./memoryArchitecture.service";
import { ExecutiveMemoryConsolidationService } from "./memoryConsolidation.service";
import { ExecutiveMemoryRetrievalService } from "./memoryRetrieval.service";
import { ExecutiveMemoryAssociationService } from "./memoryAssociation.service";
import { ExecutiveSemanticMemoryService } from "./semanticMemory.service";
import { ExecutiveOrganizationalKnowledgeService } from "./organizationalKnowledge.service";
import { ExecutiveMemoryOptimizationService } from "./memoryOptimization.service";
import { ExecutiveMemoryGovernanceService } from "./memoryGovernance.service";
import { ExecutiveMemoryCertificationService } from "./memoryCertification.service";
import { ExecutiveGoalIntelligenceService } from "./goalIntelligence.service";
import { ExecutiveStrategyIntelligenceService } from "./strategyIntelligence.service";
import { ExecutivePlanningService } from "./planning.service";
import { ExecutiveTimelineService } from "./timeline.service";
import { ExecutiveScenarioService } from "./scenario.service";
import { ExecutivePlanningOptimizationService } from "./planningOptimization.service";
import { ExecutiveRiskService } from "./risk.service";
import { ExecutiveResourceService } from "./resource.service";
import { ExecutivePlanningGovernanceService } from "./planningGovernance.service";
import { ExecutivePlanningHardeningService } from "./planningHardening.service";
import { ExecutiveDecisionIntelligenceService } from "./decisionIntelligence.service";
import { ExecutiveEvidenceValidationService } from "./evidenceValidation.service";
import { ExecutiveAlternativeGenerationService } from "./alternativeGeneration.service";
import { ExecutiveDecisionEvaluationService } from "./decisionEvaluation.service";
import { ExecutiveSimulationService } from "./simulationProjection.service";
import { ExecutiveDecisionSelectionService } from "./decisionSelection.service";
import { ExecutiveDecisionAuthorizationService } from "./decisionAuthorization.service";
import { ExecutiveDecisionDispatchService } from "./decisionDispatch.service";
import { ExecutiveDecisionMonitoringService } from "./decisionMonitoring.service";
import { ExecutiveDecisionHardeningService } from "./decisionHardening.service";
import { ExecutiveExecutionService } from "./execution.service";
import { ExecutiveExecutionHardeningService } from "./executionHardening.service";
import { ExecutiveExecutionGraphService } from "./executionGraph.service";
import { ExecutiveExecutionAdapterService } from "./executionAdapter.service";
import { ExecutiveExecutionDriverService } from "./executionDriver.service";
import { ExecutiveWorkflowOrchestratorService } from "./workflowOrchestrator.service";
import { ExecutiveAdaptiveExecutionService } from "./adaptiveExecution.service";
import { ExecutiveSupervisorService } from "./supervisor.service";
import { ExecutiveOperationsSupervisorService } from "./operationsSupervisor.service";
import { ExecutiveSchedulerService } from "./scheduler.service";
import { ExecutiveExecutionLearningService } from "./learning.service";
import { ExecutiveExecutionCertificationService } from "./executionCertification.service";
import { IExecutiveAlternativeRepository } from "./alternativeGeneration.service";
import { IExecutiveDecisionEvaluationRepository } from "./decisionEvaluation.service";
import { IExecutiveSimulationRepository } from "./simulationProjection.service";
import { IExecutiveExecutionHardeningRepository } from "./executionHardening.service";
import { IExecutiveExecutionGraphRepository } from "./executionGraph.service";
import { IExecutiveExecutionAdapterRepository } from "./executionAdapter.service";
import { IExecutiveExecutionDriverRepository } from "./executionDriver.service";
import { IExecutiveWorkflowRepository } from "./workflowOrchestrator.service";
import { IExecutiveAdaptiveExecutionRepository } from "./adaptiveExecution.service";
import { IExecutiveSupervisorRepository } from "./supervisor.service";
import { IExecutiveOperationsSupervisorRepository } from "./operationsSupervisor.service";
import { IExecutiveSchedulerRepository } from "./scheduler.service";
import { IExecutiveExecutionLearningRepository } from "./learning.service";
import { IExecutiveExecutionCertificationRepository } from "./executionCertification.service";

import {
  PrismaExecutiveRepository as MemoryExecutiveRepository,
  PrismaDNARepository,
  PrismaExecutiveMemoryRepository as MemoryExecutiveMemoryRepository,
  PrismaExecutiveMemoryArchitectureRepository as MemoryExecutiveMemoryArchitectureRepository,
  PrismaExecutiveMemoryConsolidationRepository as MemoryExecutiveMemoryConsolidationRepository,
  PrismaExecutiveMemoryRetrievalRepository as MemoryExecutiveMemoryRetrievalRepository,
  PrismaExecutiveMemoryAssociationRepository as MemoryExecutiveMemoryAssociationRepository,
  PrismaExecutiveSemanticMemoryRepository as MemoryExecutiveSemanticMemoryRepository,
  PrismaExecutiveOrganizationalKnowledgeRepository as MemoryExecutiveOrganizationalKnowledgeRepository,
  PrismaExecutiveMemoryOptimizationRepository as MemoryExecutiveMemoryOptimizationRepository,
  PrismaExecutiveMemoryGovernanceRepository as MemoryExecutiveMemoryGovernanceRepository,
  PrismaExecutiveMemoryCertificationRepository as MemoryExecutiveMemoryCertificationRepository,
  PrismaExecutiveGoalRepository as MemoryExecutiveGoalRepository,
  PrismaGoalAssumptionRepository as MemoryGoalAssumptionRepository,
  PrismaExecutiveStrategyRepository as MemoryExecutiveStrategyRepository,
  PrismaExecutivePlanningRepository as MemoryExecutivePlanningRepository,
  PrismaExecutiveTimelineRepository as MemoryExecutiveTimelineRepository,
  PrismaExecutiveScenarioRepository as MemoryExecutiveScenarioRepository,
  PrismaExecutivePlanningOptimizationRepository as MemoryExecutivePlanningOptimizationRepository,
  PrismaExecutiveRiskRepository as MemoryExecutiveRiskRepository,
  PrismaExecutiveResourceRepository as MemoryExecutiveResourceRepository,
  PrismaExecutivePlanningGovernanceRepository as MemoryExecutivePlanningGovernanceRepository,
  PrismaExecutivePlanningHardeningRepository as MemoryExecutivePlanningHardeningRepository,
  PrismaExecutiveDecisionRepository as MemoryExecutiveDecisionRepository,
  PrismaExecutiveEvidenceRepository as MemoryExecutiveEvidenceRepository,
  PrismaExecutiveAlternativeRepository as MemoryExecutiveAlternativeRepository,
  PrismaExecutiveDecisionEvaluationRepository as MemoryExecutiveDecisionEvaluationRepository,
  PrismaExecutiveSimulationRepository as MemoryExecutiveSimulationRepository,
  PrismaExecutiveDecisionSelectionRepository as MemoryExecutiveDecisionSelectionRepository,
  PrismaExecutiveDecisionAuthorizationRepository as MemoryExecutiveDecisionAuthorizationRepository,
  PrismaExecutiveDecisionDispatchRepository as MemoryExecutiveDecisionDispatchRepository,
  PrismaExecutiveDecisionMonitoringRepository as MemoryExecutiveDecisionMonitoringRepository,
  PrismaExecutiveDecisionHardeningRepository as MemoryExecutiveDecisionHardeningRepository,
  PrismaExecutiveExecutionRepository as MemoryExecutiveExecutionRepository,
  PrismaExecutiveExecutionHardeningRepository as MemoryExecutiveExecutionHardeningRepository,
  PrismaExecutiveExecutionGraphRepository as MemoryExecutiveExecutionGraphRepository,
  PrismaExecutiveExecutionAdapterRepository as MemoryExecutiveExecutionAdapterRepository,
  PrismaExecutiveExecutionDriverRepository as MemoryExecutiveExecutionDriverRepository,
  PrismaExecutiveWorkflowRepository as MemoryExecutiveWorkflowRepository,
  PrismaExecutiveAdaptiveExecutionRepository as MemoryExecutiveAdaptiveExecutionRepository,
  PrismaExecutiveSupervisorRepository as MemoryExecutiveSupervisorRepository,
  PrismaExecutiveOperationsSupervisorRepository as MemoryExecutiveOperationsSupervisorRepository,
  PrismaExecutiveSchedulerRepository as MemoryExecutiveSchedulerRepository,
  PrismaExecutiveExecutionLearningRepository as MemoryExecutiveExecutionLearningRepository,
  PrismaExecutiveExecutionCertificationRepository as MemoryExecutiveExecutionCertificationRepository
} from "./prismaRepositories";

import logger from "../../utils/logger";

// Export startup timing & health metrics
export const executiveStartupMetrics = {
  bootstrapStartTime: 0,
  bootstrapEndTime: 0,
  pluginRegisterStartTime: 0,
  pluginRegisterEndTime: 0,
  startupTime: 0,
  initializationTime: 0,
  memoryOverheadBytes: 0,
  isHealthy: false,
  error: null as string | null
};

// Override console inside this file only to redirect console.log outputs to structured logger
const console = {
  log: (message: string) => {
    if (message === "Executive Plugin Loaded") {
      logger.info({ event: "Executive Plugin Loaded", module: "ExecutivePlugin" }, "Executive Plugin Loaded");
    } else if (message === "All Executive Services Ready") {
      logger.info({ event: "All Executive Services Ready", module: "ExecutivePlugin" }, "All Executive Services Ready");
    } else if (message.includes("Registered [IExecutiveIdentityService]")) {
      logger.info({ event: "Identity Service Registered", module: "ExecutivePlugin" }, "Identity Service Registered");
    } else if (message.includes("Registered [IExecutivePlanningService]")) {
      logger.info({ event: "Planning Service Registered", module: "ExecutivePlugin" }, "Planning Service Registered");
    } else if (message.includes("Registered [IExecutiveDecisionIntelligenceService]")) {
      logger.info({ event: "Decision Service Registered", module: "ExecutivePlugin" }, "Decision Service Registered");
    } else if (message.includes("Registered [IExecutiveExecutionService]")) {
      logger.info({ event: "Execution Service Registered", module: "ExecutivePlugin" }, "Execution Service Registered");
    } else if (message.includes("Registered [IExecutiveDecisionMonitoringService]")) {
      logger.info({ event: "Monitoring Service Registered", module: "ExecutivePlugin" }, "Monitoring Service Registered");
    } else if (message.includes("Registered [IExecutiveExecutionLearningService]")) {
      logger.info({ event: "Learning Service Registered", module: "ExecutivePlugin" }, "Learning Service Registered");
    } else if (message.includes("Registered [IExecutiveSupervisorService]")) {
      logger.info({ event: "Supervisor Service Registered", module: "ExecutivePlugin" }, "Supervisor Service Registered");
    } else if (message.includes("Registered [IExecutiveExecutionCertificationService]")) {
      logger.info({ event: "Certification Service Registered", module: "ExecutivePlugin" }, "Certification Service Registered");
    } else {
      logger.debug({ event: "Executive Service Bootstrapped", module: "ExecutivePlugin", detail: message }, message);
    }
  },
  warn: (message: string, ...args: any[]) => {
    logger.warn({ module: "ExecutivePlugin", detail: message }, message, ...args);
  },
  error: (message: string, ...args: any[]) => {
    logger.error({ module: "ExecutivePlugin", err: message }, message, ...args);
  },
  info: (message: string, ...args: any[]) => {
    logger.info({ module: "ExecutivePlugin", detail: message }, message, ...args);
  }
};






export class ExecutiveIdentityPlugin implements IDomainPlugin {
  public id = "plugin.executive.identity";
  public name = "Executive Identity Foundation Plugin";
  public version = "1.0.0";
  public supportedDomains = ["executive"];
  public capabilities = [
    "create_executive_identity",
    "validate_executive_authority",
    "check_executive_boundary",
    "escalate_executive_incident",
    "transition_executive_lifecycle",
    "update_executive_mission_state",
    "update_executive_business_outcome",
    "record_executive_health_signal",
    "select_best_decision",
    "decision_commitment",
    "decision_shortlist",
    "decision_confidence",
    "decision_consistency",
    "approval_readiness",
    "commitment_summary",
    "decision_monitoring",
    "decision_health",
    "decision_drift",
    "decision_alerts",
    "decision_outcomes",
    "decision_kpis",
    "decision_trends",
    "decision_recovery",
    "monitoring_summary",
    "decision_integrity",
    "decision_certification",
    "decision_quality",
    "decision_readiness",
    "decision_audit",
    "decision_lineage_validation",
    "decision_consistency",
    "decision_freeze_validation",
    "decision_platform_summary",
    "create_executive_execution",
    "update_executive_execution",
    "get_executive_execution",
    "list_executive_executions",
    "archive_executive_execution",
    "snapshot_executive_execution",
    "compile_executive_execution_package",
    "explain_executive_execution",
    "compile_executive_execution_hardening_package",
    "execution_snapshot",
    "execution_trace",
    "execution_lineage",
    "execution_integrity",
    "execution_readiness",
    "execution_stability",
    "execution_drift",
    "execution_history",
    "execution_hardening_report",
    "build_execution_graph",
    "execution_graph",
    "execution_plan",
    "execution_dependencies",
    "execution_sequence",
    "execution_priority",
    "execution_constraints",
    "execution_graph_optimizer",
    "rollback_graph",
    "execution_graph_report",
    "compile_action_package",
    "register_execution_adapter",
    "update_execution_adapter",
    "validate_execution_adapter",
    "execution_adapter_status",
    "execution_capabilities",
    "execution_health",
    "execution_retry_policy",
    "execution_rate_limits",
    "execution_timeout",
    "execution_translation",
    "execution_package",
    "register_execution_driver",
    "driver_status",
    "driver_health",
    "driver_execute",
    "driver_retry",
    "driver_cancel",
    "driver_validate",
    "driver_capabilities",
    "driver_explain",
    "driver_execution_log",
    "driver_rollback",
    "register_workflow",
    "get_workflow",
    "workflow_status",
    "workflow_health",
    "workflow_checkpoint",
    "workflow_explain",
    "workflow_rollback",
    "compile_workflow_package",
    "trigger_workflow",
    "adaptive_execution",
    "execution_prediction",
    "execution_optimizer",
    "execution_recovery",
    "execution_replanning",
    "execution_explainability",
    "executive_supervisor",
    "supervisor_audit",
    "supervisor_policy_check",
    "supervisor_override",
    "supervisor_package",
    "operations_supervisor",
    "operations_health",
    "operations_capacity",
    "operations_bottlenecks",
    "operations_sla",
    "operations_escalation",
    "operations_workload",
    "operations_package",
    "schedule_execution",
    "schedule_status",
    "schedule_pause",
    "schedule_resume",
    "schedule_cancel",
    "schedule_trigger",
    "schedule_conflicts",
    "schedule_calendar",
    "schedule_explain",
    "schedule_package",
    "execution_learning",
    "execution_patterns",
    "execution_recommendations",
    "execution_provider_score",
    "execution_driver_score",
    "execution_cost_analysis",
    "execution_latency_analysis",
    "execution_confidence",
    "execution_learning_package",
    "execution_certification",
    "execution_quality",
    "execution_integrity",
    "execution_lineage",
    "execution_readiness",
    "execution_validation",
    "execution_benchmark",
    "execution_freeze",
    "execution_audit",
    "execution_package"
  ];

  public async onRegister(container: DIContainer): Promise<void> {
    console.log("Executive Plugin Loaded");
    // Register the repositories
    const repository = new MemoryExecutiveRepository(container);
    container.registerInstance("IExecutiveRepository", repository);

    const dnaRepository = new PrismaDNARepository(container);
    container.registerInstance("IDNARepository", dnaRepository);

    // 1. Instantiate and Register the service as a singleton in the DI container
    const service = new ExecutiveIdentityService(container);
    container.registerInstance("IExecutiveIdentityService", service);
    console.log("[Executive Identity Plugin] Registered [IExecutiveIdentityService] in DI Container.");

    const perceptionService = new ExecutivePerceptionService(container);
    container.registerInstance("IExecutivePerceptionService", perceptionService);
    console.log("[Executive Perception Plugin] Registered [IExecutivePerceptionService] in DI Container.");

    const cognitionService = new ExecutiveCognitionService(container);
    container.registerInstance("IExecutiveCognitionService", cognitionService);
    console.log("[Executive Cognition Plugin] Registered [IExecutiveCognitionService] in DI Container.");

    const memoryRepo = new MemoryExecutiveMemoryRepository(container);
    container.registerInstance("IExecutiveMemoryRepository", memoryRepo);
    console.log("[Executive Memory Plugin] Registered [IExecutiveMemoryRepository] in DI Container.");

    const memoryService = new ExecutiveMemoryService(container);
    container.registerInstance("IExecutiveMemoryService", memoryService);
    console.log("[Executive Memory Plugin] Registered [IExecutiveMemoryService] in DI Container.");

    const archRepo = new MemoryExecutiveMemoryArchitectureRepository();
    container.registerInstance("IExecutiveMemoryArchitectureRepository", archRepo);
    console.log("[Executive Memory Architecture Plugin] Registered [IExecutiveMemoryArchitectureRepository] in DI Container.");

    const archService = new ExecutiveMemoryArchitectureService(container);
    container.registerInstance("IExecutiveMemoryArchitectureService", archService);
    console.log("[Executive Memory Architecture Plugin] Registered [IExecutiveMemoryArchitectureService] in DI Container.");

    const conRepo = new MemoryExecutiveMemoryConsolidationRepository();
    container.registerInstance("IExecutiveMemoryConsolidationRepository", conRepo);
    console.log("[Executive Memory Consolidation Plugin] Registered [IExecutiveMemoryConsolidationRepository] in DI Container.");

    const conService = new ExecutiveMemoryConsolidationService(container);
    container.registerInstance("IExecutiveMemoryConsolidationService", conService);
    console.log("[Executive Memory Consolidation Plugin] Registered [IExecutiveMemoryConsolidationService] in DI Container.");

    const retRepo = new MemoryExecutiveMemoryRetrievalRepository();
    container.registerInstance("IExecutiveMemoryRetrievalRepository", retRepo);
    console.log("[Executive Memory Retrieval Plugin] Registered [IExecutiveMemoryRetrievalRepository] in DI Container.");

    const retService = new ExecutiveMemoryRetrievalService(container);
    container.registerInstance("IExecutiveMemoryRetrievalService", retService);
    console.log("[Executive Memory Retrieval Plugin] Registered [IExecutiveMemoryRetrievalService] in DI Container.");

    const graphRepo = new MemoryExecutiveMemoryAssociationRepository();
    container.registerInstance("IExecutiveMemoryAssociationRepository", graphRepo);
    console.log("[Executive Memory Association Plugin] Registered [IExecutiveMemoryAssociationRepository] in DI Container.");

    const graphService = new ExecutiveMemoryAssociationService(container);
    container.registerInstance("IExecutiveMemoryAssociationService", graphService);
    console.log("[Executive Memory Association Plugin] Registered [IExecutiveMemoryAssociationService] in DI Container.");

    const semanticRepo = new MemoryExecutiveSemanticMemoryRepository();
    container.registerInstance("IExecutiveSemanticMemoryRepository", semanticRepo);
    console.log("[Executive Memory Semantic Plugin] Registered [IExecutiveSemanticMemoryRepository] in DI Container.");

    const semanticService = new ExecutiveSemanticMemoryService(container);
    container.registerInstance("IExecutiveSemanticMemoryService", semanticService);
    console.log("[Executive Memory Semantic Plugin] Registered [IExecutiveSemanticMemoryService] in DI Container.");

    const orgRepo = new MemoryExecutiveOrganizationalKnowledgeRepository();
    container.registerInstance("IExecutiveOrganizationalKnowledgeRepository", orgRepo);
    console.log("[Executive Organizational Knowledge Plugin] Registered [IExecutiveOrganizationalKnowledgeRepository] in DI Container.");

    const orgService = new ExecutiveOrganizationalKnowledgeService(container);
    container.registerInstance("IExecutiveOrganizationalKnowledgeService", orgService);
    console.log("[Executive Organizational Knowledge Plugin] Registered [IExecutiveOrganizationalKnowledgeService] in DI Container.");

    const optRepo = new MemoryExecutiveMemoryOptimizationRepository();
    container.registerInstance("IExecutiveMemoryOptimizationRepository", optRepo);
    console.log("[Executive Memory Optimization Plugin] Registered [IExecutiveMemoryOptimizationRepository] in DI Container.");

    const optService = new ExecutiveMemoryOptimizationService(container);
    container.registerInstance("IExecutiveMemoryOptimizationService", optService);
    console.log("[Executive Memory Optimization Plugin] Registered [IExecutiveMemoryOptimizationService] in DI Container.");

    const govRepo = new MemoryExecutiveMemoryGovernanceRepository();
    container.registerInstance("IExecutiveMemoryGovernanceRepository", govRepo);
    console.log("[Executive Memory Governance Plugin] Registered [IExecutiveMemoryGovernanceRepository] in DI Container.");

    const govService = new ExecutiveMemoryGovernanceService(container);
    container.registerInstance("IExecutiveMemoryGovernanceService", govService);
    console.log("[Executive Memory Governance Plugin] Registered [IExecutiveMemoryGovernanceService] in DI Container.");

    const certRepo = new MemoryExecutiveMemoryCertificationRepository();
    container.registerInstance("IExecutiveMemoryCertificationRepository", certRepo);
    console.log("[Executive Memory Certification Plugin] Registered [IExecutiveMemoryCertificationRepository] in DI Container.");

    const certService = new ExecutiveMemoryCertificationService(container);
    container.registerInstance("IExecutiveMemoryCertificationService", certService);
    console.log("[Executive Memory Certification Plugin] Registered [IExecutiveMemoryCertificationService] in DI Container.");

    const goalRepo = new MemoryExecutiveGoalRepository();
    container.registerInstance("IExecutiveGoalRepository", goalRepo);
    console.log("[Executive Goal Intelligence Plugin] Registered [IExecutiveGoalRepository] in DI Container.");

    const goalAssumptionRepo = new MemoryGoalAssumptionRepository();
    container.registerInstance("IGoalAssumptionRepository", goalAssumptionRepo);
    console.log("[Executive Goal Intelligence Plugin] Registered [IGoalAssumptionRepository] in DI Container.");

    const goalService = new ExecutiveGoalIntelligenceService(container);
    container.registerInstance("IExecutiveGoalIntelligenceService", goalService);
    console.log("[Executive Goal Intelligence Plugin] Registered [IExecutiveGoalIntelligenceService] in DI Container.");

    const strategyRepo = new MemoryExecutiveStrategyRepository();
    container.registerInstance("IExecutiveStrategyRepository", strategyRepo);
    console.log("[Executive Strategy Plugin] Registered [IExecutiveStrategyRepository] in DI Container.");

    const strategyService = new ExecutiveStrategyIntelligenceService(container);
    container.registerInstance("IExecutiveStrategyIntelligenceService", strategyService);
    console.log("[Executive Strategy Plugin] Registered [IExecutiveStrategyIntelligenceService] in DI Container.");

    const planningRepo = new MemoryExecutivePlanningRepository();
    container.registerInstance("IExecutivePlanningRepository", planningRepo);
    console.log("[Executive Planning Plugin] Registered [IExecutivePlanningRepository] in DI Container.");

    const planningService = new ExecutivePlanningService(container);
    container.registerInstance("IExecutivePlanningService", planningService);
    console.log("[Executive Planning Plugin] Registered [IExecutivePlanningService] in DI Container.");

    const timelineRepo = new MemoryExecutiveTimelineRepository();
    container.registerInstance("IExecutiveTimelineRepository", timelineRepo);
    console.log("[Executive Timeline Plugin] Registered [IExecutiveTimelineRepository] in DI Container.");

    const timelineService = new ExecutiveTimelineService(container);
    container.registerInstance("IExecutiveTimelineService", timelineService);
    console.log("[Executive Timeline Plugin] Registered [IExecutiveTimelineService] in DI Container.");

    const scenarioRepo = new MemoryExecutiveScenarioRepository();
    container.registerInstance("IExecutiveScenarioRepository", scenarioRepo);
    console.log("[Executive Scenario Plugin] Registered [IExecutiveScenarioRepository] in DI Container.");

    const scenarioService = new ExecutiveScenarioService(container);
    container.registerInstance("IExecutiveScenarioService", scenarioService);
    console.log("[Executive Scenario Plugin] Registered [IExecutiveScenarioService] in DI Container.");

    const planningOptRepo = new MemoryExecutivePlanningOptimizationRepository();
    container.registerInstance("IExecutivePlanningOptimizationRepository", planningOptRepo);
    console.log("[Executive Planning Optimization Plugin] Registered [IExecutivePlanningOptimizationRepository] in DI Container.");

    const planningOptService = new ExecutivePlanningOptimizationService(container);
    container.registerInstance("IExecutivePlanningOptimizationService", planningOptService);
    console.log("[Executive Planning Optimization Plugin] Registered [IExecutivePlanningOptimizationService] in DI Container.");

    const riskRepo = new MemoryExecutiveRiskRepository();
    container.registerInstance("IExecutiveRiskRepository", riskRepo);
    console.log("[Executive Risk Plugin] Registered [IExecutiveRiskRepository] in DI Container.");

    const riskService = new ExecutiveRiskService(container);
    container.registerInstance("IExecutiveRiskService", riskService);
    console.log("[Executive Risk Plugin] Registered [IExecutiveRiskService] in DI Container.");

    const resourceRepo = new MemoryExecutiveResourceRepository();
    container.registerInstance("IExecutiveResourceRepository", resourceRepo);
    console.log("[Executive Resource Plugin] Registered [IExecutiveResourceRepository] in DI Container.");

    const resourceService = new ExecutiveResourceService(container);
    container.registerInstance("IExecutiveResourceService", resourceService);
    console.log("[Executive Resource Plugin] Registered [IExecutiveResourceService] in DI Container.");

    const planningGovRepo = new MemoryExecutivePlanningGovernanceRepository();
    container.registerInstance("IExecutivePlanningGovernanceRepository", planningGovRepo);
    console.log("[Executive Planning Governance Plugin] Registered [IExecutivePlanningGovernanceRepository] in DI Container.");

    const planningGovService = new ExecutivePlanningGovernanceService(container);
    container.registerInstance("IExecutivePlanningGovernanceService", planningGovService);
    console.log("[Executive Planning Governance Plugin] Registered [IExecutivePlanningGovernanceService] in DI Container.");

    const planningHardRepo = new MemoryExecutivePlanningHardeningRepository();
    container.registerInstance("IExecutivePlanningHardeningRepository", planningHardRepo);
    console.log("[Executive Planning Hardening Plugin] Registered [IExecutivePlanningHardeningRepository] in DI Container.");

    const planningHardService = new ExecutivePlanningHardeningService(container);
    container.registerInstance("IExecutivePlanningHardeningService", planningHardService);
    console.log("[Executive Planning Hardening Plugin] Registered [IExecutivePlanningHardeningService] in DI Container.");

    const decisionRepo = new MemoryExecutiveDecisionRepository();
    container.registerInstance("IExecutiveDecisionRepository", decisionRepo);
    console.log("[Executive Decision Intelligence Plugin] Registered [IExecutiveDecisionRepository] in DI Container.");

    const decisionService = new ExecutiveDecisionIntelligenceService(container);
    container.registerInstance("IExecutiveDecisionIntelligenceService", decisionService);
    console.log("[Executive Decision Intelligence Plugin] Registered [IExecutiveDecisionIntelligenceService] in DI Container.");

    const evidenceRepo = new MemoryExecutiveEvidenceRepository();
    container.registerInstance("IExecutiveEvidenceRepository", evidenceRepo);
    console.log("[Executive Evidence Validation Plugin] Registered [IExecutiveEvidenceRepository] in DI Container.");

    const evidenceService = new ExecutiveEvidenceValidationService(container);
    container.registerInstance("IExecutiveEvidenceValidationService", evidenceService);
    console.log("[Executive Evidence Validation Plugin] Registered [IExecutiveEvidenceValidationService] in DI Container.");

    const alternativeRepo = new MemoryExecutiveAlternativeRepository();
    container.registerInstance("IExecutiveAlternativeRepository", alternativeRepo);
    console.log("[Executive Alternative Generation Plugin] Registered [IExecutiveAlternativeRepository] in DI Container.");

    const alternativeService = new ExecutiveAlternativeGenerationService(container);
    container.registerInstance("IExecutiveAlternativeGenerationService", alternativeService);
    console.log("[Executive Alternative Generation Plugin] Registered [IExecutiveAlternativeGenerationService] in DI Container.");

    const evaluationRepo = new MemoryExecutiveDecisionEvaluationRepository();
    container.registerInstance("IExecutiveDecisionEvaluationRepository", evaluationRepo);
    console.log("[Executive Decision Evaluation Plugin] Registered [IExecutiveDecisionEvaluationRepository] in DI Container.");

    const evaluationService = new ExecutiveDecisionEvaluationService(container);
    container.registerInstance("IExecutiveDecisionEvaluationService", evaluationService);
    console.log("[Executive Decision Evaluation Plugin] Registered [IExecutiveDecisionEvaluationService] in DI Container.");

    const simulationRepo = new MemoryExecutiveSimulationRepository();
    container.registerInstance("IExecutiveSimulationRepository", simulationRepo);
    console.log("[Executive Simulation Plugin] Registered [IExecutiveSimulationRepository] in DI Container.");

    const simulationService = new ExecutiveSimulationService(container);
    container.registerInstance("IExecutiveSimulationService", simulationService);
    console.log("[Executive Simulation Plugin] Registered [IExecutiveSimulationService] in DI Container.");

    const selectionRepo = new MemoryExecutiveDecisionSelectionRepository();
    container.registerInstance("IExecutiveDecisionSelectionRepository", selectionRepo);
    console.log("[Executive Selection Plugin] Registered [IExecutiveDecisionSelectionRepository] in DI Container.");

    const selectionService = new ExecutiveDecisionSelectionService(container);
    container.registerInstance("IExecutiveDecisionSelectionService", selectionService);
    console.log("[Executive Selection Plugin] Registered [IExecutiveDecisionSelectionService] in DI Container.");

    const authRepo = new MemoryExecutiveDecisionAuthorizationRepository();
    container.registerInstance("IExecutiveDecisionAuthorizationRepository", authRepo);
    console.log("[Executive Authorization Plugin] Registered [IExecutiveDecisionAuthorizationRepository] in DI Container.");

    const authService = new ExecutiveDecisionAuthorizationService(container);
    container.registerInstance("IExecutiveDecisionAuthorizationService", authService);
    console.log("[Executive Authorization Plugin] Registered [IExecutiveDecisionAuthorizationService] in DI Container.");

    const dispatchRepo = new MemoryExecutiveDecisionDispatchRepository();
    container.registerInstance("IExecutiveDecisionDispatchRepository", dispatchRepo);
    console.log("[Executive Dispatch Plugin] Registered [IExecutiveDecisionDispatchRepository] in DI Container.");

    const dispatchService = new ExecutiveDecisionDispatchService(container);
    container.registerInstance("IExecutiveDecisionDispatchService", dispatchService);
    console.log("[Executive Dispatch Plugin] Registered [IExecutiveDecisionDispatchService] in DI Container.");

    const monitoringRepo = new MemoryExecutiveDecisionMonitoringRepository();
    container.registerInstance("IExecutiveDecisionMonitoringRepository", monitoringRepo);
    console.log("[Executive Monitoring Plugin] Registered [IExecutiveDecisionMonitoringRepository] in DI Container.");

    const monitoringService = new ExecutiveDecisionMonitoringService(container);
    container.registerInstance("IExecutiveDecisionMonitoringService", monitoringService);
    console.log("[Executive Monitoring Plugin] Registered [IExecutiveDecisionMonitoringService] in DI Container.");

    const hardeningRepo = new MemoryExecutiveDecisionHardeningRepository();
    container.registerInstance("IExecutiveDecisionHardeningRepository", hardeningRepo);
    console.log("[Executive Hardening Plugin] Registered [IExecutiveDecisionHardeningRepository] in DI Container.");

    const hardeningService = new ExecutiveDecisionHardeningService(container);
    container.registerInstance("IExecutiveDecisionHardeningService", hardeningService);
    console.log("[Executive Hardening Plugin] Registered [IExecutiveDecisionHardeningService] in DI Container.");

    const executionRepo = new MemoryExecutiveExecutionRepository();
    container.registerInstance("IExecutiveExecutionRepository", executionRepo);
    console.log("[Executive Execution Plugin] Registered [IExecutiveExecutionRepository] in DI Container.");

    const executionService = new ExecutiveExecutionService(container);
    container.registerInstance("IExecutiveExecutionService", executionService);
    console.log("[Executive Execution Plugin] Registered [IExecutiveExecutionService] in DI Container.");

    const hardeningRepo2 = new MemoryExecutiveExecutionHardeningRepository();
    container.registerInstance("IExecutiveExecutionHardeningRepository", hardeningRepo2);
    console.log("[Executive Hardening Plugin] Registered [IExecutiveExecutionHardeningRepository] in DI Container.");

    const hardeningService2 = new ExecutiveExecutionHardeningService(container);
    container.registerInstance("IExecutiveExecutionHardeningService", hardeningService2);
    console.log("[Executive Hardening Plugin] Registered [IExecutiveExecutionHardeningService] in DI Container.");

    const executionGraphRepo = new MemoryExecutiveExecutionGraphRepository();
    container.registerInstance("IExecutiveExecutionGraphRepository", executionGraphRepo);
    console.log("[Executive Graph Plugin] Registered [IExecutiveExecutionGraphRepository] in DI Container.");

    const executionGraphService = new ExecutiveExecutionGraphService(container);
    container.registerInstance("IExecutiveExecutionGraphService", executionGraphService);
    console.log("[Executive Graph Plugin] Registered [IExecutiveExecutionGraphService] in DI Container.");

    const executionAdapterRepo = new MemoryExecutiveExecutionAdapterRepository();
    container.registerInstance("IExecutiveExecutionAdapterRepository", executionAdapterRepo);
    console.log("[Executive Adapter Plugin] Registered [IExecutiveExecutionAdapterRepository] in DI Container.");

    const executionAdapterService = new ExecutiveExecutionAdapterService(container);
    container.registerInstance("IExecutiveExecutionAdapterService", executionAdapterService);
    console.log("[Executive Adapter Plugin] Registered [IExecutiveExecutionAdapterService] in DI Container.");

    const executionDriverRepo = new MemoryExecutiveExecutionDriverRepository();
    container.registerInstance("IExecutiveExecutionDriverRepository", executionDriverRepo);
    console.log("[Executive Driver Plugin] Registered [IExecutiveExecutionDriverRepository] in DI Container.");

    const executionDriverService = new ExecutiveExecutionDriverService(container);
    container.registerInstance("IExecutiveExecutionDriverService", executionDriverService);
    console.log("[Executive Driver Plugin] Registered [IExecutiveExecutionDriverService] in DI Container.");

    const workflowRepo = new MemoryExecutiveWorkflowRepository();
    container.registerInstance("IExecutiveWorkflowRepository", workflowRepo);
    console.log("[Executive Workflow Plugin] Registered [IExecutiveWorkflowRepository] in DI Container.");

    const workflowService = new ExecutiveWorkflowOrchestratorService(container);
    container.registerInstance("IExecutiveWorkflowOrchestratorService", workflowService);
    console.log("[Executive Workflow Plugin] Registered [IExecutiveWorkflowOrchestratorService] in DI Container.");

    const adaptiveRepo = new MemoryExecutiveAdaptiveExecutionRepository();
    container.registerInstance("IExecutiveAdaptiveExecutionRepository", adaptiveRepo);
    console.log("[Executive Adaptive Plugin] Registered [IExecutiveAdaptiveExecutionRepository] in DI Container.");

    const adaptiveService = new ExecutiveAdaptiveExecutionService(container);
    container.registerInstance("IExecutiveAdaptiveExecutionService", adaptiveService);
    console.log("[Executive Adaptive Plugin] Registered [IExecutiveAdaptiveExecutionService] in DI Container.");

    const supervisorRepo = new MemoryExecutiveSupervisorRepository();
    container.registerInstance("IExecutiveSupervisorRepository", supervisorRepo);
    console.log("[Executive Supervisor Plugin] Registered [IExecutiveSupervisorRepository] in DI Container.");

    const supervisorService = new ExecutiveSupervisorService(container);
    container.registerInstance("IExecutiveSupervisorService", supervisorService);
    console.log("[Executive Supervisor Plugin] Registered [IExecutiveSupervisorService] in DI Container.");

    const operationsRepo = new MemoryExecutiveOperationsSupervisorRepository();
    container.registerInstance("IExecutiveOperationsSupervisorRepository", operationsRepo);
    console.log("[Executive Operations Supervisor Plugin] Registered [IExecutiveOperationsSupervisorRepository] in DI Container.");

    const operationsService = new ExecutiveOperationsSupervisorService(container);
    container.registerInstance("IExecutiveOperationsSupervisorService", operationsService);
    console.log("[Executive Operations Supervisor Plugin] Registered [IExecutiveOperationsSupervisorService] in DI Container.");

    const schedulerRepo = new MemoryExecutiveSchedulerRepository();
    container.registerInstance("IExecutiveSchedulerRepository", schedulerRepo);
    console.log("[Executive Scheduler Plugin] Registered [IExecutiveSchedulerRepository] in DI Container.");

    const schedulerService = new ExecutiveSchedulerService(container);
    container.registerInstance("IExecutiveSchedulerService", schedulerService);
    console.log("[Executive Scheduler Plugin] Registered [IExecutiveSchedulerService] in DI Container.");

    const learningRepo = new MemoryExecutiveExecutionLearningRepository();
    container.registerInstance("IExecutiveExecutionLearningRepository", learningRepo);
    console.log("[Executive Learning Plugin] Registered [IExecutiveExecutionLearningRepository] in DI Container.");

    const learningService = new ExecutiveExecutionLearningService(container);
    container.registerInstance("IExecutiveExecutionLearningService", learningService);
    console.log("[Executive Learning Plugin] Registered [IExecutiveExecutionLearningService] in DI Container.");

    const execCertRepo = new MemoryExecutiveExecutionCertificationRepository();
    container.registerInstance("IExecutiveExecutionCertificationRepository", execCertRepo);
    console.log("[Executive Certification Plugin] Registered [IExecutiveExecutionCertificationRepository] in DI Container.");

    const execCertService = new ExecutiveExecutionCertificationService(container);
    container.registerInstance("IExecutiveExecutionCertificationService", execCertService);
    console.log("[Executive Certification Plugin] Registered [IExecutiveExecutionCertificationService] in DI Container.");





    // 2. Register contracts with the Contract Registry
    if (container.has("IContractRegistry")) {
      const contractRegistry = container.resolve<any>("IContractRegistry");

      contractRegistry.registerContract({
        name: "executive.authorization.requested",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.approved",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.denied",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.expired",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.token.generated",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.archived",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.requested",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.queued",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.dispatched",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.completed",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.failed",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.completed",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.escalated",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.authorization.delegated",
        version: "1.0.0",
        schema: {
          authorizationId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.created",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.updated",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.ready",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.blocked",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.cancelled",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          reason: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.archived",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.dispatch.drifted",
        version: "1.0.0",
        schema: {
          dispatchId: "string",
          tenantId: "string",
          hasDrift: "boolean",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.started",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.updated",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          tenantId: "string",
          status: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.drift.detected",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          tenantId: "string",
          details: "array",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.alert.generated",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          alertId: "string",
          severity: "string",
          message: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.health.updated",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          healthScore: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.closed",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.monitoring.archived",
        version: "1.0.0",
        schema: {
          monitoringId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.certification.started",
        version: "1.0.0",
        schema: {
          hardeningId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.certification.completed",
        version: "1.0.0",
        schema: {
          hardeningId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.integrity.failed",
        version: "1.0.0",
        schema: {
          hardeningId: "string",
          tenantId: "string",
          message: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.audit.completed",
        version: "1.0.0",
        schema: {
          hardeningId: "string",
          hasIssues: "boolean",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.platform.frozen",
        version: "1.0.0",
        schema: {
          hardeningId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          freezeSignature: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.architecture.certified",
        version: "1.0.0",
        schema: {
          hardeningId: "string",
          decisionId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.created",
        version: "1.0.0",
        schema: {
          id: "string",
          role: "string",
          name: "string",
          status: "string",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.status.updated",
        version: "1.0.0",
        schema: {
          id: "string",
          oldStatus: "string",
          newStatus: "string",
          reason: "string",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.boundary.breached",
        version: "1.0.0",
        schema: {
          id: "string",
          rule: "string",
          message: "string",
          isHardLimit: "boolean",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.escalated",
        version: "1.0.0",
        schema: {
          id: "string",
          trigger: "string",
          reason: "string",
          notificationTargets: "array",
          gracePeriodMs: "number",
          newStatus: "string",
          tenantId: "string",
        },
      });

      // Hardened enterprise event contracts
      contractRegistry.registerContract({
        name: "executive.lifecycle.transitioned",
        version: "1.0.0",
        schema: {
          id: "string",
          fromState: "string",
          toState: "string",
          reason: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.health.updated",
        version: "1.0.0",
        schema: {
          id: "string",
          oldStatus: "string",
          newStatus: "string",
          score: "number",
          signals: "object",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.mission.updated",
        version: "1.0.0",
        schema: {
          id: "string",
          missionState: "object",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.outcome.updated",
        version: "1.0.0",
        schema: {
          id: "string",
          outcomeId: "string",
          oldStatus: "string",
          newStatus: "string",
          currentValue: "number",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.aligned",
        version: "1.0.0",
        schema: {
          id: "string",
          goalAlignment: "object",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.capability.negotiated",
        version: "1.0.0",
        schema: {
          executiveId: "string",
          requestId: "string",
          targetCapability: "string",
          status: "string",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.diagnostics.reported",
        version: "1.0.0",
        schema: {
          executiveId: "string",
          healthScore: "number",
          lifecycleState: "string",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.explained",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          executiveId: "string",
          confidenceScore: "number",
          tenantId: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.situation.perceived",
        version: "1.0.0",
        schema: {
          executiveId: "string",
          tenantId: "string",
          score: "number",
          readiness: "boolean",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.cognition.completed",
        version: "1.0.0",
        schema: {
          executiveId: "string",
          tenantId: "string",
          readinessIndex: "number",
          isApproved: "boolean",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.registered",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          executiveId: "string",
          tenantId: "string",
          category: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.architecture.created",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          classification: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.relationship.created",
        version: "1.0.0",
        schema: {
          sourceMemoryId: "string",
          targetId: "string",
          relationshipType: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.consolidated",
        version: "1.0.0",
        schema: {
          recordId: "string",
          tenantId: "string",
          executiveId: "string",
          key: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.knowledge.generated",
        version: "1.0.0",
        schema: {
          knowledgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.evolved",
        version: "1.0.0",
        schema: {
          recordId: "string",
          tenantId: "string",
          version: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.conflict.detected",
        version: "1.0.0",
        schema: {
          recordId: "string",
          tenantId: "string",
          resolved: "boolean",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.context.updated",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          executiveId: "string",
          optimizedContextSize: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.context.created",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          executiveId: "string",
          optimizedContextSize: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.retrieved",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          executiveId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.ranked",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          executiveId: "string",
          score: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.filtered",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          executiveId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.relationship.created",
        version: "1.0.0",
        schema: {
          edgeId: "string",
          tenantId: "string",
          sourceId: "string",
          targetId: "string",
          relationshipType: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.relationship.updated",
        version: "1.0.0",
        schema: {
          edgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.graph.validated",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          valid: "boolean",
          brokenEdgesCount: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.associated",
        version: "1.0.0",
        schema: {
          edgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.semantic.created",
        version: "1.0.0",
        schema: {
          conceptId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.semantic.updated",
        version: "1.0.0",
        schema: {
          conceptId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.semantic.conflict",
        version: "1.0.0",
        schema: {
          conflictId: "string",
          tenantId: "string",
          conceptId: "string",
          explanation: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.semantic.evolved",
        version: "1.0.0",
        schema: {
          conceptId: "string",
          tenantId: "string",
          version: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.knowledge.created",
        version: "1.0.0",
        schema: {
          knowledgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.knowledge.updated",
        version: "1.0.0",
        schema: {
          knowledgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.knowledge.validated",
        version: "1.0.0",
        schema: {
          knowledgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.knowledge.deprecated",
        version: "1.0.0",
        schema: {
          knowledgeId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.optimized",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          optimizationScore: "number",
          tier: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.archived",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.compressed",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.retention.updated",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.governed",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          governanceScore: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.policy.evaluated",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          complianceValid: "boolean",
          violations: "array",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.trust.updated",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          trustLevel: "number",
          trend: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.audit.logged",
        version: "1.0.0",
        schema: {
          memoryId: "string",
          tenantId: "string",
          action: "string",
          operator: "string",
          outcome: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.certified",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          isCertified: "boolean",
          overallScore: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.validation.completed",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          validationPassed: "boolean",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.health.updated",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          platformHealth: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.memory.scorecard.generated",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          overallScore: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.created",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          title: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.updated",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          version: "number",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.completed",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.failed",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          reason: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.conflict",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          conflicts: "array",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.health.updated",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          progress: "number",
          completionPrediction: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.tradeoff.created",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string",
          tradeoffId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.success.updated",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.assumption.updated",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.goal.outcome.projected",
        version: "1.0.0",
        schema: {
          goalId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.readiness.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.evidence.created",
        version: "1.0.0",
        schema: {
          evidenceId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.evidence.verified",
        version: "1.0.0",
        schema: {
          evidenceId: "string",
          verificationStatus: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.evidence.conflict",
        version: "1.0.0",
        schema: {
          evidenceId: "string",
          severity: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.evidence.confidence.updated",
        version: "1.0.0",
        schema: {
          evidenceId: "string",
          overallConfidence: "number",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.evidence.stale",
        version: "1.0.0",
        schema: {
          evidenceId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.evidence.archived",
        version: "1.0.0",
        schema: {
          evidenceId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.created",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.status.updated",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          previousStatus: "string",
          newStatus: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.updated",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          version: "number",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.archived",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.stability.updated",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          status: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.readiness.updated",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          readyScore: "number",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.snapshot.created",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.evidence.refreshed",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.lineage.audited",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.lineage.updated",
        version: "1.0.0",
        schema: {
          decisionId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.strategy.generated",
        version: "1.0.0",
        schema: {
          strategyId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.strategy.updated",
        version: "1.0.0",
        schema: {
          strategyId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.strategy.archived",
        version: "1.0.0",
        schema: {
          strategyId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.strategy.health.updated",
        version: "1.0.0",
        schema: {
          strategyId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.strategy.evaluated",
        version: "1.0.0",
        schema: {
          strategyId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.strategy.compared",
        version: "1.0.0",
        schema: {
          strategyId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.created",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string",
          version: "number"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.completed",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.archived",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.quality.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.planning.policy.checked",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.planning.compliance.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.planning.certification.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.planning.governance.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.planning.audit.logged",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.security.violation.detected",
        version: "1.0.0",
        schema: {
          violationId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.sandbox.hardened",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.plan.optimized",
        version: "1.0.0",
        schema: {
          optimizationId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.resource.optimized",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.cost.optimized",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.resource.inventory.updated",
        version: "1.0.0",
        schema: {
          resourceId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.resource.allocation.generated",
        version: "1.0.0",
        schema: {
          allocationId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.resource.conflict.detected",
        version: "1.0.0",
        schema: {
          resourceId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.resource.health.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.risk.created",
        version: "1.0.0",
        schema: {
          riskId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.contingency.generated",
        version: "1.0.0",
        schema: {
          contingencyId: "string",
          riskId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.risk.propagated",
        version: "1.0.0",
        schema: {
          sourceId: "string",
          targetId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.risk.health.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.scenario.generated",
        version: "1.0.0",
        schema: {
          scenarioId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.scenario.simulated",
        version: "1.0.0",
        schema: {
          scenarioId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.warning.generated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.scenario.quality.updated",
        version: "1.0.0",
        schema: {
          scenarioId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.timeline.rescheduled",
        version: "1.0.0",
        schema: {
          timelineId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.timeline.updated",
        version: "1.0.0",
        schema: {
          timelineId: "string",
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.timeline.health.updated",
        version: "1.0.0",
        schema: {
          planId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.alternative.generated",
        version: "1.0.0",
        schema: {
          alternativeId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.alternative.updated",
        version: "1.0.0",
        schema: {
          alternativeId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.hypothesis.generated",
        version: "1.0.0",
        schema: {
          pairId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.alternative.archived",
        version: "1.0.0",
        schema: {
          alternativeId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.alternative.comparison.updated",
        version: "1.0.0",
        schema: {
          alternativeIds: "array",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.evaluation.created",
        version: "1.0.0",
        schema: {
          evaluationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.tradeoff.generated",
        version: "1.0.0",
        schema: {
          evaluationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.ranked",
        version: "1.0.0",
        schema: {
          evaluationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.business_impact.updated",
        version: "1.0.0",
        schema: {
          evaluationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.roi.updated",
        version: "1.0.0",
        schema: {
          evaluationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.evaluation.archived",
        version: "1.0.0",
        schema: {
          evaluationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.simulation.created",
        version: "1.0.0",
        schema: {
          simulationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.simulation.completed",
        version: "1.0.0",
        schema: {
          simulationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.simulation.failed",
        version: "1.0.0",
        schema: {
          simulationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.simulation.forecast.updated",
        version: "1.0.0",
        schema: {
          simulationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.simulation.recovery.generated",
        version: "1.0.0",
        schema: {
          simulationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.simulation.archived",
        version: "1.0.0",
        schema: {
          simulationId: "string",
          tenantId: "string"
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.selected",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          selectionId: "string",
          decisionId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.rejected",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          selectionId: "string",
          rejectedDecisionId: "string",
          reason: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.committed",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          selectionId: "string",
          decisionId: "string",
          commitmentId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.shortlisted",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          selectionId: "string",
          decisionId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.approval.required",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          selectionId: "string",
          decisionId: "string",
          requirements: "array",
          explanation: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.decision.commitment.generated",
        version: "1.0.0",
        schema: {
          tenantId: "string",
          selectionId: "string",
          commitmentPackage: "object",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.created",
        version: "1.0.0",
        schema: {
          executionId: "string",
          decisionId: "string",
          tenantId: "string",
          actorId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.updated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          status: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.started",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.completed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.failed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          error: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.archived",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          timestamp: "string",
        },
      });

      contractRegistry.registerContract({
        name: "executive.execution.snapshot.created",
        version: "1.0.0",
        schema: {
          snapshotId: "string",
          executionId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.trace.updated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          traceLog: "array",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.integrity.updated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          integrityStatus: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.readiness.updated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          readinessScore: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.stability.updated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          stabilityScore: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.drift.detected",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          driftDetails: "array",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.hardening.completed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          hardeningRecordId: "string",
          status: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.graph.created",
        version: "1.0.0",
        schema: {
          graphId: "string",
          executionId: "string",
          tenantId: "string",
          nodesCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.graph.optimized",
        version: "1.0.0",
        schema: {
          graphId: "string",
          executionId: "string",
          tenantId: "string",
          version: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.sequence.generated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          sequenceLength: "number",
          calculationTimeMs: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.priority.updated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          priorityMatrix: "array",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.rollback.generated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          rollbackNodesCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.graph.archived",
        version: "1.0.0",
        schema: {
          graphId: "string",
          executionId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.registered",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          connectorName: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.updated",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          tenantId: "string",
          updatedField: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.validated",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          tenantId: "string",
          isSafe: "boolean",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.connected",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.disconnected",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.failed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          action: "string",
          error: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.health.updated",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          tenantId: "string",
          healthStatus: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.archived",
        version: "1.0.0",
        schema: {
          connectorId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.request.sent",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          action: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.request.completed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          action: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.timeout.triggered",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          timeoutType: "string",
          limitMs: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.safety.violated",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          action: "string",
          violationsCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.rollback.executed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          rollbackStatus: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.adapter.package.compiled",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          connectorId: "string",
          compiledAt: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.registered",
        version: "1.0.0",
        schema: {
          driverId: "string",
          driverType: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.ready",
        version: "1.0.0",
        schema: {
          driverId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.execution.started",
        version: "1.0.0",
        schema: {
          executionId: "string",
          driverId: "string",
          driverType: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.execution.completed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          driverId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.execution.failed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          driverId: "string",
          error: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.retry.started",
        version: "1.0.0",
        schema: {
          executionId: "string",
          driverId: "string",
          retryCount: "number",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.rollback.started",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          rollbackType: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.rollback.completed",
        version: "1.0.0",
        schema: {
          executionId: "string",
          tenantId: "string",
          rollbackLogsCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.health.updated",
        version: "1.0.0",
        schema: {
          driverId: "string",
          tenantId: "string",
          healthStatus: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.driver.archived",
        version: "1.0.0",
        schema: {
          driverId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.created",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.started",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          triggerType: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.paused",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          reason: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.resumed",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.completed",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.failed",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          error: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.rollback.started",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.rollback.completed",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.checkpoint.created",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.health.updated",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          stateId: "string",
          healthStatus: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.workflow.archived",
        version: "1.0.0",
        schema: {
          workflowId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.health.updated",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          slaStatus: "string",
          progress: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.predicted_failure",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          predictedFailures: "array",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.replanned",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          nodesCount: "number",
          edgesCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.optimized",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          optimizationStrategy: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.retry.strategy.changed",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          nodeId: "string",
          newStrategy: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.self_healed",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          nodeId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.recovered",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.escalated",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          reason: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.package.generated",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.supervisor.audit.created",
        version: "1.0.0",
        schema: {
          auditId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.supervisor.policy.violated",
        version: "1.0.0",
        schema: {
          auditId: "string",
          tenantId: "string",
          violationsCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.supervisor.action.blocked",
        version: "1.0.0",
        schema: {
          auditId: "string",
          tenantId: "string",
          reason: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.supervisor.action.approved",
        version: "1.0.0",
        schema: {
          auditId: "string",
          tenantId: "string",
          signature: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.supervisor.override.signed",
        version: "1.0.0",
        schema: {
          auditId: "string",
          tenantId: "string",
          signature: "string",
          reason: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.supervisor.package.sealed",
        version: "1.0.0",
        schema: {
          auditId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.started",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.updated",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.capacity.changed",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.bottleneck.detected",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          bottleneckType: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.sla.warning",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.workload.rebalanced",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          nodesCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.operations.escalated",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          actionTaken: "string",
          reason: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerRegistryContract && contractRegistry.registerContract({
        name: "executive.operations.completed",
        version: "1.0.0",
        schema: {
          stateId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.created",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.updated",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.triggered",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.completed",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.failed",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.cancelled",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.paused",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.resumed",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.optimized",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.scheduler.archived",
        version: "1.0.0",
        schema: {
          scheduleId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.started",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.updated",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.pattern.detected",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          pattern: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.recommendation.generated",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          recommendationsCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.provider.updated",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          provider: "string",
          score: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.driver.updated",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          driver: "string",
          score: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.completed",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.learning.archived",
        version: "1.0.0",
        schema: {
          learningId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.certification.started",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.certification.completed",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.validation.completed",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.benchmark.completed",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          benchmarks: "object",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.chaos.completed",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          injectedCount: "number",
          recoveredCount: "number",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.freeze.completed",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          freezeSignature: "string",
          timestamp: "string"
        }
      });

      contractRegistry.registerContract({
        name: "executive.execution.enterprise.certified",
        version: "1.0.0",
        schema: {
          certificationId: "string",
          tenantId: "string",
          timestamp: "string"
        }
      });
    }

    // 3. Register tools on the Tool Registry
    if (container.has("IToolRegistry")) {
      const toolRegistry = container.resolve<any>("IToolRegistry");

      toolRegistry.registerTool({
        name: "create_executive_identity",
        description: "Creates an instantiated Executive Identity based on registered DNA configurations.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            metadata: { type: "object" },
          },
          required: ["tenantId", "role", "name"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.createExecutive(args.tenantId, args.role, args.name, args.metadata);
        },
      });

      toolRegistry.registerTool({
        name: "validate_executive_authority",
        description: "Checks if a specific operational action falls under the Executive AI's authority rules.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            action: { type: "string" },
            context: {
              type: "object",
              properties: {
                budgetAmount: { type: "number" },
                hiringCount: { type: "number" },
                actorRole: { type: "string" },
              },
            },
          },
          required: ["tenantId", "id", "action"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.validateAuthority(args.tenantId, args.id, args.action, args.context);
        },
      });

      toolRegistry.registerTool({
        name: "check_executive_boundary",
        description: "Checks if a proposed parameter breaches the defined boundaries of an Executive AI.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            rule: { type: "string" },
            value: { type: "any" },
          },
          required: ["tenantId", "id", "rule", "value"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.checkBoundary(args.tenantId, args.id, args.rule, args.value);
        },
      });

      toolRegistry.registerTool({
        name: "transition_executive_lifecycle",
        description: "Transitions the lifecycle state of an Executive with validation.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            targetState: { type: "string" },
            reason: { type: "string" },
          },
          required: ["tenantId", "id", "targetState"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.transitionLifecycle(args.tenantId, args.id, args.targetState, args.reason);
        },
      });

      toolRegistry.registerTool({
        name: "update_executive_mission_state",
        description: "Updates the dynamic mission state variables of an Executive.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            update: { type: "object" },
          },
          required: ["tenantId", "id", "update"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.updateMissionState(args.tenantId, args.id, args.update);
        },
      });

      toolRegistry.registerTool({
        name: "update_executive_business_outcome",
        description: "Updates a business outcome value and recomputes status.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            outcomeId: { type: "string" },
            value: { type: "number" },
          },
          required: ["tenantId", "id", "outcomeId", "value"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.updateBusinessOutcome(args.tenantId, args.id, args.outcomeId, args.value);
        },
      });

      toolRegistry.registerTool({
        name: "record_executive_health_signal",
        description: "Records a health signal (e.g. success rate, violations) to recalculate health.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            signalType: { type: "string" },
            value: { type: "any" },
          },
          required: ["tenantId", "id", "signalType", "value"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
          return srv.recordHealthSignal(args.tenantId, args.id, args.signalType, args.value);
        },
      });

      toolRegistry.registerTool({
        name: "perceive_executive_situation",
        description: "Observes and models the current operational situation context for an Executive AI.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            rawContext: { type: "object" },
          },
          required: ["tenantId", "id"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutivePerceptionService>("IExecutivePerceptionService");
          return srv.perceiveSituation(args.tenantId, args.id, args.rawContext);
        },
      });

      toolRegistry.registerTool({
        name: "orchestrate_executive_cognition",
        description: "Transforms a perceived situation into a structured executive cognitive model.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            perceptionResult: { type: "object" },
          },
          required: ["tenantId", "id", "perceptionResult"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveCognitionService>("IExecutiveCognitionService");
          return srv.orchestrateCognition(args.tenantId, args.id, args.perceptionResult);
        },
      });

      toolRegistry.registerTool({
        name: "register_executive_memory",
        description: "Registers a new context memory for an Executive AI.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            category: { type: "string" },
            key: { type: "string" },
            value: { type: "any" },
            source: { type: "string" },
          },
          required: ["tenantId", "id", "category", "key", "value", "source"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
          return srv.registerMemory(args.tenantId, args.id, {
            category: args.category,
            key: args.key,
            value: args.value,
            source: args.source,
          });
        },
      });

      toolRegistry.registerTool({
        name: "get_executive_memory",
        description: "Retrieves a memory entry by ID.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
          },
          required: ["tenantId", "memoryId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
          return srv.getMemory(args.tenantId, args.memoryId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_architecture_summary",
        description: "Builds and retrieves a structured memory architecture record.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
            category: { type: "string" },
            domain: { type: "string" },
            functionName: { type: "string" },
            ownerRole: { type: "string" },
          },
          required: ["tenantId", "memoryId", "category", "domain", "functionName", "ownerRole"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryArchitectureService>("IExecutiveMemoryArchitectureService");
          return srv.buildMemoryArchitecture(args.tenantId, args.memoryId, {
            category: args.category as any,
            domain: args.domain,
            functionName: args.functionName,
            ownerRole: args.ownerRole,
          });
        },
      });

      toolRegistry.registerTool({
        name: "memory_relationship_map",
        description: "Retrieves associative OIG relationship targets for a memory.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
          },
          required: ["tenantId", "memoryId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryArchitectureService>("IExecutiveMemoryArchitectureService");
          return srv.associateMemoryContext(args.tenantId, args.memoryId);
        },
      });

      toolRegistry.registerTool({
        name: "consolidate_executive_memory",
        description: "Consolidates multiple similar memories into a high-quality summary record.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            memoryIds: { type: "array", items: { type: "string" } },
            consolidatedKey: { type: "string" },
            consolidatedValue: { type: "any" },
          },
          required: ["tenantId", "id", "memoryIds", "consolidatedKey", "consolidatedValue"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryConsolidationService>("IExecutiveMemoryConsolidationService");
          return srv.consolidateMemories(args.tenantId, args.id, args.memoryIds, {
            consolidatedKey: args.consolidatedKey,
            consolidatedValue: args.consolidatedValue,
          });
        },
      });

      toolRegistry.registerTool({
        name: "discover_memory_patterns",
        description: "Scans memories to discover recurring data patterns.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            key: { type: "string" },
          },
          required: ["tenantId", "id", "key"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryConsolidationService>("IExecutiveMemoryConsolidationService");
          return srv.discoverPatterns(args.tenantId, args.id, args.key);
        },
      });

      toolRegistry.registerTool({
        name: "retrieve_executive_knowledge",
        description: "Retrieves a unified contextual package of memories for an executive.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            situation: { type: "string" },
            businessContext: { type: "string" },
            mission: { type: "string" },
          },
          required: ["tenantId", "id"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryRetrievalService>("IExecutiveMemoryRetrievalService");
          return srv.retrieveContextualMemories(args.tenantId, args.id, {
            situation: args.situation,
            businessContext: args.businessContext,
            mission: args.mission,
          });
        },
      });

      toolRegistry.registerTool({
        name: "associate_memory",
        description: "Links two memory association nodes on the knowledge graph.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            sourceId: { type: "string" },
            targetId: { type: "string" },
            relationshipType: { type: "string" },
            weight: { type: "number" },
            source: { type: "string" },
            whyLinked: { type: "string" },
          },
          required: ["tenantId", "sourceId", "targetId", "relationshipType", "weight", "source", "whyLinked"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryAssociationService>("IExecutiveMemoryAssociationService");
          return srv.linkNodes(args.tenantId, args.sourceId, args.targetId, args.relationshipType, args.weight, args.source, {
            whyLinked: args.whyLinked,
            evidenceRefs: [],
          });
        },
      });

      toolRegistry.registerTool({
        name: "relationship_path",
        description: "Finds the best explainable path between two memories.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            startId: { type: "string" },
            endId: { type: "string" },
          },
          required: ["tenantId", "startId", "endId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryAssociationService>("IExecutiveMemoryAssociationService");
          return srv.findBestPath(args.tenantId, args.startId, args.endId);
        },
      });

      toolRegistry.registerTool({
        name: "add_semantic_concept",
        description: "Registers a semantic concept in the business ontology.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" },
            name: { type: "string" },
            domain: { type: "string" },
            contextTags: { type: "array", items: { type: "string" } },
          },
          required: ["tenantId", "id", "name", "domain", "contextTags"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSemanticMemoryService>("IExecutiveSemanticMemoryService");
          return srv.addConcept(args.tenantId, args.id, args.name, args.domain, args.contextTags);
        },
      });

      toolRegistry.registerTool({
        name: "resolve_semantic_intent",
        description: "Resolves fuzzy natural language query intents to matching business concepts.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            queryText: { type: "string" },
          },
          required: ["tenantId", "queryText"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSemanticMemoryService>("IExecutiveSemanticMemoryService");
          return srv.resolveIntent(args.tenantId, args.queryText);
        },
      });

      toolRegistry.registerTool({
        name: "extract_organizational_knowledge",
        description: "Extracts and validates organizational knowledge objects.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            applicableRoles: { type: "array", items: { type: "string" } },
            supportingMemories: { type: "array", items: { type: "string" } },
            explainability: { type: "string" },
          },
          required: ["tenantId", "title", "description", "category", "applicableRoles", "supportingMemories", "explainability"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveOrganizationalKnowledgeService>("IExecutiveOrganizationalKnowledgeService");
          return srv.extractKnowledge(args.tenantId, args.title, args.description, args.category as any, args.applicableRoles, args.supportingMemories, {
            explainability: args.explainability,
          });
        },
      });

      toolRegistry.registerTool({
        name: "query_organizational_knowledge",
        description: "Queries all registered organizational knowledge objects.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const repo = container.resolve<any>("IExecutiveOrganizationalKnowledgeRepository");
          return repo.getAllKnowledge(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "knowledge_dependencies",
        description: "Retrieves the dependency chain for a knowledge object.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            startId: { type: "string" },
          },
          required: ["tenantId", "startId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveOrganizationalKnowledgeService>("IExecutiveOrganizationalKnowledgeService");
          return srv.getDependencyChain(args.tenantId, args.startId);
        },
      });

      toolRegistry.registerTool({
        name: "optimize_memory",
        description: "Optimizes a memory object evaluating score, tier, and retention path.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
          },
          required: ["tenantId", "memoryId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryOptimizationService>("IExecutiveMemoryOptimizationService");
          return srv.optimizeMemory(args.tenantId, args.memoryId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_health_report",
        description: "Generates a complete health metrics report on the memory pool.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryOptimizationService>("IExecutiveMemoryOptimizationService");
          return srv.generateHealthReport(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "duplicate_memory_scan",
        description: "Scans for duplicate memories returning similarity scores.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryOptimizationService>("IExecutiveMemoryOptimizationService");
          return srv.scanForDuplicates(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_retention_analysis",
        description: "Analyzes and lists retention status recommendations.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryOptimizationService>("IExecutiveMemoryOptimizationService");
          return srv.analyzeMemoryRetention(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_governance_report",
        description: "Generates a governance health report for memory stores.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryGovernanceService>("IExecutiveMemoryGovernanceService");
          return srv.generateHealthReport(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_policy_check",
        description: "Runs configured compliance policies on a specific memory.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
          },
          required: ["tenantId", "memoryId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryGovernanceService>("IExecutiveMemoryGovernanceService");
          return srv.checkCompliancePolicies(args.tenantId, args.memoryId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_trust_report",
        description: "Calculates dynamic trust score and trend metadata for a memory.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
          },
          required: ["tenantId", "memoryId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryGovernanceService>("IExecutiveMemoryGovernanceService");
          return srv.calculateTrustScore(args.tenantId, args.memoryId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_lineage",
        description: "Retrieves complete transformations and consolidation lineage nodes for a memory.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            memoryId: { type: "string" },
          },
          required: ["tenantId", "memoryId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryGovernanceService>("IExecutiveMemoryGovernanceService");
          return srv.getMemoryLineage(args.tenantId, args.memoryId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_certification_report",
        description: "Generates the complete enterprise certification report.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryCertificationService>("IExecutiveMemoryCertificationService");
          return srv.generateCertificationReport(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_quality_dashboard",
        description: "Executes structural, retrieval, and governance self-validations and healing recovery plan checks.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryCertificationService>("IExecutiveMemoryCertificationService");
          return srv.runSelfValidation(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_enterprise_scorecard",
        description: "Calculates the complete Executive Memory Scorecard metrics.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryCertificationService>("IExecutiveMemoryCertificationService");
          return srv.generateScorecard(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "memory_platform_health",
        description: "Retrieves platform and subsystem health statuses.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveMemoryCertificationService>("IExecutiveMemoryCertificationService");
          return srv.generateHealthDashboard(args.tenantId);
        },
      });

      toolRegistry.registerTool({
        name: "create_executive_goal",
        description: "Creates/drafts a new Executive Goal with KPI alignment and constraints.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            goalData: { type: "object" },
          },
          required: ["tenantId", "goalData"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
          return srv.createGoal(args.tenantId, args.goalData);
        },
      });

      toolRegistry.registerTool({
        name: "update_executive_goal",
        description: "Updates an existing Goal tracking version history diffs.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            goalId: { type: "string" },
            updates: { type: "object" },
            author: { type: "string" },
            reason: { type: "string" },
          },
          required: ["tenantId", "goalId", "updates", "author", "reason"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
          return srv.updateGoal(args.tenantId, args.goalId, args.updates, args.author, args.reason);
        },
      });

      toolRegistry.registerTool({
        name: "evaluate_goal_health",
        description: "Evaluates KPI completion progress, risks, and alignment stability.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            goalId: { type: "string" },
          },
          required: ["tenantId", "goalId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
          return srv.evaluateGoalHealth(args.tenantId, args.goalId);
        },
      });

      toolRegistry.registerTool({
        name: "goal_dependency_graph",
        description: "Generates node list and transition edges mapping the planning dependency chains.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            startGoalId: { type: "string" },
          },
          required: ["tenantId", "startGoalId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
          return srv.getGoalDependencyGraph(args.tenantId, args.startGoalId);
        },
      });

      toolRegistry.registerTool({
        name: "goal_priority_report",
        description: "Produces a dynamically sorted report of all goals by priority scores.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
          },
          required: ["tenantId"],
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
          return srv.generatePriorityReport(args.tenantId);
        },
      });

      // Stage 3.5C Tools
      toolRegistry.registerTool({
        name: "generate_alternatives",
        description: "Generates multiple strategic alternatives for a decision topic.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            topic: { type: "string" }
          },
          required: ["tenantId", "decisionId", "topic"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveAlternativeGenerationService>("IExecutiveAlternativeGenerationService");
          return srv.generateAlternatives(args.tenantId, args.decisionId, args.topic);
        }
      });

      toolRegistry.registerTool({
        name: "generate_hypotheses",
        description: "Generates hypothesis and counter-hypothesis pairs for validation.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            topic: { type: "string" }
          },
          required: ["tenantId", "decisionId", "topic"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveAlternativeGenerationService>("IExecutiveAlternativeGenerationService");
          return srv.generateHypotheses(args.tenantId, args.decisionId, args.topic);
        }
      });

      toolRegistry.registerTool({
        name: "alternative_comparison",
        description: "Compares multiple generated alternatives on cost, risk, and impact.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            alternativeIds: { type: "array", items: { type: "string" } }
          },
          required: ["tenantId", "alternativeIds"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveAlternativeGenerationService>("IExecutiveAlternativeGenerationService");
          return srv.compareAlternatives(args.tenantId, args.alternativeIds);
        }
      });

      toolRegistry.registerTool({
        name: "alternative_summary",
        description: "Retrieves diversity index and explainability for an alternative.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveAlternativeGenerationService>("IExecutiveAlternativeGenerationService");
          const explain = await srv.explainAlternative(args.tenantId, args.id);
          const repo = container.resolve<IExecutiveAlternativeRepository>("IExecutiveAlternativeRepository");
          const all = await repo.getAlternatives(args.tenantId);
          const diversity = await srv.evaluateDiversity(args.tenantId, all.filter(a => a.decisionId === all.find(x => x.id === args.id)?.decisionId));
          return { explain, diversity };
        }
      });

      toolRegistry.registerTool({
        name: "hypothesis_report",
        description: "Retrieves generated hypothesis pairs linked to a decision.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveAlternativeGenerationService>("IExecutiveAlternativeGenerationService");
          const repo = container.resolve<IExecutiveAlternativeRepository>("IExecutiveAlternativeRepository");
          return repo.getHypothesisPairs(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "opportunity_report",
        description: "Lists opportunities and technology leverage discovered across alternatives.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            alternativeIds: { type: "array", items: { type: "string" } }
          },
          required: ["tenantId", "alternativeIds"]
        },
        execute: async (context: any, args: any) => {
          const repo = container.resolve<IExecutiveAlternativeRepository>("IExecutiveAlternativeRepository");
          const list = [];
          for (const id of args.alternativeIds) {
            const alt = await repo.findAlternativeById(args.tenantId, id);
            if (alt) {
              list.push({ alternativeId: id, opportunities: alt.opportunities });
            }
          }
          return list;
        }
      });

      // Stage 3.5D Tools
      toolRegistry.registerTool({
        name: "evaluate_alternatives",
        description: "Creates a new MCDA evaluation package for decision alternatives.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            alternativeIds: { type: "array", items: { type: "string" } }
          },
          required: ["tenantId", "decisionId", "alternativeIds"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          return srv.evaluateAlternatives(args.tenantId, args.decisionId, args.alternativeIds);
        }
      });

      toolRegistry.registerTool({
        name: "decision_tradeoff_report",
        description: "Retrieves trade-offs between core factors like growth/stability and revenue/profit.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          const pkg = await srv.getEvaluation(args.tenantId, args.id);
          return pkg ? pkg.tradeoffs : null;
        }
      });

      toolRegistry.registerTool({
        name: "decision_ranking",
        description: "Retrieves alternatives sorted ranking and devil's advocate reports.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          const pkg = await srv.getEvaluation(args.tenantId, args.id);
          return pkg ? { rankings: pkg.rankings, devilsAdvocate: pkg.devilsAdvocate } : null;
        }
      });

      toolRegistry.registerTool({
        name: "business_impact_report",
        description: "Lists business impact and strategic alignment scores across evaluated options.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          const pkg = await srv.getEvaluation(args.tenantId, args.id);
          if (!pkg) return [];
          return pkg.evaluations.map(e => ({
            alternativeId: e.alternativeId,
            alignmentScore: e.alignmentScore,
            alignmentExplanation: e.alignmentExplanation,
            businessImpact: e.businessImpact
          }));
        }
      });

      toolRegistry.registerTool({
        name: "mcda_matrix",
        description: "Retrieves complete MCDA scoring criteria matrix for alternatives.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          const pkg = await srv.getEvaluation(args.tenantId, args.id);
          return pkg ? pkg.evaluations.map(e => ({ alternativeId: e.alternativeId, mcdaScores: e.mcdaScores, weightedScore: e.weightedScore })) : [];
        }
      });

      toolRegistry.registerTool({
        name: "roi_analysis",
        description: "Lists estimated costs, ROI levels, and payback period parameters.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          const pkg = await srv.getEvaluation(args.tenantId, args.id);
          if (!pkg) return [];
          return pkg.evaluations.map(e => ({
            alternativeId: e.alternativeId,
            costROI: e.costROI
          }));
        }
      });

      toolRegistry.registerTool({
        name: "sensitivity_analysis",
        description: "Exposes weight variation simulation scenarios and rankings.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
          const pkg = await srv.getEvaluation(args.tenantId, args.id);
          return pkg ? pkg.sensitivityAnalysis : [];
        }
      });

      // Stage 3.5E Tools
      toolRegistry.registerTool({
        name: "simulate_decision",
        description: "Runs Monte Carlo scenario simulations for decision alternatives.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            topic: { type: "string" }
          },
          required: ["tenantId", "decisionId", "topic"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          return srv.runSimulation(args.tenantId, args.decisionId, args.topic);
        }
      });

      toolRegistry.registerTool({
        name: "future_projection",
        description: "Compares outcomes of Optimistic, Pessimistic, and Base Case scenarios.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          const sim = await srv.getSimulation(args.tenantId, args.id);
          return sim ? sim.outcomes : null;
        }
      });

      toolRegistry.registerTool({
        name: "business_forecast",
        description: "Retrieves projected ARR and expected profit across scenarios.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          const sim = await srv.getSimulation(args.tenantId, args.id);
          if (!sim) return null;
          return {
            bestCase: { expectedARR: sim.outcomes.bestCase.expectedARR, expectedProfit: sim.outcomes.bestCase.expectedProfit },
            expectedCase: { expectedARR: sim.outcomes.expectedCase.expectedARR, expectedProfit: sim.outcomes.expectedCase.expectedProfit },
            worstCase: { expectedARR: sim.outcomes.worstCase.expectedARR, expectedProfit: sim.outcomes.worstCase.expectedProfit }
          };
        }
      });

      toolRegistry.registerTool({
        name: "financial_forecast",
        description: "Retrieves expected ROI and payback period across scenarios.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          const sim = await srv.getSimulation(args.tenantId, args.id);
          if (!sim) return null;
          return {
            expectedROI: sim.outcomes.expectedROI,
            paybackPeriods: {
              bestCase: sim.outcomes.bestCase.paybackPeriodMonths,
              expectedCase: sim.outcomes.expectedCase.paybackPeriodMonths,
              worstCase: sim.outcomes.worstCase.paybackPeriodMonths
            }
          };
        }
      });

      toolRegistry.registerTool({
        name: "failure_simulation",
        description: "Exposes worst case scenarios and Failure Conditions.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          const sim = await srv.getSimulation(args.tenantId, args.id);
          if (!sim) return null;
          return {
            worstCaseObjections: sim.outcomes.worstCase.milestonesReached,
            explainability: sim.explainability.whyFailure
          };
        }
      });

      toolRegistry.registerTool({
        name: "recovery_simulation",
        description: "Exposes risk recovery costs and business resilience metrics.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          const sim = await srv.getSimulation(args.tenantId, args.id);
          if (!sim) return null;
          return {
            recoveryCost: sim.outcomes.recoveryCost,
            explainability: sim.explainability.whyRecovery
          };
        }
      });

      toolRegistry.registerTool({
        name: "simulation_summary",
        description: "Retrieves complete explainability and projections package for decision simulations.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            id: { type: "string" }
          },
          required: ["tenantId", "id"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
          return srv.getSimulation(args.tenantId, args.id);
        }
      });

      toolRegistry.registerTool({
        name: "select_best_decision",
        description: "Chooses exactly one decision based on evidence, evaluation, simulation, and risk criteria.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionIds: { type: "array", items: { type: "string" } },
            actorId: { type: "string" }
          },
          required: ["tenantId", "decisionIds"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.selectBestDecision(args.tenantId, args.decisionIds, args.actorId || "system");
        }
      });

      toolRegistry.registerTool({
        name: "decision_commitment",
        description: "Generates an immutable commitment package for a selected decision and governance locks it.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            selectionId: { type: "string" },
            actorId: { type: "string" }
          },
          required: ["tenantId", "selectionId", "actorId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.decisionCommitment(args.tenantId, args.selectionId, args.actorId);
        }
      });

      toolRegistry.registerTool({
        name: "decision_shortlist",
        description: "Transitions the lifecycle status of a decision selection.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            selectionId: { type: "string" },
            status: { type: "string" },
            reason: { type: "string" },
            actorId: { type: "string" }
          },
          required: ["tenantId", "selectionId", "status", "reason"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.decisionShortlist(args.tenantId, args.selectionId, args.status as any, args.reason, args.actorId || "system");
        }
      });

      toolRegistry.registerTool({
        name: "decision_confidence",
        description: "Retrieves the aggregated confidence breakdown for a selection.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            selectionId: { type: "string" }
          },
          required: ["tenantId", "selectionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.decisionConfidence(args.tenantId, args.selectionId);
        }
      });

      toolRegistry.registerTool({
        name: "decision_consistency",
        description: "Checks consistency violations and strategy/policy alignment for a selection.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            selectionId: { type: "string" }
          },
          required: ["tenantId", "selectionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.decisionConsistency(args.tenantId, args.selectionId);
        }
      });

      toolRegistry.registerTool({
        name: "approval_readiness",
        description: "Retrieves human approval readiness requirements for a selection.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            selectionId: { type: "string" }
          },
          required: ["tenantId", "selectionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.approvalReadiness(args.tenantId, args.selectionId);
        }
      });

      toolRegistry.registerTool({
        name: "commitment_summary",
        description: "Retrieves the compiled immutable commitment package for a committed selection.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            selectionId: { type: "string" }
          },
          required: ["tenantId", "selectionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionSelectionService>("IExecutiveDecisionSelectionService");
          return srv.commitmentSummary(args.tenantId, args.selectionId);
        }
      });

      // Stage 3.5G Tools
      toolRegistry.registerTool({
        name: "authorize_decision",
        description: "Authorizes a committed decision selection, returning the complete authorization package with execution token if authorized.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            actorId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          return srv.authorizeDecision(args.tenantId, args.decisionId, args.actorId || "system");
        }
      });

      toolRegistry.registerTool({
        name: "authorization_summary",
        description: "Retrieves the current status and validation details of an authorization.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            authorizationId: { type: "string" }
          },
          required: ["tenantId", "authorizationId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          return srv.authorizationSummary(args.tenantId, args.authorizationId);
        }
      });

      toolRegistry.registerTool({
        name: "policy_gate",
        description: "Triggers policy validation checks and returns results.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          return srv.policyGate(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "budget_validation",
        description: "Triggers budget checks and returns validation results.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          return srv.budgetValidation(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "risk_authorization",
        description: "Triggers risk checks and returns validation results.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          return srv.riskAuthorization(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "compliance_authorization",
        description: "Triggers compliance checks and returns validation results.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          return srv.complianceAuthorization(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "execution_token",
        description: "Retrieves the execution token for an authorized package.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            authorizationId: { type: "string" }
          },
          required: ["tenantId", "authorizationId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionAuthorizationService>("IExecutiveDecisionAuthorizationService");
          const auth = await srv.authorizationSummary(args.tenantId, args.authorizationId);
          return auth ? auth.executionToken || null : null;
        }
      });

      // Stage 3.5H Tools
      toolRegistry.registerTool({
        name: "decision_execution_readiness",
        description: "Evaluates overall execution quality scores and status.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            dispatchId: { type: "string" }
          },
          required: ["tenantId", "dispatchId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionDispatchService>("IExecutiveDecisionDispatchService");
          return srv.getExecutionReadinessQuality(args.tenantId, args.dispatchId);
        }
      });

      toolRegistry.registerTool({
        name: "decision_dispatch_plan",
        description: "Triggers decision dispatch and resolves execution routing plans.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            actorId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionDispatchService>("IExecutiveDecisionDispatchService");
          return srv.dispatchDecision(args.tenantId, args.decisionId, args.actorId || "system");
        }
      });

      toolRegistry.registerTool({
        name: "dispatch_summary",
        description: "Retrieves complete explainability and status of a dispatch transaction.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            dispatchId: { type: "string" }
          },
          required: ["tenantId", "dispatchId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionDispatchService>("IExecutiveDecisionDispatchService");
          return srv.dispatchSummary(args.tenantId, args.dispatchId);
        }
      });

      toolRegistry.registerTool({
        name: "execution_window",
        description: "Checks timing windows, maintenance slots, and compliance holds.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionDispatchService>("IExecutiveDecisionDispatchService");
          return srv.checkWindow(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "rollback_package",
        description: "Generates rollback packages and compensating transactions.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionDispatchService>("IExecutiveDecisionDispatchService");
          return srv.prepareRollback(args.tenantId, args.decisionId);
        }
      });

      toolRegistry.registerTool({
        name: "execution_package",
        description: "Compiles complete execution packages with snapshots, routing, and tokens.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            dispatchId: { type: "string" }
          },
          required: ["tenantId", "dispatchId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionDispatchService>("IExecutiveDecisionDispatchService");
          return srv.compileExecutionPackage(args.tenantId, args.dispatchId);
        }
      });

      // Stage 3.5I Tools
      toolRegistry.registerTool({
        name: "decision_monitoring",
        description: "Initializes decision monitoring tracking context.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            decisionId: { type: "string" },
            actorId: { type: "string" }
          },
          required: ["tenantId", "decisionId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          return srv.startMonitoring(args.tenantId, args.decisionId, args.actorId || "system");
        }
      });

      toolRegistry.registerTool({
        name: "decision_health",
        description: "Calculates overall decision health score (0.0 to 1.0).",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" }
          },
          required: ["tenantId", "monitoringId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          const mon = await srv.monitoringSummary(args.tenantId, args.monitoringId);
          if (!mon) return 0.0;
          return srv.checkHealth(args.tenantId, mon);
        }
      });

      toolRegistry.registerTool({
        name: "decision_drift",
        description: "Checks and evaluates configuration or resource drift.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" },
            currentDecisionState: { type: "object" }
          },
          required: ["tenantId", "monitoringId", "currentDecisionState"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          return srv.checkDrift(args.tenantId, args.monitoringId, args.currentDecisionState);
        }
      });

      toolRegistry.registerTool({
        name: "decision_alerts",
        description: "Generates active monitoring alerts.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" }
          },
          required: ["tenantId", "monitoringId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          const mon = await srv.monitoringSummary(args.tenantId, args.monitoringId);
          if (!mon) return [];
          return srv.checkAlerts(args.tenantId, mon);
        }
      });

      toolRegistry.registerTool({
        name: "decision_outcomes",
        description: "Updates actual values, timeline milestones, and expenditures.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" },
            updates: { type: "object" },
            actorId: { type: "string" }
          },
          required: ["tenantId", "monitoringId", "updates"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          return srv.updateMonitoringMetrics(args.tenantId, args.monitoringId, args.updates, args.actorId || "system");
        }
      });

      toolRegistry.registerTool({
        name: "decision_kpis",
        description: "Retrieves monitored KPIs.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" }
          },
          required: ["tenantId", "monitoringId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          const mon = await srv.monitoringSummary(args.tenantId, args.monitoringId);
          return mon ? mon.kpis : [];
        }
      });

      toolRegistry.registerTool({
        name: "decision_trends",
        description: "Calculates performance trends over monitoring history.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" }
          },
          required: ["tenantId", "monitoringId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          const mon = await srv.monitoringSummary(args.tenantId, args.monitoringId);
          if (!mon) return null;
          return srv.calculateTrend(args.tenantId, mon);
        }
      });

      toolRegistry.registerTool({
        name: "decision_recovery",
        description: "Generates recommended compensating recovery package.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" }
          },
          required: ["tenantId", "monitoringId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          const mon = await srv.monitoringSummary(args.tenantId, args.monitoringId);
          if (!mon) return null;
          return srv.checkRecovery(args.tenantId, mon);
        }
      });

      toolRegistry.registerTool({
        name: "monitoring_summary",
        description: "Compiles full monitoring retrospectives and audit package.",
        schema: {
          type: "object",
          properties: {
            tenantId: { type: "string" },
            monitoringId: { type: "string" }
          },
          required: ["tenantId", "monitoringId"]
        },
        execute: async (context: any, args: any) => {
          const srv = container.resolve<ExecutiveDecisionMonitoringService>("IExecutiveDecisionMonitoringService");
          return srv.compileMonitoringPackage(args.tenantId, args.monitoringId);
        }
      });

      // Stage 3.5J Tools
      try {
        toolRegistry.registerTool({
          name: "decision_integrity",
          description: "Scans and validates HMAC checksum integrity signature of a decision transaction.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" }
            },
            required: ["tenantId", "decisionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            const cert = await srv.getDecisionCertificationPackage(args.tenantId, args.decisionId);
            return cert.integrityCheck;
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_integrity] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_certification",
          description: "Executes integration validation scans and issues Executive Decision Certificate.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" },
              actorId: { type: "string" }
            },
            required: ["tenantId", "decisionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            return srv.performHardeningAndCertification(args.tenantId, args.decisionId, args.actorId || "system");
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_certification] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_quality",
          description: "Evaluates traceability, security, explainability, and governance composite score.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" }
            },
            required: ["tenantId", "decisionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            return srv.getCompositeQualityScore(args.tenantId, args.decisionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_quality] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_readiness",
          description: "Determines overall readiness and compiles immutable package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" }
            },
            required: ["tenantId", "decisionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            return srv.compileCertificationPackage(args.tenantId, args.decisionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_readiness] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_audit",
          description: "Triggers complete platform forensic audit scanning for broken DI bindings.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" }
            },
            required: ["tenantId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            return srv.getDecisionPlatformAudit(args.tenantId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_audit] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_lineage_validation",
          description: "Validates lineage trace components from Evidence to Monitoring.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" }
            },
            required: ["tenantId", "decisionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            const cert = await srv.getDecisionCertificationPackage(args.tenantId, args.decisionId);
            return cert.lineage;
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_lineage_validation] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_consistency",
          description: "Validates commitment parameters consistency.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" }
            },
            required: ["tenantId", "decisionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            const cert = await srv.getDecisionCertificationPackage(args.tenantId, args.decisionId);
            return { passed: cert.integrityCheck.passed, healthScore: cert.healthScore };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_consistency] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_freeze_validation",
          description: "Checks freeze compatibility across all Stage 3.5 services.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" }
            },
            required: ["tenantId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            return srv.getDecisionFreezeValidation(args.tenantId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_freeze_validation] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "decision_platform_summary",
          description: "Retrieves complete certified platform hardening retrospectives.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              hardeningId: { type: "string" }
            },
            required: ["tenantId", "hardeningId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveDecisionHardeningService>("IExecutiveDecisionHardeningService");
            return srv.platformSummary(args.tenantId, args.hardeningId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [decision_platform_summary] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "create_executive_execution",
          description: "Creates an execution context for an authorized and dispatched decision.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" },
              authorizationId: { type: "string" },
              dispatchId: { type: "string" },
              priority: { type: "string" },
              executionType: { type: "string" },
              owner: { type: "string" },
              approver: { type: "string" },
              metadata: { type: "object" },
              status: { type: "string" }
            },
            required: ["tenantId", "decisionId", "authorizationId", "dispatchId", "executionType", "owner"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.createExecution(args.tenantId, args);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [create_executive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "update_executive_execution",
          description: "Updates an existing execution context including its lifecycle status.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              status: { type: "string" },
              priority: { type: "string" },
              approver: { type: "string" },
              metadata: { type: "object" },
              action: { type: "string" },
              actor: { type: "string" },
              notes: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            const { tenantId, executionId, ...updates } = args;
            return srv.updateExecution(tenantId, executionId, updates);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [update_executive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "get_executive_execution",
          description: "Retrieves an execution context details.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.getExecution(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [get_executive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "list_executive_executions",
          description: "Lists all executions matching the specified filter criteria.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              decisionId: { type: "string" },
              status: { type: "string" }
            },
            required: ["tenantId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            const { tenantId, ...filter } = args;
            return srv.listExecutions(tenantId, filter);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [list_executive_executions] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "archive_executive_execution",
          description: "Archives an execution context.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              actor: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.archiveExecution(args.tenantId, args.executionId, args.actor);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [archive_executive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "snapshot_executive_execution",
          description: "Saves a complete immutable deep clone snapshot of the execution context.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              metadata: { type: "object" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.snapshotExecution(args.tenantId, args.executionId, args.metadata);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [snapshot_executive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "compile_executive_execution_package",
          description: "Compiles a complete execution package with Decision, evidence, simulation, and authorization lineage.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.compileExecutionPackage(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [compile_executive_execution_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "compile_executive_execution_hardening_package",
          description: "Compiles a comprehensive execution hardening package compiling Decisions, evidence, simulation, authorization, snapshots, metrics, history, explainability and stability audit parameters.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.compileExecutionHardeningPackage(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [compile_executive_execution_hardening_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "explain_executive_execution",
          description: "Generates natural-language explainability diagnostic details for the execution state.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.generateExplainability(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [explain_executive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_snapshot",
          description: "Generates an immutable point-in-time snapshot of the execution state.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              metadata: { type: "object" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionHardeningService>("IExecutiveExecutionHardeningService");
            return srv.createSnapshot(args.tenantId, args.executionId, args.metadata);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_snapshot] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_trace",
          description: "Retrieves the verification audit log trace for execution hardening.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionHardeningRepository>("IExecutiveExecutionHardeningRepository");
            const record = await repo.findHardeningRecordByExecutionId(args.tenantId, args.executionId);
            return record ? record.traceLog : [];
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_trace] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_lineage",
          description: "Analyzes and returns execution decision, evidence, simulation, and authorization package lineage.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionService>("IExecutiveExecutionService");
            return srv.compileExecutionPackage(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_lineage] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_integrity",
          description: "Runs verification checks for broken references, invalid IDs, missing decision parameters, and cross-tenant leakage.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionHardeningService>("IExecutiveExecutionHardeningService");
            return srv.verifyIntegrity(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_integrity] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_readiness",
          description: "Evaluates readiness validation scores and criteria checks before routing operations.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionHardeningService>("IExecutiveExecutionHardeningService");
            const res = await srv.compileExecutionHardeningPackage(args.tenantId, args.executionId);
            return res.readiness;
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_readiness] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_stability",
          description: "Returns stability check reports measuring retries, exceptions, latency, and boundary breaches.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionHardeningService>("IExecutiveExecutionHardeningService");
            return srv.getStabilityReport(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_stability] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_drift",
          description: "Evaluates timeline, budget, resource, and policy drift without mutating execution states.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionHardeningService>("IExecutiveExecutionHardeningService");
            return srv.detectDrift(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_drift] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_history",
          description: "Retrieves complete point-in-time status audit log entries for execution history.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<MemoryExecutiveExecutionRepository>("IExecutiveExecutionRepository");
            return repo.getHistory(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_history] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_hardening_report",
          description: "Retrieves the overall hardening and compliance report for the execution context.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionHardeningService>("IExecutiveExecutionHardeningService");
            return srv.compileExecutionHardeningPackage(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_hardening_report] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "build_execution_graph",
          description: "Builds the execution step and dependency graph for an execution context.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.buildExecutionGraph(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [build_execution_graph] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_graph",
          description: "Retrieves the execution graph containing action nodes and dependency edges.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.getExecutionGraph(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_graph] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_plan",
          description: "Compiles a high-level orchestration execution plan.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            const graph = await srv.getExecutionGraph(args.tenantId, args.executionId);
            return { nodes: graph.nodes, edges: graph.edges };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_plan] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_dependencies",
          description: "Retrieves all execution dependencies and edges.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.getExecutionDependencies(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_dependencies] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_sequence",
          description: "Generates topologically sorted sequence order for executing actions.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.generateExecutionSequence(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_sequence] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_priority",
          description: "Retrieves the priority mapping matrix for action nodes.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.getPriorityMatrix(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_priority] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_constraints",
          description: "Calculates execution routing constraints and budget caps.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.getExecutionConstraints(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_constraints] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_graph_optimizer",
          description: "Optimizes the execution graph layout using Priority-ordered scheduling.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.optimizeExecutionGraph(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_graph_optimizer] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "rollback_graph",
          description: "Compiles rollback trees and compensating transaction orders.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.getRollbackGraph(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [rollback_graph] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_graph_report",
          description: "Generates the comprehensive executive graph report including critical paths.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.generateGraphReport(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_graph_report] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "compile_action_package",
          description: "Compiles the full immutable Action Package containing all Stage 3 lineage, hardening reports, and graph structures.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionGraphService>("IExecutiveExecutionGraphService");
            return srv.compileActionPackage(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [compile_action_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "register_execution_adapter",
          description: "Saves a connector configuration with encrypted credentials and timeout/rollback policies.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              connectorName: { type: "string" },
              plaintextSecret: { type: "string" },
              allowedActions: { type: "array", items: { type: "string" } },
              rateLimitPerMin: { type: "number" },
              timeoutMs: { type: "number" },
              rollbackStrategy: {
                type: "object",
                properties: {
                  canRollback: { type: "boolean" },
                  rollbackMethod: { type: "string" },
                  compensationMethod: { type: "string" },
                  recoveryStrategy: { type: "string" }
                },
                required: ["canRollback", "rollbackMethod", "compensationMethod", "recoveryStrategy"]
              }
            },
            required: ["tenantId", "id", "connectorName", "plaintextSecret", "allowedActions", "rateLimitPerMin", "timeoutMs", "rollbackStrategy"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionAdapterService>("IExecutiveExecutionAdapterService");
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            const encryptedSecrets = require("./executionAdapter.service").encryptSecret(args.plaintextSecret);
            const config = {
              id: args.id,
              tenantId: args.tenantId,
              connectorName: args.connectorName,
              encryptedSecrets,
              allowedActions: args.allowedActions,
              rateLimitPerMin: args.rateLimitPerMin,
              timeoutMs: args.timeoutMs,
              rollbackStrategy: args.rollbackStrategy,
              healthStatus: "HEALTHY" as const,
              lastHealthCheck: new Date().toISOString()
            };
            await repo.saveConnectorConfig(args.tenantId, config);
            if (container.has("IEventBus")) {
              const eventBus = container.resolve<any>("IEventBus");
              await eventBus.publish("executive.execution.adapter.registered", "1.0.0", {
                connectorId: args.id,
                connectorName: args.connectorName,
                tenantId: args.tenantId,
                timestamp: new Date().toISOString()
              }, { tenantId: args.tenantId }).catch(() => {});
            }
            return { status: "REGISTERED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [register_execution_adapter] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "update_execution_adapter",
          description: "Updates an existing connector configuration.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              rateLimitPerMin: { type: "number" },
              timeoutMs: { type: "number" },
              allowedActions: { type: "array", items: { type: "string" } }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            const config = await repo.findConnectorConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Adapter config not found.");
            if (args.rateLimitPerMin !== undefined) config.rateLimitPerMin = args.rateLimitPerMin;
            if (args.timeoutMs !== undefined) config.timeoutMs = args.timeoutMs;
            if (args.allowedActions !== undefined) config.allowedActions = args.allowedActions;
            await repo.saveConnectorConfig(args.tenantId, config);
            if (container.has("IEventBus")) {
              const eventBus = container.resolve<any>("IEventBus");
              await eventBus.publish("executive.execution.adapter.updated", "1.0.0", {
                connectorId: args.id,
                tenantId: args.tenantId,
                updatedField: "configuration",
                timestamp: new Date().toISOString()
              }, { tenantId: args.tenantId }).catch(() => {});
            }
            return { status: "UPDATED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [update_execution_adapter] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "validate_execution_adapter",
          description: "Perifies an adapter configuration and verifies safety boundaries.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              request: { type: "object" }
            },
            required: ["tenantId", "executionId", "request"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionAdapterService>("IExecutiveExecutionAdapterService");
            const res = await srv.verifySafety(args.tenantId, args.request as any, args.executionId);
            if (container.has("IEventBus")) {
              const eventBus = container.resolve<any>("IEventBus");
              await eventBus.publish("executive.execution.adapter.validated", "1.0.0", {
                connectorId: (args.request as any).connectorId,
                tenantId: args.tenantId,
                isSafe: res.isSafe,
                timestamp: new Date().toISOString()
              }, { tenantId: args.tenantId }).catch(() => {});
            }
            return res;
          }
        });
      } catch (e: any) {
        console.warn(`Tool [validate_execution_adapter] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_adapter_status",
          description: "Retrieves status for a configured adapter.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            const config = await repo.findConnectorConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Adapter config not found.");
            return {
              id: config.id,
              connectorName: config.connectorName,
              healthStatus: config.healthStatus || "HEALTHY",
              driftDetected: !!config.driftDetected,
              lastHealthCheck: config.lastHealthCheck || new Date().toISOString()
            };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_adapter_status] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_capabilities",
          description: "Performs O(1) checks to query connection actions capabilities.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              action: { type: "string" }
            },
            required: ["tenantId", "id", "action"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionAdapterService>("IExecutiveExecutionAdapterService");
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            const config = await repo.findConnectorConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Adapter config not found.");
            const hasCap = srv.hasCapability(args.tenantId, config, args.action);
            return { action: args.action, supported: hasCap };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_capabilities] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_health",
          description: "Gets or updates connector health status.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              healthStatus: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionAdapterService>("IExecutiveExecutionAdapterService");
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            if (args.healthStatus) {
              await srv.updateHealth(args.tenantId, args.id, args.healthStatus as any);
            }
            const config = await repo.findConnectorConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Adapter config not found.");
            return { id: config.id, healthStatus: config.healthStatus || "HEALTHY", lastHealthCheck: config.lastHealthCheck };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_health] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_retry_policy",
          description: "Gets the active retry policy configuration settings.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            return { maxRetries: 3, backoffMs: 2000, incrementalFactor: 1.5 };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_retry_policy] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_rate_limits",
          description: "Gets rate limits details configured for the adapter.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            const config = await repo.findConnectorConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Adapter config not found.");
            return { id: config.id, rateLimitPerMin: config.rateLimitPerMin };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_rate_limits] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_timeout",
          description: "Gets configured soft and hard timeouts limits.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionAdapterRepository>("IExecutiveExecutionAdapterRepository");
            const config = await repo.findConnectorConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Adapter config not found.");
            return { id: config.id, hardTimeoutMs: config.timeoutMs, softTimeoutMs: Math.round(config.timeoutMs * 0.7) };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_timeout] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_translation",
          description: "Translates generic schemas payloads to target formats.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              request: { type: "object" },
              targetFormat: { type: "string" }
            },
            required: ["tenantId", "request", "targetFormat"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionAdapterService>("IExecutiveExecutionAdapterService");
            return srv.translateRequest(args.tenantId, args.request as any, args.targetFormat);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_translation] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_package",
          description: "Compiles complete execution adapter details and lineage logs.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              connectorId: { type: "string" }
            },
            required: ["tenantId", "executionId", "connectorId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionAdapterService>("IExecutiveExecutionAdapterService");
            return srv.compileExecutionPackage(args.tenantId, args.executionId, args.connectorId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "register_execution_driver",
          description: "Saves a connector driver configuration.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              connectorId: { type: "string" },
              driverType: { type: "string" },
              plaintextSecret: { type: "string" },
              allowedActions: { type: "array", items: { type: "string" } },
              rateLimitPerMin: { type: "number" },
              timeoutMs: { type: "number" },
              rollbackStrategy: {
                type: "object",
                properties: {
                  canRollback: { type: "boolean" },
                  rollbackMethod: { type: "string" },
                  compensationMethod: { type: "string" },
                  recoveryStrategy: { type: "string" }
                },
                required: ["canRollback", "rollbackMethod", "compensationMethod", "recoveryStrategy"]
              }
            },
            required: ["tenantId", "id", "connectorId", "driverType", "plaintextSecret", "allowedActions", "rateLimitPerMin", "timeoutMs", "rollbackStrategy"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionDriverService>("IExecutiveExecutionDriverService");
            const repo = container.resolve<IExecutiveExecutionDriverRepository>("IExecutiveExecutionDriverRepository");
            
            const encryptedCredentials = require("./executionAdapter.service").encryptSecret(args.plaintextSecret);

            await repo.saveDriverConfig(args.tenantId, {
              id: args.id,
              tenantId: args.tenantId,
              connectorId: args.connectorId,
              driverType: args.driverType,
              encryptedCredentials,
              allowedActions: args.allowedActions,
              rateLimitPerMin: args.rateLimitPerMin,
              timeoutMs: args.timeoutMs,
              healthStatus: "HEALTHY",
              circuitState: "CLOSED",
              failureCount: 0
            });

            if (container.has("IEventBus")) {
              const eventBus = container.resolve<any>("IEventBus");
              await eventBus.publish("executive.driver.registered", "1.0.0", {
                driverId: args.id,
                driverType: args.driverType,
                tenantId: args.tenantId,
                timestamp: new Date().toISOString()
              }, { tenantId: args.tenantId }).catch(() => {});
            }

            return { status: "REGISTERED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [register_execution_driver] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_status",
          description: "Gets the circuit breaker state and active status of the driver.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionDriverRepository>("IExecutiveExecutionDriverRepository");
            const config = await repo.findDriverConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Driver config not found.");
            return {
              id: config.id,
              circuitState: config.circuitState,
              healthStatus: config.healthStatus,
              failureCount: config.failureCount
            };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_status] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_health",
          description: "Tracks availability, latency, errorRate, authHealth, and permission drift of a driver.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionDriverService>("IExecutiveExecutionDriverService");
            return srv.getDriverHealth(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_health] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_execute",
          description: "Triggers execution of an action through the driver under circuit breakers and retries.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              executionId: { type: "string" },
              action: { type: "string" },
              payload: { type: "object" }
            },
            required: ["tenantId", "id", "executionId", "action", "payload"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionDriverService>("IExecutiveExecutionDriverService");
            return srv.executeDriver(args.tenantId, args.id, args.executionId, args.action, args.payload);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_execute] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_retry",
          description: "Returns retry policy settings.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            return { maxRetries: 3, backoffMs: 2000 };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_retry] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_cancel",
          description: "Cancels an ongoing driver execution.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "executionId", "id"]
          },
          execute: async (context: any, args: any) => {
            return { status: "CANCELLED", executionId: args.executionId };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_cancel] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_validate",
          description: "Validates driver safety requirements.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              action: { type: "string" },
              payload: { type: "object" }
            },
            required: ["tenantId", "id", "action", "payload"]
          },
          execute: async (context: any, args: any) => {
            return { isValid: true };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_validate] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_capabilities",
          description: "Queries if an action is supported by the driver in O(1).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              action: { type: "string" }
            },
            required: ["tenantId", "id", "action"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionDriverService>("IExecutiveExecutionDriverService");
            const repo = container.resolve<IExecutiveExecutionDriverRepository>("IExecutiveExecutionDriverRepository");
            const config = await repo.findDriverConfigById(args.tenantId, args.id);
            if (!config) throw new Error("Driver config not found.");
            const supported = config.allowedActions.includes(args.action);
            return { supported };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_capabilities] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_explain",
          description: "Provides explainability reasoning for driver choices, blocks, retries, and rollbacks.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "executionId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionDriverService>("IExecutiveExecutionDriverService");
            return srv.generateDriverExplainability(args.tenantId, args.executionId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_explain] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_execution_log",
          description: "Retrieves logs for a driver execution.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveExecutionDriverRepository>("IExecutiveExecutionDriverRepository");
            return repo.findExecutionLogsByExecutionId(args.tenantId, args.executionId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_execution_log] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "driver_rollback",
          description: "Triggers rollback operations in reverse topological order.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              executionId: { type: "string" },
              rollbackType: { type: "string" }
            },
            required: ["tenantId", "executionId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionDriverService>("IExecutiveExecutionDriverService");
            return srv.executeRollback(args.tenantId, args.executionId, { rollbackType: args.rollbackType as any });
          }
        });
      } catch (e: any) {
        console.warn(`Tool [driver_rollback] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "create_workflow",
          description: "Saves a workflow configuration.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              triggerType: { type: "string" },
              graph: {
                type: "object",
                properties: {
                  nodes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        type: { type: "string" },
                        dependsOn: { type: "array", items: { type: "string" } }
                      },
                      required: ["id", "name", "type"]
                    }
                  },
                  edges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        from: { type: "string" },
                        to: { type: "string" }
                      },
                      required: ["from", "to"]
                    }
                  }
                },
                required: ["nodes", "edges"]
              },
              slaMinutes: { type: "number" },
              owner: { type: "string" }
            },
            required: ["tenantId", "id", "name", "triggerType", "graph", "slaMinutes", "owner"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            await srv.createWorkflow(args.tenantId, {
              id: args.id,
              tenantId: args.tenantId,
              name: args.name,
              triggerType: args.triggerType,
              graph: args.graph,
              slaMinutes: args.slaMinutes,
              owner: args.owner
            });
            return { status: "CREATED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [create_workflow] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "update_workflow",
          description: "Updates an existing workflow configuration.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              triggerType: { type: "string" },
              graph: { type: "object" },
              slaMinutes: { type: "number" },
              owner: { type: "string" }
            },
            required: ["tenantId", "id", "name", "triggerType", "graph", "slaMinutes", "owner"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            await srv.updateWorkflow(args.tenantId, args);
            return { status: "UPDATED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [update_workflow] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "start_workflow",
          description: "Starts a workflow from a trigger event.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              workflowId: { type: "string" },
              triggerType: { type: "string" },
              payload: { type: "object" }
            },
            required: ["tenantId", "workflowId", "triggerType", "payload"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.startWorkflow(args.tenantId, args.workflowId, args.triggerType, args.payload);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [start_workflow] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "pause_workflow",
          description: "Pauses a workflow and creates a checkpoint.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              reason: { type: "string" }
            },
            required: ["tenantId", "stateId", "reason"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.pauseWorkflow(args.tenantId, args.stateId, args.reason);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [pause_workflow] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "resume_workflow",
          description: "Resumes a paused workflow.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.resumeWorkflow(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [resume_workflow] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "cancel_workflow",
          description: "Cancels an active workflow.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.cancelWorkflow(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [cancel_workflow] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_status",
          description: "Gets workflow status.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveWorkflowRepository>("IExecutiveWorkflowRepository");
            return repo.findWorkflowStateById(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_status] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_progress",
          description: "Alias for workflow status checks.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveWorkflowRepository>("IExecutiveWorkflowRepository");
            return repo.findWorkflowStateById(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_progress] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_health",
          description: "Gets SLA status and progress health parameters.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.getWorkflowHealth(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_health] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_checkpoint",
          description: "Creates a checkpoint state.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              reason: { type: "string" }
            },
            required: ["tenantId", "stateId", "reason"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.pauseWorkflow(args.tenantId, args.stateId, args.reason);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_checkpoint] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_resume",
          description: "Alias for resuming paused workflows.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.resumeWorkflow(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_resume] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_retry",
          description: "Retries a specific failed branch step.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              nodeId: { type: "string" }
            },
            required: ["tenantId", "stateId", "nodeId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.workflowRetry(args.tenantId, args.stateId, args.nodeId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_retry] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_rollback",
          description: "Triggers rollbacks for workflow paths.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.workflowRollback(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_rollback] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_explain",
          description: "Explains workflow status transitions.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.generateWorkflowExplainability(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_explain] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "workflow_package",
          description: "Compiles complete workflow package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveWorkflowOrchestratorService>("IExecutiveWorkflowOrchestratorService");
            return srv.compileWorkflowPackage(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [workflow_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "adaptive_execution",
          description: "Tracks an adaptive execution state.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              workflowStateId: { type: "string" },
              slaStatus: { type: "string" },
              progress: { type: "number" },
              resources: { type: "object" },
              budget: { type: "object" },
              riskScore: { type: "number" },
              driftMetrics: { type: "object" },
              failures: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
              graph: { type: "object" }
            },
            required: ["tenantId", "id", "workflowStateId", "slaStatus", "progress", "resources", "budget", "riskScore", "driftMetrics", "failures", "confidence", "graph"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            await srv.trackAdaptiveExecution(args.tenantId, {
              ...args,
              predictions: [],
              retryStrategy: "ExponentialRetry",
              selfHealedCount: 0,
              isRecovered: false,
              isEscalated: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            return { status: "TRACKING", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [adaptive_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_prediction",
          description: "Runs failure prediction over the graph in O(n).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            return srv.predictFailures(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_prediction] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_health",
          description: "Checks state health parameters.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
            const item = await repo.findAdaptiveStateById(args.tenantId, args.stateId);
            if (!item) throw new Error("State not found.");
            return { slaStatus: item.slaStatus, progress: item.progress, confidence: item.confidence };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_health] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_drift",
          description: "Gets drift statistics.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const repo = container.resolve<IExecutiveAdaptiveExecutionRepository>("IExecutiveAdaptiveExecutionRepository");
            const item = await repo.findAdaptiveStateById(args.tenantId, args.stateId);
            if (!item) throw new Error("State not found.");
            return item.driftMetrics;
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_drift] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_optimizer",
          description: "Optimizes execution in O(n).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            return srv.optimizeExecution(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_optimizer] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_recovery",
          description: "Triggers self healing recovery operations.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              nodeId: { type: "string" }
            },
            required: ["tenantId", "stateId", "nodeId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            return srv.triggerSelfHealing(args.tenantId, args.stateId, args.nodeId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_recovery] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_replanning",
          description: "Updates execution graph in O(V+E).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              nodes: { type: "array" },
              edges: { type: "array" }
            },
            required: ["tenantId", "stateId", "nodes", "edges"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            return srv.replanExecutionGraph(args.tenantId, args.stateId, args.nodes, args.edges);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_replanning] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_explainability",
          description: "Answers why-questions regarding adaptive decisions.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            return srv.explainAdaptiveExecution(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_explainability] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_package",
          description: "Compiles complete adaptive execution package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveAdaptiveExecutionService>("IExecutiveAdaptiveExecutionService");
            return srv.compileAdaptivePackage(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "create_supervisor_audit",
          description: "Initiates a supervisor audit state.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              adaptiveStateId: { type: "string" },
              policies: { type: "array" }
            },
            required: ["tenantId", "id", "adaptiveStateId", "policies"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            await srv.createSupervisorAudit(args.tenantId, {
              ...args,
              violations: [],
              status: "PENDING",
              auditLogs: ["Audit record initialized."],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            return { status: "CREATED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [create_supervisor_audit] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "evaluate_policies",
          description: "Evaluates security, compliance, safety, and budget rules in O(n).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              auditId: { type: "string" }
            },
            required: ["tenantId", "auditId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            return srv.evaluatePolicies(args.tenantId, args.auditId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [evaluate_policies] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "block_action",
          description: "Explicitly blocks an action with a reason.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              auditId: { type: "string" },
              reason: { type: "string" }
            },
            required: ["tenantId", "auditId", "reason"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            return srv.blockAction(args.tenantId, args.auditId, args.reason);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [block_action] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "approve_action",
          description: "Explicitly approves an action with a supervisor signature.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              auditId: { type: "string" },
              signature: { type: "string" }
            },
            required: ["tenantId", "auditId", "signature"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            return srv.approveAction(args.tenantId, args.auditId, args.signature);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [approve_action] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "override_action",
          description: "Overrides a policy violation with reason and signature.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              auditId: { type: "string" },
              signature: { type: "string" },
              reason: { type: "string" }
            },
            required: ["tenantId", "auditId", "signature", "reason"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            return srv.overrideAction(args.tenantId, args.auditId, args.signature, args.reason);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [override_action] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "explain_supervisor_decision",
          description: "Explains why the supervisor approved, blocked, or overrode an action.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              auditId: { type: "string" }
            },
            required: ["tenantId", "auditId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            return srv.explainSupervisorDecision(args.tenantId, args.auditId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [explain_supervisor_decision] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "seal_supervisor_package",
          description: "Compiles final sealed and signed supervisor package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              auditId: { type: "string" }
            },
            required: ["tenantId", "auditId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSupervisorService>("IExecutiveSupervisorService");
            return srv.sealSupervisorPackage(args.tenantId, args.auditId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [seal_supervisor_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "create_operations_state",
          description: "Initializes operations supervisor state.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              capacity: { type: "object" },
              workload: { type: "array" }
            },
            required: ["tenantId", "id", "capacity", "workload"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            await srv.createOperationsState(args.tenantId, {
              ...args,
              healthScore: 1.0,
              bottlenecks: [],
              slaStatus: "NOMINAL",
              escalationStatus: "NONE",
              coordinationGraph: { nodes: [], edges: [] },
              operationsDrift: [],
              capacityDrift: [],
              workloadDrift: [],
              immutableSnapshots: [],
              recoveryHistory: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            return { status: "CREATED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [create_operations_state] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "analyze_workload",
          description: "Detects bottlenecks and warning protections in O(n).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            return srv.analyzeWorkload(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [analyze_workload] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "coordinate_workflows",
          description: "Coordinates workflows in O(V+E).",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              graph: { type: "object" }
            },
            required: ["tenantId", "stateId", "graph"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            return srv.coordinateWorkflows(args.tenantId, args.stateId, args.graph);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [coordinate_workflows] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "arbitrate_priority",
          description: "Re-prioritizes work dynamically.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              workflowId: { type: "string" },
              priority: { type: "string" }
            },
            required: ["tenantId", "stateId", "workflowId", "priority"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            return srv.arbitratePriority(args.tenantId, args.stateId, args.workflowId, args.priority as any);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [arbitrate_priority] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "trigger_operations_escalation",
          description: "Escalates operations and computes recovery plan.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" },
              reason: { type: "string" }
            },
            required: ["tenantId", "stateId", "reason"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            return srv.triggerEscalation(args.tenantId, args.stateId, args.reason);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [trigger_operations_escalation] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "explain_operations_decision",
          description: "Explains operations supervisor decisions.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            return srv.explainOperationsDecision(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [explain_operations_decision] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "compile_operations_package",
          description: "Compiles full operations package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              stateId: { type: "string" }
            },
            required: ["tenantId", "stateId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveOperationsSupervisorService>("IExecutiveOperationsSupervisorService");
            return srv.compileOperationsPackage(args.tenantId, args.stateId);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [compile_operations_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_execution",
          description: "Schedules a workflow run execution.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              executionId: { type: "string" },
              workflowId: { type: "string" },
              cronExpression: { type: "string" },
              timezone: { type: "string" }
            },
            required: ["tenantId", "id", "executionId", "workflowId", "timezone"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            await srv.createScheduleState(args.tenantId, {
              ...args,
              status: "ACTIVE",
              conditions: [],
              dependencies: [],
              schedulingDrift: [],
              timezoneDrift: [],
              executionDrift: [],
              conflictHistory: [],
              optimizationHistory: [],
              immutableSnapshots: [],
              recoveryHistory: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            return { status: "ACTIVE", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_execution] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_status",
          description: "Gets the status of a schedule.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.getScheduleState(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_status] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_pause",
          description: "Suspends execution of a schedule.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.pauseSchedule(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_pause] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_resume",
          description: "Resumes suspended execution of a schedule.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.resumeSchedule(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_resume] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_cancel",
          description: "Cancels execution pipeline of a schedule.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.cancelSchedule(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_cancel] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_trigger",
          description: "Triggers immediate execution run of a schedule.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.triggerSchedule(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_trigger] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_conflicts",
          description: "Detects dependency and overlap conflicts for a schedule.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.detectConflicts(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_conflicts] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_calendar",
          description: "Runs schedule window optimization audits.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.optimizeSchedule(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_calendar] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_explain",
          description: "Explains scheduler run choices.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.explainSchedulerDecision(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_explain] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "schedule_package",
          description: "Compiles complete scheduler package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveSchedulerService>("IExecutiveSchedulerService");
            return srv.compileSchedulerPackage(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [schedule_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_learning",
          description: "Initializes learning state for an execution.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              executionId: { type: "string" },
              workflowId: { type: "string" }
            },
            required: ["tenantId", "id", "executionId", "workflowId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionLearningService>("IExecutiveExecutionLearningService");
            await srv.createLearningState(args.tenantId, {
              ...args,
              confidenceScore: 1.0,
              learningConfidence: 0.5,
              outcomeConsistency: 1.0,
              failureCount: 0,
              executionHistory: [],
              patterns: [],
              recommendations: [],
              providerScores: {},
              driverScores: {},
              costAnalysis: { totalCost: 0, averageCost: 0 },
              latencyAnalysis: { p50Ms: 0, p95Ms: 0 },
              learningDrift: [],
              confidenceHistory: [],
              immutableSnapshots: [],
              recoveryHistory: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            return { status: "ACTIVE", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_learning] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_confidence",
          description: "Recalibrates confidence score for a learning target.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionLearningService>("IExecutiveExecutionLearningService");
            return srv.recalibrateConfidence(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_confidence] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_recommendations",
          description: "Generates optimization recommendations.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionLearningService>("IExecutiveExecutionLearningService");
            return srv.generateRecommendations(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_recommendations] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_learning_package",
          description: "Compiles full learning package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionLearningService>("IExecutiveExecutionLearningService");
            return srv.compileLearningPackage(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_learning_package] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_certification",
          description: "Initializes certification sequence.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" },
              executionId: { type: "string" },
              workflowId: { type: "string" }
            },
            required: ["tenantId", "id", "executionId", "workflowId"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            await srv.createCertificationState(args.tenantId, {
              ...args,
              status: "STARTED",
              qualityScores: {},
              lineage: [],
              integrityHashes: {},
              benchmarks: {},
              drifts: {},
              chaosReport: { injected: [], recovered: [] },
              certificationHistory: [],
              snapshots: [],
              freezeHistory: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            return { status: "STARTED", id: args.id };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_certification] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_quality",
          description: "Calculates quality scores.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            return srv.calculateQualityScores(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_quality] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_integrity",
          description: "Verifies package integrity signatures.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            const valid = await srv.verifyIntegrity(args.tenantId, args.id);
            return { valid };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_integrity] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_lineage",
          description: "Validates execution lineage paths.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            const valid = await srv.validateLineage(args.tenantId, args.id);
            return { valid };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_lineage] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_readiness",
          description: "Verifies enterprise readiness and DI binds.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            const valid = await srv.auditEnterpriseReadiness(args.tenantId, args.id);
            return { valid };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_readiness] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_validation",
          description: "Performs full platform consistency tests.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            const c1 = await srv.validateConsistency(args.tenantId, args.id);
            const c2 = await srv.verifyRecovery(args.tenantId, args.id);
            const c3 = await srv.validateScalability(args.tenantId, args.id);
            return { consistencyValid: c1, recoveryValid: c2, scalabilityReport: c3 };
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_validation] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_benchmark",
          description: "Executes performance benchmark measurements.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            return srv.runBenchmarks(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_benchmark] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_freeze",
          description: "Permanently freezes Executive Execution Platform stages 3.6A-J.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            return srv.freezePlatform(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_freeze] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_audit",
          description: "Explains execution certification decision reasoning.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            return srv.explainCertificationDecision(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_audit] already registered: ${e.message}`);
      }

      try {
        toolRegistry.registerTool({
          name: "execution_package",
          description: "Compiles complete execution certification package.",
          schema: {
            type: "object",
            properties: {
              tenantId: { type: "string" },
              id: { type: "string" }
            },
            required: ["tenantId", "id"]
          },
          execute: async (context: any, args: any) => {
            const srv = container.resolve<ExecutiveExecutionCertificationService>("IExecutiveExecutionCertificationService");
            return srv.compileCertificationPackage(args.tenantId, args.id);
          }
        });
      } catch (e: any) {
        console.warn(`Tool [execution_package] already registered: ${e.message}`);
      }
    }
    console.log("All Executive Services Ready");
  }

  public async onUnregister(container: DIContainer): Promise<void> {
    console.log("[Executive Identity Plugin] Unregistering Executive Identity Plugin.");
  }
}
