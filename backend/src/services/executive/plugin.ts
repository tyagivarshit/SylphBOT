import { IDomainPlugin } from "../../runtime/interfaces/universal";
import { DIContainer } from "../../runtime/kernel/diContainer";
import { ExecutiveIdentityService } from "./identity.service";
import { MemoryExecutiveRepository } from "./repository";
import { ExecutivePerceptionService } from "./perception.service";
import { ExecutiveCognitionService } from "./cognition.service";
import { MemoryExecutiveMemoryRepository, ExecutiveMemoryService } from "./memory.service";
import { MemoryExecutiveMemoryArchitectureRepository, ExecutiveMemoryArchitectureService } from "./memoryArchitecture.service";
import { MemoryExecutiveMemoryConsolidationRepository, ExecutiveMemoryConsolidationService } from "./memoryConsolidation.service";
import { MemoryExecutiveMemoryRetrievalRepository, ExecutiveMemoryRetrievalService } from "./memoryRetrieval.service";
import { MemoryExecutiveMemoryAssociationRepository, ExecutiveMemoryAssociationService } from "./memoryAssociation.service";
import { MemoryExecutiveSemanticMemoryRepository, ExecutiveSemanticMemoryService } from "./semanticMemory.service";
import { MemoryExecutiveOrganizationalKnowledgeRepository, ExecutiveOrganizationalKnowledgeService } from "./organizationalKnowledge.service";
import { MemoryExecutiveMemoryOptimizationRepository, ExecutiveMemoryOptimizationService } from "./memoryOptimization.service";
import { MemoryExecutiveMemoryGovernanceRepository, ExecutiveMemoryGovernanceService } from "./memoryGovernance.service";
import { MemoryExecutiveMemoryCertificationRepository, ExecutiveMemoryCertificationService } from "./memoryCertification.service";
import { MemoryExecutiveGoalRepository, ExecutiveGoalIntelligenceService } from "./goalIntelligence.service";

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
  ];

  public async onRegister(container: DIContainer): Promise<void> {
    // Register the repository
    const repository = new MemoryExecutiveRepository(container);
    container.registerInstance("IExecutiveRepository", repository);

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

    const goalService = new ExecutiveGoalIntelligenceService(container);
    container.registerInstance("IExecutiveGoalIntelligenceService", goalService);
    console.log("[Executive Goal Intelligence Plugin] Registered [IExecutiveGoalIntelligenceService] in DI Container.");

    // 2. Register contracts with the Contract Registry
    if (container.has("IContractRegistry")) {
      const contractRegistry = container.resolve<any>("IContractRegistry");

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
    }
  }

  public async onUnregister(container: DIContainer): Promise<void> {
    console.log("[Executive Identity Plugin] Unregistering Executive Identity Plugin.");
  }
}
