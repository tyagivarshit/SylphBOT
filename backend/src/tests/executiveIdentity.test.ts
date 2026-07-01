import assert from "node:assert/strict";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import { container } from "../runtime/kernel/diContainer";
import { ExecutiveIdentityPlugin } from "../services/executive/plugin";
import { ExecutiveIdentityService, BaseExecutiveAI } from "../services/executive/identity.service";
import { ExecutivePerceptionService } from "../services/executive/perception.service";
import { ExecutiveCognitionService } from "../services/executive/cognition.service";
import { ExecutiveMemoryService } from "../services/executive/memory.service";
import { ExecutiveMemoryArchitectureService } from "../services/executive/memoryArchitecture.service";
import { ExecutiveMemoryConsolidationService } from "../services/executive/memoryConsolidation.service";
import { ExecutiveMemoryAssociationService } from "../services/executive/memoryAssociation.service";
import { ExecutiveMemoryRetrievalService } from "../services/executive/memoryRetrieval.service";
import { ExecutiveSemanticMemoryService } from "../services/executive/semanticMemory.service";
import { ExecutiveOrganizationalKnowledgeService } from "../services/executive/organizationalKnowledge.service";
import { ExecutiveMemoryOptimizationService } from "../services/executive/memoryOptimization.service";
import { ExecutiveMemoryGovernanceService } from "../services/executive/memoryGovernance.service";
import { ExecutiveMemoryCertificationService } from "../services/executive/memoryCertification.service";
import { ExecutiveGoalIntelligenceService, IGoalAssumptionRepository, IGoalAssumption } from "../services/executive/goalIntelligence.service";
import { ExecutiveStrategyIntelligenceService, MemoryExecutiveStrategyRepository, IExecutiveStrategy } from "../services/executive/strategyIntelligence.service";
import { ExecutivePlanningService, MemoryExecutivePlanningRepository, IExecutivePlan } from "../services/executive/planning.service";
import { ExecutiveTimelineService, MemoryExecutiveTimelineRepository, IExecutiveTimeline } from "../services/executive/timeline.service";
import { ExecutiveScenarioService, MemoryExecutiveScenarioRepository, IScenario } from "../services/executive/scenario.service";
import { ExecutivePlanningOptimizationService, MemoryExecutivePlanningOptimizationRepository } from "../services/executive/planningOptimization.service";
import { ExecutiveRiskService, MemoryExecutiveRiskRepository } from "../services/executive/risk.service";
import { ExecutiveResourceService, MemoryExecutiveResourceRepository } from "../services/executive/resource.service";
import { ExecutivePlanningGovernanceService, MemoryExecutivePlanningGovernanceRepository } from "../services/executive/planningGovernance.service";
import { ExecutivePlanningHardeningService, MemoryExecutivePlanningHardeningRepository } from "../services/executive/planningHardening.service";
import { ExecutiveDecisionIntelligenceService, MemoryExecutiveDecisionRepository } from "../services/executive/decisionIntelligence.service";
import { ExecutiveEvidenceValidationService, MemoryExecutiveEvidenceRepository } from "../services/executive/evidenceValidation.service";
import { ExecutiveAlternativeGenerationService, MemoryExecutiveAlternativeRepository } from "../services/executive/alternativeGeneration.service";
import { ExecutiveDecisionEvaluationService, MemoryExecutiveDecisionEvaluationRepository } from "../services/executive/decisionEvaluation.service";
import { ExecutiveSimulationService, MemoryExecutiveSimulationRepository } from "../services/executive/simulationProjection.service";
import { IExecutiveDNA } from "../services/executive/interfaces";
import { validateExecutiveDNA } from "../services/executive/validation";
import { runWithRequestContext } from "../observability/requestContext";

const ensureBootstrapped = async () => {
  if (!container.has("IMemoryEngine")) {
    await bootstrapper.bootstrap().catch(() => {});
  }

  // Register the new plugin dynamically
  const pluginRegistry = container.resolve<any>("IPluginRegistry");
  if (!pluginRegistry.getPlugin("plugin.executive.identity")) {
    await pluginRegistry.registerPlugin(new ExecutiveIdentityPlugin());
  }
};

const getDummyDNA = (role: string = "CHIEF_OPERATIONS"): IExecutiveDNA => {
  return {
    role,
    version: "1.0.0",
    mission: {
      vision: "Ensure seamless operational throughput across services.",
      directives: ["Optimize queues", "Mitigate resource constraints"],
      alignmentTargets: ["infrastructure:efficiency"],
    },
    responsibilities: [
      {
        id: "resp_queue_mgmt",
        title: "Queue Management",
        description: "Oversee operational backlog",
        domain: "operations",
        kpiIds: ["kpi_backlog_rate"],
      },
    ],
    authorities: [
      {
        id: "auth_budget_approve",
        action: "operations:spend",
        description: "Approve operational expenditure",
        maxBudgetThreshold: 5000,
        approvalRequired: false,
      },
      {
        id: "auth_critical_actions",
        action: "operations:override",
        description: "Override safety limits",
        approvalRequired: true,
      },
    ],
    boundaries: [
      {
        id: "bound_cross_tenant",
        rule: "no_cross_tenant_resource_sharing",
        description: "Prevent data leaks",
        isHardLimit: true,
        vetoRequired: true,
      },
      {
        id: "bound_consecutive_fails",
        rule: "limit_consecutive_failures",
        description: "Scale back when failing",
        isHardLimit: false,
        vetoRequired: false,
      },
    ],
    kpiOwnership: [
      {
        id: "kpi_backlog_rate",
        name: "Backlog Processing Rate",
        metricToken: "op.backlog.rate",
        targetValue: 95.0,
        currentValue: 92.5,
        unit: "%",
        frequency: "daily",
      },
    ],
    decisionScope: [
      {
        id: "scope_ops",
        decisionType: "operational",
        allowedActions: ["operations:spend"],
        vetoRules: [],
        jurisdiction: "queues",
      },
    ],
    communicationProfile: {
      style: "structured",
      tone: "analytical",
      channels: ["internal_bus"],
      frequency: "realtime",
      protocols: ["json_rpc"],
    },
    delegationProfile: {
      allowedSubagentRoles: ["worker"],
      delegableTaskTypes: ["cleanup"],
      requiresApprovalAboveThreshold: 1000,
      autoDelegationEnabled: true,
    },
    escalationProfile: {
      escalationTriggers: ["boundary_breach"],
      notificationTargets: ["governance_board"],
      gracePeriodMs: 60000,
      fallbackStatus: "SUSPENDED",
    },
    successCriteria: [
      {
        id: "sc_backlog",
        description: "Maintain high processing rate",
        kpiId: "kpi_backlog_rate",
        threshold: 90,
        timeframeDays: 7,
      },
    ],
    failureCriteria: [
      {
        id: "fc_failures",
        description: "Abort if too many failures occur",
        triggerMetric: "op.consecutive.failures",
        breachThreshold: 3,
        consecutiveOccurrences: 1,
      },
    ],
    personalityModel: {
      traits: { riskTolerance: 0.2, analyticalFocus: 0.9 },
      decisionStyle: "analytical",
      cognitiveBiasesToManage: ["lossAversion"],
    },
  };
};

export const executiveIdentityTests: any[] = [
  {
    name: "Executive Identity: DNA validation detects invalid schemas",
    run: async () => {
      // 1. Missing vision
      const badDNA1 = getDummyDNA("BAD_ROLE_1");
      badDNA1.mission.vision = "";
      const validation1 = validateExecutiveDNA(badDNA1);
      assert.equal(validation1.isValid, false);
      assert.ok(validation1.issues.some(i => i.includes("Vision is required")));

      // 2. Invalid trait score range
      const badDNA2 = getDummyDNA("BAD_ROLE_2");
      badDNA2.personalityModel.traits.riskTolerance = 1.5;
      const validation2 = validateExecutiveDNA(badDNA2);
      assert.equal(validation2.isValid, false);
      assert.ok(validation2.issues.some(i => i.includes("must be between 0.0 and 1.0")));
    },
  },
  {
    name: "Executive Identity: registers DNA and instantiates Executive Identity",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      service.reset();

      const dna = getDummyDNA("CHIEF_OPERATIONS");
      service.registerDNA(dna);

      const retrievedDna = service.getDNA("CHIEF_OPERATIONS");
      assert.ok(retrievedDna);
      assert.equal(retrievedDna.version, "1.0.0");

      const tenantId = "tenant_test_1";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Ops Director", { dept: "infra" });

      assert.ok(exec.id);
      assert.equal(exec.name, "Ops Director");
      assert.equal(exec.role, "CHIEF_OPERATIONS");
      assert.equal(exec.status, "ACTIVE");
      assert.equal((exec.metadata as any).dept, "infra");
    },
  },
  {
    name: "Executive Identity: enforces tenant isolation on retrieval",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantA = "tenant_A";
      const tenantB = "tenant_B";

      const exec = await service.createExecutive(tenantA, "CHIEF_OPERATIONS", "Ops Director A");

      // Verify normal retrieval works
      const retrieved = await service.getExecutive(tenantA, exec.id);
      assert.ok(retrieved);
      assert.equal(retrieved.name, "Ops Director A");

      // Try cross-tenant retrieval and verify rejection
      await assert.rejects(
        async () => {
          await service.getExecutive(tenantB, exec.id);
        },
        /Cross-tenant Executive access blocked/
      );
    },
  },
  {
    name: "Executive Identity: validates operational authority thresholds",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_test_auth";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Ops Controller");

      // 1. Authorized action within budget
      const auth1 = await service.validateAuthority(tenantId, exec.id, "operations:spend", { budgetAmount: 2500 });
      assert.equal(auth1.authorized, true);

      // 2. Budget exceeds limit
      const auth2 = await service.validateAuthority(tenantId, exec.id, "operations:spend", { budgetAmount: 10000 });
      assert.equal(auth2.authorized, false);
      assert.ok(auth2.reason?.includes("exceeds authority limit"));

      // 3. Action requires manual approval
      const auth3 = await service.validateAuthority(tenantId, exec.id, "operations:override");
      assert.equal(auth3.authorized, false);
      assert.ok(auth3.reason?.includes("requires explicit manual approval"));

      // 4. Action not in authorities
      const auth4 = await service.validateAuthority(tenantId, exec.id, "operations:terminate");
      assert.equal(auth4.authorized, false);
      assert.ok(auth4.reason?.includes("not listed in the authorities"));
    },
  },
  {
    name: "Executive Identity: monitors boundaries, creates incident in OIG, and triggers escalation fallback",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const eventBus = container.resolve<any>("IEventBus");

      const tenantId = "tenant_test_boundary";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Ops Controller");

      let boundaryBreachedEvent = false;
      let escalatedEvent = false;

      eventBus.subscribe("executive.boundary.breached", async (env: any) => {
        if (env.payload.id === exec.id) {
          boundaryBreachedEvent = true;
        }
      });

      eventBus.subscribe("executive.escalated", async (env: any) => {
        if (env.payload.id === exec.id) {
          escalatedEvent = true;
        }
      });

      // Trigger cross-tenant boundary breach
      const check = await service.checkBoundary(tenantId, exec.id, "no_cross_tenant_resource_sharing", "tenant_hacker");
      assert.equal(check.breached, true);
      assert.ok(check.message?.includes("Cross-tenant boundary breached"));

      // Check status updated to SUSPENDED due to Escalation profile
      const updatedExec = await service.getExecutive(tenantId, exec.id);
      assert.equal(updatedExec?.status, "SUSPENDED");

      // Give a tiny window for async event loop
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.equal(boundaryBreachedEvent, true);
      assert.equal(escalatedEvent, true);

      // Verify Incident node exists in OIG graph
      const graph = container.resolve<any>("IOrganizationGraph");
      const result = graph.query({ type: "Incident" });
      assert.ok(result.length > 0);
      assert.ok(result.some((node: any) => node.properties.rule === "no_cross_tenant_resource_sharing"));
    },
  },
  {
    name: "Executive Identity: integrates with Tool Registry and routes execute requests",
    run: async () => {
      await ensureBootstrapped();
      const toolRegistry = container.resolve<any>("IToolRegistry");
      const tools = toolRegistry.listTools().map((t: any) => t.name);

      assert.ok(tools.includes("create_executive_identity"));
      assert.ok(tools.includes("validate_executive_authority"));
      assert.ok(tools.includes("check_executive_boundary"));

      const tenantId = "tenant_test_tools";

      // Execute tool to create executive
      const toolExecutor = container.resolve<any>("IToolExecutor");
      const context = { tenantId, actorId: "test_harness", roles: ["SERVICE"], scopes: ["oig:write", "oig:read"] };

      const execResult = await toolExecutor.executeTool("create_executive_identity", {
        tenantId,
        role: "CHIEF_OPERATIONS",
        name: "Tool Created Executive",
        metadata: { createdVia: "tool" },
      } as any, context);

      assert.equal(execResult.success, true);
      assert.ok(execResult.output.id);
      assert.equal(execResult.output.name, "Tool Created Executive");

      // Execute tool to validate authority
      const authResult = await toolExecutor.executeTool("validate_executive_authority", {
        tenantId,
        id: execResult.output.id,
        action: "operations:spend",
        context: { budgetAmount: 100 },
      }, context);

      assert.equal(authResult.success, true);
      assert.equal(authResult.output.authorized, true);
    },
  },
  {
    name: "Executive Identity: registers DNA and creates identity with capability profile & authority matrix",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const dna = getDummyDNA("CHIEF_OPERATIONS_MATRIX");
      dna.capabilityProfile = {
        allowedDecisionCategories: ["operational", "tactical"],
        allowedReasoningDomains: ["operations", "logistics"],
        executableCapabilities: ["operations:spend", "operations:override"],
        collaborationCapabilities: ["peer_notify"],
        delegationCapabilities: ["auto_delegate"],
        reviewCapabilities: ["audit_logs"],
        approvalCapabilities: ["override_veto"]
      };
      dna.decisionAuthorityMatrix = {
        rules: [
          {
            action: "operations:spend",
            ownershipRole: "CHIEF_OPERATIONS_MATRIX",
            approvalRequired: false,
            approvalThreshold: 5000,
            delegable: true,
            executionRoles: ["CHIEF_OPERATIONS_MATRIX"]
          },
          {
            action: "operations:override",
            ownershipRole: "CHIEF_OPERATIONS_MATRIX",
            approvalRequired: true,
            delegable: false,
            executionRoles: ["CHIEF_OPERATIONS_MATRIX"]
          }
        ]
      };
      dna.businessOutcomes = [
        {
          id: "growth_revenue",
          category: "GROWTH",
          name: "Revenue Expansion",
          description: "Expand recurring revenue",
          targetMetricToken: "revenue.expansion",
          targetValue: 100000,
          currentValue: 80000,
          unit: "USD",
          weight: 0.8,
          higherIsBetter: true,
          status: "ON_TRACK"
        }
      ];

      service.registerDNA(dna);
      const tenantId = "tenant_test_matrix";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS_MATRIX", "Matrix Exec");

      assert.ok(exec.dna.capabilityProfile);
      assert.deepEqual(exec.dna.capabilityProfile.allowedDecisionCategories, ["operational", "tactical"]);
      assert.ok(exec.dna.decisionAuthorityMatrix);
      assert.equal(exec.dna.decisionAuthorityMatrix.rules.length, 2);
      assert.equal(exec.businessOutcomes.length, 1);
      assert.equal(exec.businessOutcomes[0].id, "growth_revenue");
      assert.equal(exec.businessOutcomes[0].status, "CRITICAL");
    }
  },
  {
    name: "Executive Identity: validates lifecycle state transitions",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_lifecycle";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Lifecycle Exec");

      assert.equal(exec.status, "ACTIVE");

      // ACTIVE -> REVIEW is valid
      const reviewExec = await service.transitionLifecycle(tenantId, exec.id, "REVIEW", "Auditing performance");
      assert.equal(reviewExec.status, "REVIEW");

      // REVIEW -> OPTIMIZING is valid
      const optExec = await service.transitionLifecycle(tenantId, exec.id, "OPTIMIZING", "Tuning directives");
      assert.equal(optExec.status, "OPTIMIZING");

      // OPTIMIZING -> ACTIVE is valid
      const activeExec = await service.transitionLifecycle(tenantId, exec.id, "ACTIVE", "Resuming ops");
      assert.equal(activeExec.status, "ACTIVE");

      // ACTIVE -> CONFIGURED is invalid (should reject)
      await assert.rejects(
        async () => {
          await service.transitionLifecycle(tenantId, exec.id, "CONFIGURED", "Direct downgrade");
        },
        /Invalid lifecycle transition/
      );
    }
  },
  {
    name: "Executive Identity: computes health score from signals and escalates on CRITICAL status",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_health";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Health Exec");

      assert.equal(exec.health?.status, "HEALTHY");
      assert.equal(exec.health?.score, 100);

      // Record a minor penalty (confidence degradation to 0.8 => -3 points)
      let updated = await service.recordHealthSignal(tenantId, exec.id, "confidenceScore", 0.8);
      assert.equal(updated.health?.score, 97);
      assert.equal(updated.health?.status, "HEALTHY");

      // Record consecutive policy violations (policyViolationCount to 2 => -50 points)
      updated = await service.recordHealthSignal(tenantId, exec.id, "policyViolationCount", 2);
      assert.ok(updated.health!.score < 50);
      assert.equal(updated.health!.status, "CRITICAL");

      // Verifying status was updated to SUSPENDED due to automatic escalation
      const escalatedExec = await service.getExecutive(tenantId, exec.id);
      assert.equal(escalatedExec?.status, "SUSPENDED");
    }
  },
  {
    name: "Executive Identity: dynamic mission state updates without changing DNA",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_mission";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Mission Exec");

      assert.deepEqual(exec.missionState?.currentDirectives, exec.dna.mission.directives);

      const updated = await service.updateMissionState(tenantId, exec.id, {
        currentDirectives: ["New emergency directive"],
        activeConstraints: ["No external database calls"]
      });

      assert.deepEqual(updated.missionState?.currentDirectives, ["New emergency directive"]);
      assert.deepEqual(updated.missionState?.activeConstraints, ["No external database calls"]);

      // Verify original DNA was not altered
      const currentDna = service.getDNA("CHIEF_OPERATIONS");
      assert.ok(currentDna);
      assert.notDeepEqual(currentDna.mission.directives, ["New emergency directive"]);
      assert.deepEqual(currentDna.mission.directives, exec.dna.mission.directives);
    }
  },
  {
    name: "Executive Identity: business outcome tracking and status recomputation",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_outcome";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Outcome Exec");

      // Verify initial outcome status cloned from DNA (target 95, current 92.5 is >= 85% target (80.75), so it should be AT_RISK!)
      assert.equal(exec.businessOutcomes![0].status, "AT_RISK");

      // Update outcome value to exceed target (96.0)
      let updated = await service.updateBusinessOutcome(tenantId, exec.id, exec.businessOutcomes![0].id, 96.0);
      assert.equal(updated.businessOutcomes![0].status, "ON_TRACK");

      // Update outcome value to critical drop (50.0)
      updated = await service.updateBusinessOutcome(tenantId, exec.id, exec.businessOutcomes![0].id, 50.0);
      assert.equal(updated.businessOutcomes![0].status, "CRITICAL");
    }
  },
  {
    name: "Executive Identity: inherits BaseExecutiveAI for a concrete role implementation",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_inheritance";
      const execIdentity = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Concrete Exec");

      class OperationsExecutiveAI extends BaseExecutiveAI {
        public async getQueueThroughput(): Promise<number> {
          return 42;
        }
      }

      const executive = new OperationsExecutiveAI(tenantId, execIdentity.id, service);

      assert.equal(executive.id, execIdentity.id);
      assert.equal(executive.tenant, tenantId);

      const identity = await executive.getIdentity();
      assert.equal(identity.name, "Concrete Exec");

      const auth = await executive.validateAuthority("operations:spend", { budgetAmount: 100 });
      assert.equal(auth.authorized, true);

      const nextIdentity = await executive.transition("REVIEW", "Audit");
      assert.equal(nextIdentity.status, "REVIEW");

      assert.equal(await executive.getQueueThroughput(), 42);
    }
  },
  {
    name: "Executive Identity: enforces optimistic concurrency on update status",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_concurrency";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Concurrency Exec");

      assert.equal(exec.version, 1);

      // Successful update increments version to 2
      const updated = await service.transitionLifecycle(tenantId, exec.id, "REVIEW", "Transition 1", exec.version);
      assert.equal(updated.version, 2);

      // Attempting to update with stale version 1 throws concurrency error
      await assert.rejects(
        async () => {
          await service.transitionLifecycle(tenantId, exec.id, "ACTIVE", "Stale update", 1);
        },
        /Optimistic concurrency violation/
      );
    }
  },
  {
    name: "Executive Identity: validates dynamic outcome thresholds",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_custom_outcome";
      
      const dna = getDummyDNA("CHIEF_OPERATIONS_CUSTOM");
      dna.businessOutcomes = [
        {
          id: "growth_revenue_custom",
          category: "GROWTH",
          name: "Revenue Expansion Custom",
          description: "Expand revenue with custom thresholds",
          targetMetricToken: "revenue.expansion",
          targetValue: 100000,
          currentValue: 92000, // 92% of target
          unit: "USD",
          weight: 0.8,
          higherIsBetter: true,
          status: "ON_TRACK",
          atRiskThreshold: 0.95,   // At risk if below 95%
          criticalThreshold: 0.90  // Critical if below 90%
        }
      ];
      await service.registerDNA(dna);

      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS_CUSTOM", "Custom Outcome Exec");
      
      // Since current value is 92000 (92%), and atRiskThreshold is 0.95 (95000), it should be AT_RISK (not ON_TRACK)
      assert.equal(exec.businessOutcomes![0].status, "AT_RISK");

      // Update to 85000 (85%), which is below criticalThreshold (0.90 / 90000), should become CRITICAL
      const updated = await service.updateBusinessOutcome(tenantId, exec.id, "growth_revenue_custom", 85000);
      assert.equal(updated.businessOutcomes![0].status, "CRITICAL");
    }
  },
  {
    name: "Executive Identity: self-heals lifecycle state via recovery transitions",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_recovery_lifecycle";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Recovery Exec");

      assert.equal(exec.status, "ACTIVE");

      // Record violation to drop health to degraded (score 75), should auto-transition status to WARNING
      const updated = await service.recordHealthSignal(tenantId, exec.id, "policyViolationCount", 1);
      assert.equal(updated.health!.status, "DEGRADED");
      assert.equal(updated.status, "WARNING");

      // Record another violation in WARNING, should auto-transition to OBSERVATION
      const obsExec = await service.recordHealthSignal(tenantId, exec.id, "policyViolationCount", 1);
      assert.equal(obsExec.status, "OBSERVATION");
    }
  },
  {
    name: "Executive Identity Hooks: Goal Alignment Profile updates",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_goals";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Goal Exec");

      assert.ok(exec.goalAlignment);
      assert.equal(exec.goalAlignment.longTermMissionId, "mission:CHIEF_OPERATIONS:long_term");

      const newAlignment = {
        longTermMissionId: "mission:CHIEF_OPERATIONS:vision_2030",
        strategicObjectiveIds: ["strat_1"],
        tacticalObjectiveIds: ["tact_2"],
        operationalObjectiveIds: ["op_3"],
        currentPriorityIds: ["pri_4"],
        businessOutcomeIds: ["out_5"],
        organizationNodeId: "org_6"
      };

      const updated = await service.updateGoalAlignment(tenantId, exec.id, newAlignment, exec.version);
      assert.equal(updated.goalAlignment!.longTermMissionId, "mission:CHIEF_OPERATIONS:vision_2030");
      assert.deepEqual(updated.goalAlignment!.strategicObjectiveIds, ["strat_1"]);
    }
  },
  {
    name: "Executive Identity Hooks: Capability Negotiation validation",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_capability";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Negotiator Exec");

      // Test capability request for existing capability
      const responseGranted = await service.negotiateCapability(tenantId, exec.id, {
        requestId: "req_1",
        requesterId: "other_agent",
        targetCapability: "auto_delegate",
        context: {},
        timestamp: new Date().toISOString()
      });
      assert.equal(responseGranted.status, "GRANTED");
      assert.ok(responseGranted.authorityNegotiationMetadata);

      // Test capability request for non-existent capability
      const responseDenied = await service.negotiateCapability(tenantId, exec.id, {
        requestId: "req_2",
        requesterId: "other_agent",
        targetCapability: "unauthorized_hacking",
        context: {},
        timestamp: new Date().toISOString()
      });
      assert.equal(responseDenied.status, "DENIED");
    }
  },
  {
    name: "Executive Identity Hooks: Self-Diagnostic metrics reporting",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_diagnostics";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Diag Exec");

      const diag = await service.getDiagnostics(tenantId, exec.id);
      assert.equal(diag.lifecycleState, "ACTIVE");
      assert.equal(diag.healthScore, 100);
      assert.equal(diag.decisionQualityIndex, 1.0);
    }
  },
  {
    name: "Executive Identity Hooks: Explainability tracing contracts",
    run: async () => {
      await ensureBootstrapped();
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_test_explainability";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Explain Exec");

      const explanation = await service.generateDecisionExplanation(tenantId, exec.id, "dec_99", {
        authoritySourceId: "auth_rule_1",
        capabilitySourceId: "cap_profile_2",
        missionSourceId: "mission_3",
        goalSourceId: "goal_4",
        policySourceId: "policy_5",
        evidenceReferences: ["doc_1", "doc_2"]
      });

      assert.equal(explanation.decisionId, "dec_99");
      assert.equal(explanation.executiveId, exec.id);
      assert.equal(explanation.confidenceMetadata.confidenceLevel, "high");
      assert.ok(explanation.executionTraceReference.startsWith("trace:dec_99:"));
    }
  },
  {
    name: "Executive Perception: orchestrates complete situation intelligence",
    run: async () => {
      await ensureBootstrapped();
      const perceptionService = container.resolve<ExecutivePerceptionService>("IExecutivePerceptionService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      const tenantId = "tenant_perception_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Perception Ops");

      const rawContext = {
        events: [{ type: "SYSTEM_ALERT", message: "API Gateway degraded" }],
        customerInteractions: [{ actorId: "cust_101", feedback: "latency is high" }],
        businessEntities: [],
        metrics: {
          errorRate: 0.08, // Exceeds critical threshold (>0.05)
          latency: 1200,    // Exceeds latency threshold (>1000)
          budgetLimit: 50000
        },
        environment: { mode: "production" },
        currentRequest: {
          objectives: ["Reduce customer latency complaints"],
          userIntent: "Analyze system performance degradation"
        }
      };

      const result = await perceptionService.perceiveSituation(tenantId, exec.id, rawContext);

      // Verify DELIVERABLE 1: Observation Model
      assert.ok(result.observation);
      assert.equal(result.observation.identityId, exec.id);
      assert.equal(result.observation.observedAt.length > 0, true);

      // Verify DELIVERABLE 2: Situation Model
      assert.equal(result.situation.currentState, "DEGRADED");
      assert.deepEqual(result.situation.actors, ["cust_101"]);
      assert.deepEqual(result.situation.constraints, ["Operational budget capped at USD 50000"]);

      // Verify DELIVERABLE 4: Signal Detection
      assert.equal(result.signals.length >= 2, true);
      assert.ok(result.signals.some(s => s.category === "CRITICAL"));
      assert.ok(result.signals.some(s => s.category === "ANOMALY"));

      // Verify DELIVERABLE 5: Objective Resolution
      assert.deepEqual(result.objectives.explicitObjectives, ["Reduce customer latency complaints"]);
      assert.ok(result.objectives.implicitObjectives.length > 0);

      // Verify DELIVERABLE 6: Information Gap Report
      assert.ok(result.gapReport);
      assert.equal(result.gapReport.shouldContinueReasoning, true);

      // Verify DELIVERABLE 7: Attention evaluation
      assert.ok(result.attentionItems.length > 0);
      assert.ok(result.attentionItems[0].score > 0);

      // Verify DELIVERABLE 8: Structured Summary
      assert.ok(result.summary);
      assert.ok(result.summary.activeSignals.length > 0);

      // Verify DELIVERABLE 9: Situation Score
      assert.ok(result.score);
      assert.equal(result.score.readinessForReasoning, true);
      assert.ok(result.score.situationClarity > 0);

      // Verify Hardening DELIVERABLE 1: Dynamics Engine
      assert.ok(result.dynamics);
      assert.equal(result.dynamics.direction, "STABLE");
      assert.equal(result.dynamics.stability, 0.95);

      // Verify Hardening DELIVERABLE 2: Causal Signal Engine
      assert.ok(result.causalSignals);
      assert.equal(result.causalSignals.length > 0, true);
      assert.ok(result.causalSignals[0].possibleCauses.length > 0);

      // Verify Hardening DELIVERABLE 3: Attention Budget Engine
      assert.ok(result.attentionBudget);
      assert.equal(result.attentionBudget.totalCapacity, 100);
      assert.equal(result.attentionBudget.allocatedCapacity > 0, true);

      // Verify Hardening DELIVERABLE 4: Observation Confidence
      assert.ok(result.observationConfidences);
      assert.equal(result.observationConfidences.length > 0, true);

      // Verify Hardening DELIVERABLE 5: Freshness Details
      assert.ok(result.freshnessDetails);
      assert.equal(result.freshnessDetails.length > 0, true);
      assert.equal(result.freshnessDetails[0].isStale, false);

      // Verify Hardening DELIVERABLE 6: Dependencies
      assert.ok(result.dependencies);
      assert.equal(result.dependencies.length > 0, true);

      // Verify Hardening DELIVERABLE 7: Blind Spot Report
      assert.ok(result.blindSpots);
      assert.deepEqual(result.blindSpots.missingDepartments, ["FINANCE"]);

      // Verify Hardening DELIVERABLE 8: Curiosity Engine
      assert.ok(result.curiosityTasks);
      assert.equal(result.curiosityTasks.length > 0, true);
      assert.ok(result.curiosityTasks[0].question.includes("missing"));

      // Verify Hardening DELIVERABLE 9: Complexity Engine
      assert.ok(result.complexity);
      assert.equal(result.complexity.classification, "COMPLEX");

      // Verify Hardening DELIVERABLE 10: Situation Readiness Index
      assert.ok(result.readinessIndex);
      assert.equal(result.readinessIndex.readinessLevel, "WARNING");
      assert.equal(result.readinessIndex.reasoningAllowed, true);

      // Verify Hardening DELIVERABLE 11: Timeline
      assert.ok(result.timeline);
      assert.equal(result.timeline.currentEvents.length > 0, true);

      // Verify Hardening DELIVERABLE 12: Explainability Audits
      assert.ok(result.explainabilityAudits);
      assert.equal(result.explainabilityAudits.length > 0, true);
    }
  },
  {
    name: "Executive Cognition: orchestrates complete cognitive architecture mapping",
    run: async () => {
      await ensureBootstrapped();
      const perceptionService = container.resolve<ExecutivePerceptionService>("IExecutivePerceptionService");
      const cognitionService = container.resolve<ExecutiveCognitionService>("IExecutiveCognitionService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");
      
      const tenantId = "tenant_cognition_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Cognition Ops");

      const rawContext = {
        events: [{ type: "SYSTEM_ALERT", message: "API Gateway degraded" }],
        metrics: {
          errorRate: 0.08,
          latency: 1200,
          budgetLimit: 50000
        },
        currentRequest: {
          objectives: ["Reduce customer latency complaints"],
          userIntent: "Analyze system performance degradation"
        }
      };

      const perceptionResult = await perceptionService.perceiveSituation(tenantId, exec.id, rawContext);
      const model = await cognitionService.orchestrateCognition(tenantId, exec.id, perceptionResult);

      // Verify DELIVERABLE 1: Cognitive Engine orchestration
      assert.ok(model);

      // Verify DELIVERABLE 2: Observation Interpretation
      assert.ok(model.interpretations.length > 0);
      assert.equal(model.interpretations[0].meaning.includes("operational system warnings"), true);
      assert.ok(model.interpretations[0].businessRelevance);
      assert.ok(model.interpretations[0].missionRelevance);

      // Verify DELIVERABLE 3 & 4: Hypothesis Generation & Ranking
      assert.equal(model.hypotheses.length >= 6, true);
      const sum = model.hypotheses.reduce((acc, h) => acc + h.probability, 0);
      assert.ok(Math.abs(sum - 1.0) < 0.01); // Sums to ~1.0

      // Verify DELIVERABLE 5: Evidence Intelligence
      assert.ok(model.evidenceRelations.length > 0);
      assert.ok(model.evidenceRelations.some(e => e.category === "SUPPORTING"));
      assert.ok(model.evidenceRelations.some(e => e.category === "CONTRADICTING"));

      // Verify DELIVERABLE 6: Alternative Thinking Views
      assert.ok(model.alternatives.bestCase);
      assert.ok(model.alternatives.expectedCase);
      assert.ok(model.alternatives.worstCase);
      assert.ok(model.alternatives.contrarianView);
      assert.ok(model.alternatives.operatorView);

      // Verify DELIVERABLE 7: Counter-Argument Challenge
      assert.ok(model.counterArguments.length > 0);
      assert.ok(model.counterArguments[0].whyCouldThisBeWrong);

      // Verify DELIVERABLE 8: Contradiction Detection
      assert.ok(model.contradictions.length > 0);
      assert.equal(model.contradictions[0].severity, "MEDIUM");

      // Verify DELIVERABLE 9: Uncertainty Profile
      assert.deepEqual(model.uncertainty.knowns, ["runtime_error_rate_spike", "latency_degradation"]);
      assert.ok(model.uncertainty.estimatedParameters.systemStabilityScore);

      // Verify DELIVERABLE 10: Thinking Graph
      assert.ok(model.thinkingGraph.nodes.length > 0);
      assert.ok(model.thinkingGraph.edges.length > 0);
      assert.ok(model.thinkingGraph.nodes.some(n => n.type === "HYPOTHESIS"));

      // Verify DELIVERABLE 11: Summary
      assert.ok(model.summary.interpretations.length > 0);
      assert.ok(model.summary.leadingHypotheses.length > 0);

      // Verify DELIVERABLE 12: Explainability
      assert.ok(model.explainability.length > 0);
      assert.ok(model.explainability[0].competingHypothesesRefs.length > 0);

      // Verify DELIVERABLE 13: Cognitive Stability
      assert.ok(model.stability.length > 0);
      assert.equal(model.stability[0].status, "STABLE");

      // Verify DELIVERABLE 14: Cognitive Bias Report
      assert.ok(model.biasReport.confirmationBiasRisk > 0);
      assert.ok(model.biasReport.recencyBiasRisk > 0);

      // Verify DELIVERABLE 15: Thinking Readiness Index
      assert.ok(model.readiness.thinkingReadinessIndex > 0);
      assert.equal(model.readiness.isReadinessApproved, true);

      // Verify Hardening DELIVERABLE 1: Mental Models selection
      assert.ok(model.mentalModels);
      assert.equal(model.mentalModels.length >= 3, true);
      assert.equal(model.mentalModels[0].modelName, "Root Cause Analysis");

      // Verify Hardening DELIVERABLE 2: Thinking Strategy Selection
      assert.ok(model.thinkingStrategies);
      assert.equal(model.thinkingStrategies.length >= 3, true);
      assert.equal(model.thinkingStrategies[0].strategyName, "Operational");

      // Verify Hardening DELIVERABLE 3: Reasoning Depth Engine
      assert.ok(model.reasoningDepthTree);
      assert.equal(model.reasoningDepthTree.level, 1);
      assert.equal(model.reasoningDepthTree.focusArea, "Systemic Organizational Issues");
      assert.ok(model.reasoningDepthTree.children);

      // Verify Hardening DELIVERABLE 4: Mental Model Explainability
      assert.ok(model.modelExplainability);
      assert.deepEqual(model.modelExplainability.appliedModels, ["Root Cause Analysis", "Failure Mode Analysis", "Second-order Thinking"]);
      assert.ok(model.modelExplainability.rejectedModels.includes("Cost-Benefit Analysis"));

      // Verify Hardening DELIVERABLE 5: Thinking Quality Metrics
      assert.ok(model.thinkingQuality);
      assert.ok(model.thinkingQuality.overallScore > 0.8);
      assert.equal(model.thinkingQuality.reasoningDepthScore, 0.92);

      // Verify Hardening DELIVERABLE 6: Cognitive Self Critique
      assert.ok(model.selfCritique);
      assert.equal(model.selfCritique.didIgnoreCustomerImpact, true);
      assert.equal(model.selfCritique.critiqueNotes.length > 0, true);
    }
  },
  {
    name: "Executive Memory: orchestrates complete memory identity and lifecycle validation",
    run: async () => {
      await ensureBootstrapped();
      const memoryService = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Memory Ops");

      // Verify DELIVERABLE 1 & 2: Memory DNA / Blueprint Registration
      const memory = await memoryService.registerMemory(tenantId, exec.id, {
        category: "TACTICAL",
        key: "system_error_rate",
        value: 0.08,
        source: "perception",
        evidenceRefs: ["sig_err_101", "sig_err_102"],
        importanceWeights: {
          businessImpact: 0.8,
          executiveRelevance: 0.9,
          strategicValue: 0.4,
          operationalValue: 0.95
        }
      });

      assert.ok(memory.id);
      assert.equal(memory.tenantId, tenantId);
      assert.equal(memory.executiveId, exec.id);
      assert.equal(memory.category, "TACTICAL");
      assert.equal(memory.key, "system_error_rate");
      assert.equal(memory.value, 0.08);
      assert.equal(memory.lifecycleState, "ACTIVE");

      // Verify DELIVERABLE 5: Metadata
      assert.equal(memory.metadata.source, "perception");
      assert.equal(memory.metadata.version, 1);
      assert.ok(memory.metadata.confidenceScore > 0.8);

      // Verify DELIVERABLE 7: Memory Importance Engine
      assert.ok(memory.importance.overallImportance > 0.7);
      assert.equal(memory.importance.frequencyCount, 1);

      // Verify DELIVERABLE 9: Memory Freshness
      assert.ok(memory.freshness.decayFactor > 0.9);
      assert.equal(memory.freshness.isStale, false);

      // Verify DELIVERABLE 11: Explainability
      assert.ok(memory.explainability.whyItExists);
      assert.ok(memory.explainability.confidenceJustification);

      // Verify DELIVERABLE 6: Memory Lifecycle - strengthen memory
      const strengthened = await memoryService.strengthenMemory(tenantId, memory.id, {
        addedEvidenceRefs: ["sig_err_103"]
      });

      assert.equal(strengthened.lifecycleState, "STRENGTHENED");
      assert.equal(strengthened.metadata.version, 2);
      assert.equal(strengthened.importance.frequencyCount, 2);
      assert.ok(strengthened.metadata.evidenceRefs.includes("sig_err_103"));

      // Verify query option
      const list = await memoryService.queryMemories(tenantId, exec.id, { key: "system_error_rate" });
      assert.equal(list.length, 1);
      assert.equal(list[0].id, memory.id);

      // Verify DELIVERABLE 10: Memory Security - check tenant isolation
      await assert.rejects(
        async () => {
          await memoryService.getMemory("different_tenant", memory.id);
        },
        /Security Violation/
      );

      // Verify Logical Delete
      await memoryService.deleteMemory(tenantId, memory.id);
      const deleted = await memoryService.getMemory(tenantId, memory.id);
      assert.equal(deleted, null);
    }
  },
  {
    name: "Executive Memory Architecture: orchestrates taxonomy, context, timeline and OIG dependency graphs",
    run: async () => {
      await ensureBootstrapped();
      const memoryService = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
      const archService = container.resolve<ExecutiveMemoryArchitectureService>("IExecutiveMemoryArchitectureService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_arch_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Arch Memory Ops");

      // Register base memory
      const memory = await memoryService.registerMemory(tenantId, exec.id, {
        category: "TACTICAL",
        key: "latency_anomaly",
        value: 1200,
        source: "perception",
        importanceWeights: {
          businessImpact: 0.9,
          executiveRelevance: 0.85,
          strategicValue: 0.7,
          operationalValue: 0.95
        }
      });

      // Build Memory Architecture Metadata (Deliverable 1)
      const record = await archService.buildMemoryArchitecture(tenantId, memory.id, {
        category: "OPERATIONAL",
        domain: "Operations",
        functionName: "CheckoutLatencyObserver",
        ownerRole: "CHIEF_OPERATIONS",
        dependsOnIds: ["mem_tactical_dep123"],
        relationships: [
          {
            targetId: "cust_101",
            targetType: "CUSTOMER",
            relationshipType: "AFFECTED_BY",
            confidence: 0.9,
            direction: "BIDIRECTIONAL",
            weight: 0.8,
            strength: 0.85,
            source: "perception_engine",
            explainability: "High latency directly impacted this customer checkout session."
          }
        ]
      });

      // Verify DELIVERABLE 2: Memory Taxonomy
      assert.ok(record.taxonomy);
      assert.equal(record.taxonomy.domain, "Operations");
      assert.equal(record.taxonomy.businessImportance, "CRITICAL");
      assert.equal(record.taxonomy.timeHorizon, "CURRENT");

      // Verify DELIVERABLE 3: Memory Relationships (OIG integration)
      assert.equal(record.relationships.length, 2); // Includes affected customer and auto-linked owner executive
      assert.ok(record.relationships.some(r => r.targetType === "CUSTOMER"));
      assert.ok(record.relationships.some(r => r.targetType === "EXECUTIVE"));

      // Verify DELIVERABLE 4: Memory Context
      assert.ok(record.context.businessContext);
      assert.ok(record.context.executiveContext);

      // Verify DELIVERABLE 5: Memory Timeline
      assert.equal(record.timeline.temporalState, "CURRENT");

      // Verify DELIVERABLE 6: Memory Ownership
      assert.equal(record.ownership.creatorId, exec.id);
      assert.equal(record.ownership.ownerId, exec.id);

      // Verify DELIVERABLE 8: Dependency Engine
      assert.deepEqual(record.dependency.dependsOnIds, ["mem_tactical_dep123"]);
      assert.equal(record.dependency.cascadingImpactRisk, 0.6);

      // Verify DELIVERABLE 9: Classification
      assert.equal(record.classification, "CRITICAL");

      // Verify DELIVERABLE 10: Explainability
      assert.ok(record.explainability.whyExists);
      assert.ok(record.explainability.whyClassified);

      // Verify DELIVERABLE 7: Memory Association
      const associations = await archService.associateMemoryContext(tenantId, memory.id);
      assert.equal(associations.length, 2);
      assert.ok(associations.includes("cust_101"));

      // Verify DELIVERABLE 11: Memory Architecture Health
      const health = await archService.getArchitectureHealth(tenantId, exec.id);
      assert.equal(health.relationshipDensity, 2.0);
      assert.equal(health.orphanMemoryCount, 0);
      assert.equal(health.contextCompleteness, 1.0);

      // Verify Security: tenant boundary validation
      await assert.rejects(
        async () => {
          await archService.associateMemoryContext("different_tenant", memory.id);
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Memory Consolidation: consolidates memories, extracts insights, and runs compression filters",
    run: async () => {
      await ensureBootstrapped();
      const memoryService = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
      const conService = container.resolve<ExecutiveMemoryConsolidationService>("IExecutiveMemoryConsolidationService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_con_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Con Memory Ops");

      // Register two similar raw memories
      const memory1 = await memoryService.registerMemory(tenantId, exec.id, {
        category: "TACTICAL",
        key: "system_error_rate",
        value: 0.08,
        source: "perception"
      });

      const memory2 = await memoryService.registerMemory(tenantId, exec.id, {
        category: "TACTICAL",
        key: "system_error_rate",
        value: 0.09,
        source: "perception"
      });

      // Run Memory Consolidation Engine
      const record = await conService.consolidateMemories(tenantId, exec.id, [memory1.id, memory2.id], {
        consolidatedKey: "system_error_rate",
        consolidatedValue: 0.085
      });

      assert.ok(record.id);
      assert.equal(record.consolidatedKey, "system_error_rate");
      assert.equal(record.consolidatedValue, 0.085);

      // Verify DELIVERABLE 12: Memory Quality Metrics
      assert.ok(record.quality);
      assert.ok(record.quality.overallQualityScore > 0.8);
      assert.equal(record.quality.usageFrequency, 2);

      // Verify DELIVERABLE 13: Insight Extraction Engine (Generates insights, never recommendations)
      assert.ok(record.insights.length > 0);
      assert.ok(record.insights.some(i => i.type === "GROWING_RISK"));
      assert.ok(record.insights.some(i => i.type === "REPEATED_FAILURE"));
      assert.equal(record.insights.some(i => i.description.includes("recommend")), false); // Strictly no recommendations

      // Verify DELIVERABLE 14: Memory Compression Engine (No info loss, pattern preservation)
      assert.ok(record.compression);
      assert.deepEqual(record.compression.originalMemoryIds, [memory1.id, memory2.id]);
      assert.ok(record.compression.preservedPatterns.length > 0);

      // Verify DELIVERABLE 15: Memory Explainability Engine
      assert.ok(record.explainability.whyMerged);
      assert.ok(record.explainability.whyImportant);

      // Verify DELIVERABLE 7: Organizational Learning
      const shared = await conService.shareKnowledge(tenantId, record.id, ["CHIEF_MARKETING"]);
      assert.ok(shared.sharedKnowledge);
      assert.equal(shared.sharedKnowledge.knowledgeId, `shared_${record.id}`);
      assert.deepEqual(shared.sharedKnowledge.permittedRoles, ["CHIEF_MARKETING"]);

      // Verify DELIVERABLE 8: Memory Evolution Engine
      const evolved = await conService.evolveMemory(tenantId, record.id, 0.095, 0.05, 0.02);
      assert.ok(evolved.evolution);
      assert.equal(evolved.evolution.version, 2);
      assert.equal(evolved.consolidatedValue, 0.095);

      // Verify DELIVERABLE 9: Memory Conflict Resolution
      const resolved = await conService.resolveConflicts(tenantId, record.id, [memory2.id], "Omitted duplicate metrics");
      assert.ok(resolved.conflictResolution);
      assert.equal(resolved.conflictResolution.resolutionExplanation, "Omitted duplicate metrics");
      assert.equal(resolved.quality.consistencyScore, 1.0);

      // Verify DELIVERABLE 10: Knowledge Confidence Engine
      const kConfidence = conService.calculateKnowledgeConfidence(record, [memory1.id], 0);
      assert.ok(kConfidence.confidence > 0.8);
      assert.equal(kConfidence.evidenceCount, 1);

      // Verify DELIVERABLE 11: Executive Recall Engine
      const recalls = await conService.recallBestMemories(tenantId, exec.id, "system_error_rate", 0.5);
      assert.equal(recalls.length >= 1, true);
      assert.ok(recalls[0].score > 0.5);

      // Verify tool discovery support endpoints
      const patterns = await conService.discoverPatterns(tenantId, exec.id, "system_error_rate");
      assert.equal(patterns.length >= 1, true);

      const knowledgeList = await conService.retrieveKnowledge(tenantId, exec.id, "system_error_rate", 0.7);
      assert.equal(knowledgeList.length, 1);
      assert.equal(knowledgeList[0].id, record.id);
    }
  },
  {
    name: "Executive Memory Retrieval: contextual matching, recall ranking, diversity rules, and token window optimizations",
    run: async () => {
      await ensureBootstrapped();
      const memoryService = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
      const retService = container.resolve<ExecutiveMemoryRetrievalService>("IExecutiveMemoryRetrievalService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_ret_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Ret Memory Ops");

      // Register a set of varying context memories
      const memory1 = await memoryService.registerMemory(tenantId, exec.id, {
        category: "TACTICAL",
        key: "latency_anomalies_peak",
        value: 1500,
        source: "perception",
        importanceWeights: { businessImpact: 0.9, executiveRelevance: 0.9, strategicValue: 0.8, operationalValue: 0.9 }
      });

      const memory2 = await memoryService.registerMemory(tenantId, exec.id, {
        category: "STRATEGIC",
        key: "market_expansion_route",
        value: "expansion_apac",
        source: "cognition",
        importanceWeights: { businessImpact: 0.4, executiveRelevance: 0.5, strategicValue: 0.9, operationalValue: 0.4 }
      });

      // Run Contextual Retrieval Engine (Deliverable 1 & 3)
      const pkg = await retService.retrieveContextualMemories(tenantId, exec.id, {
        situation: "latency_anomalies_peak",
        businessContext: "latency_anomalies_peak",
        executiveRole: exec.id,
      }, {
        maxTokens: 500 // test token limit constraints
      });

      assert.ok(pkg);
      assert.equal(pkg.tenantId, tenantId);
      assert.equal(pkg.executiveId, exec.id);
      assert.equal(pkg.retrievedMemories.length >= 1, true);

      const firstItem = pkg.retrievedMemories[0];

      // Verify DELIVERABLE 2: Similarity Engine
      assert.ok(firstItem.similarity);
      assert.ok(firstItem.similarity.semanticSimilarity > 0.8);
      assert.ok(firstItem.similarity.score > 0.6);

      // Verify DELIVERABLE 4: Retrieval Ranking Engine
      assert.ok(firstItem.ranking);
      assert.ok(firstItem.ranking.score > 0.5);

      // Verify DELIVERABLE 7: Memory Traceability Engine
      assert.ok(firstItem.traceability);
      assert.ok(firstItem.traceability.whyRetrieved);
      assert.ok(firstItem.traceability.rankingScore > 0);

      // Verify DELIVERABLE 6: Context Window Optimization (size is calculated correctly)
      assert.ok(pkg.optimizedContextSize > 0);

      // Verify Security: tenant boundary validation
      await assert.rejects(
        async () => {
          await retService.retrieveContextualMemories("different_tenant", exec.id, { situation: "latency_anomalies_peak" });
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Memory Association & Graph: multi-hop paths, dynamic strength scoring, cascading impacts, and health audits",
    run: async () => {
      await ensureBootstrapped();
      const assocService = container.resolve<ExecutiveMemoryAssociationService>("IExecutiveMemoryAssociationService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_assoc_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Assoc Graph Ops");

      // Register nodes (Deliverable 4/8: Path discovery entities)
      await assocService.addNode(tenantId, exec.id, "cust_a", "CUSTOMER", "Customer A");
      await assocService.addNode(tenantId, exec.id, "deal_x", "DEAL", "Deal X");
      await assocService.addNode(tenantId, exec.id, "discount_pct", "METRIC", "Discount");
      await assocService.addNode(tenantId, exec.id, "margin_pct", "METRIC", "Margin");
      await assocService.addNode(tenantId, exec.id, "profit_amt", "FINANCIAL", "Profit");
      await assocService.addNode(tenantId, exec.id, "cashflow_amt", "FINANCIAL", "Cashflow");
      await assocService.addNode(tenantId, exec.id, "company_health", "HEALTH", "Company Health");

      // Link nodes and calculate dynamic relationship strength (Deliverable 6 & 9)
      const edge1 = await assocService.linkNodes(tenantId, "cust_a", "deal_x", "MEMORY_RELATES_TO", 1.0, "CRM", {
        whyLinked: "Customer accounts owned deals.",
        evidenceRefs: ["ev_crm_1"],
        strengthWeights: { importance: 0.9, confidence: 0.95 }
      });

      assert.ok(edge1.id);
      assert.ok(edge1.strengthDetail.calculatedStrength > 0.8);
      assert.equal(edge1.explainability.whyLinked, "Customer accounts owned deals.");

      await assocService.linkNodes(tenantId, "deal_x", "discount_pct", "MEMORY_SUPPORTS", 0.9, "Billing", {
        whyLinked: "Influences discount scale.",
        evidenceRefs: ["ev_bill_1"]
      });
      await assocService.linkNodes(tenantId, "discount_pct", "margin_pct", "MEMORY_CONTRADICTS", 0.8, "MarginCalc", {
        whyLinked: "Reduces margin percentage.",
        evidenceRefs: ["ev_margin_1"]
      });
      await assocService.linkNodes(tenantId, "margin_pct", "profit_amt", "MEMORY_SUPPORTS", 0.95, "Accounting", {
        whyLinked: "Higher margins increase profit.",
        evidenceRefs: ["ev_acc_1"]
      });
      await assocService.linkNodes(tenantId, "profit_amt", "cashflow_amt", "MEMORY_SUPPORTS", 0.9, "Accounting", {
        whyLinked: "Profit drives cashflow.",
        evidenceRefs: ["ev_acc_2"]
      });
      await assocService.linkNodes(tenantId, "cashflow_amt", "company_health", "MEMORY_SUPPORTS", 0.95, "RiskManagement", {
        whyLinked: "Strong cashflow keeps company healthy.",
        evidenceRefs: ["ev_risk_1"]
      });

      // Verify DELIVERABLE 8: Memory Path Discovery
      const pathResult = await assocService.findBestPath(tenantId, "cust_a", "company_health", 6);
      assert.ok(pathResult);
      assert.deepEqual(pathResult.path, ["cust_a", "deal_x", "discount_pct", "margin_pct", "profit_amt", "cashflow_amt", "company_health"]);
      assert.equal(pathResult.explainability.length, 7);

      // Verify DELIVERABLE 5: Cascading Impact Engine
      const impactResult = await assocService.getCascadingImpact(tenantId, "discount_pct", -0.2);
      assert.ok(impactResult.nodes.includes("company_health"));
      assert.ok(impactResult.impacts["company_health"] < 0); // Negative discount impact propagates down to negative company health

      // Verify DELIVERABLE 7: Community Detection
      const communities = await assocService.detectCommunities(tenantId);
      assert.ok(communities.has("METRIC"));
      assert.equal(communities.get("METRIC")?.includes("discount_pct"), true);

      // Verify DELIVERABLE 10: Graph Health Engine
      const healthStatus = await assocService.validateGraphHealth(tenantId);
      assert.equal(healthStatus.valid, true);
      assert.equal(healthStatus.brokenEdges.length, 0);

      // Verify Security: tenant boundary validation during traversals
      await assert.rejects(
        async () => {
          await assocService.findBestPath("different_tenant", "cust_a", "company_health");
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Semantic Memory: concept definition, ontology engine, context meaning, semantic conflict, evolution, clustering, and intent understanding",
    run: async () => {
      await ensureBootstrapped();
      const semService = container.resolve<ExecutiveSemanticMemoryService>("IExecutiveSemanticMemoryService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_semantic_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Semantic Ops");

      // Register concepts (Deliverable 4: Business Ontology Engine)
      const lead = await semService.addConcept(tenantId, exec.id, "Lead", "Sales", ["marketing", "inbound"]);
      const opp = await semService.addConcept(tenantId, exec.id, "Opportunity", "Sales", ["deal", "pipeline"]);
      const deal = await semService.addConcept(tenantId, exec.id, "Deal", "Sales", ["negotiation", "pipeline"]);
      const customer = await semService.addConcept(tenantId, exec.id, "Customer", "Sales", ["success", "account"]);

      assert.equal(lead.version, 1);
      assert.equal(opp.domain, "Sales");

      // Link concepts and measure distance (Deliverable 2 / 4)
      const rel1 = await semService.linkConcepts(tenantId, "concept_lead_sales", "concept_opportunity_sales", "HIERARCHY", 0.95, ["ev_crm_ont_1"]);
      assert.ok(rel1.similarityScore > 0);
      assert.equal(rel1.relationshipType, "HIERARCHY");

      // Deliverable 5: Context Meaning Engine (disambiguation)
      await semService.addConcept(tenantId, exec.id, "Pipeline", "Sales", ["leads", "opportunities"]);
      await semService.addConcept(tenantId, exec.id, "Pipeline", "Operations", ["cicd", "deployment", "github"]);

      const salesPipe = await semService.disambiguateConcept(tenantId, "Pipeline", "Sales");
      assert.ok(salesPipe);
      assert.equal(salesPipe.domain, "Sales");

      const opsPipe = await semService.disambiguateConcept(tenantId, "Pipeline", "Operations");
      assert.ok(opsPipe);
      assert.equal(opsPipe.domain, "Operations");

      // Deliverable 6: Semantic Conflict Engine ( contradictions detected & stored, never resolved )
      const conflict = await semService.detectSemanticConflict(tenantId, "concept_customer_sales", [
        { source: "Sales", value: "Customer Healthy" },
        { source: "Customer Success", value: "Customer High Churn Risk" }
      ]);
      assert.ok(conflict);
      assert.ok(conflict.explanation.includes("Contradicting observations"));

      // Deliverable 12: Semantic Confidence Engine
      const interpretation = await semService.interpretSemanticConfidence(tenantId, "concept_customer_sales");
      assert.ok(interpretation.confidence < 0.5); // Conflicting observation reduces confidence
      assert.ok(interpretation.ambiguity > 0.5); // Ambiguity is high

      // Deliverable 7: Concept Evolution Engine
      const evolved = await semService.evolveConcept(tenantId, "concept_lead_sales", "InboundLead", "Updated taxonomy standard");
      assert.equal(evolved.name, "InboundLead");
      assert.equal(evolved.version, 2);
      assert.ok(evolved.evolutionHistory.length > 1);

      // Deliverable 8: Semantic Clustering Engine
      const clusters = await semService.clusterConcepts(tenantId);
      assert.ok(clusters.has("Sales_cluster"));
      assert.ok(clusters.get("Sales_cluster")?.includes("concept_opportunity_sales"));

      // Deliverable 9: Intent Understanding Engine
      const matched = await semService.resolveIntent(tenantId, "Need more inbound leads");
      assert.ok(matched.includes("concept_lead_sales"));

      // Security validation (cross-tenant access to existing concept blocks execution)
      await assert.rejects(
        async () => {
          await semService.linkConcepts("different_tenant", "concept_lead_sales", "concept_opportunity_sales", "HIERARCHY", 0.95, []);
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Organizational Knowledge: extraction, cross-executive sharing, validation, dependencies, freshness decay, and isolation boundaries",
    run: async () => {
      await ensureBootstrapped();
      const orgService = container.resolve<ExecutiveOrganizationalKnowledgeService>("IExecutiveOrganizationalKnowledgeService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_org_knowledge_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Org Knowledge Ops");

      // Verify DELIVERABLE 5 & 7: Best Practice Intelligence and Validation
      // 1. Should fail validation if evidence count < 2
      await assert.rejects(
        async () => {
          await orgService.extractKnowledge(
            tenantId,
            "Unsupported practice",
            "This has too few evidence refs",
            "BEST_PRACTICE",
            ["CEO"],
            ["mem_1"], // Only 1 ref
            { explainability: "Should fail" }
          );
        },
        /Sufficient supporting evidence/
      );

      // 2. Extract validated practice (>= 2 memories)
      const obj1 = await orgService.extractKnowledge(
        tenantId,
        "Pricing Strategy Guidance",
        "Discounts above 20% impact profit margins negatively.",
        "BEST_PRACTICE",
        ["CEO", "CFO"],
        ["mem_pricing_1", "mem_pricing_2"],
        { explainability: "Empirical pricing history analysis" }
      );

      assert.equal(obj1.status, "VALIDATED");
      assert.equal(obj1.evidenceCount, 2);

      // Verify DELIVERABLE 3: Cross-Executive Sharing Engine
      const shared = await orgService.shareCrossExecutive(tenantId, obj1.id, "COO");
      assert.ok(shared.applicableRoles.includes("COO"));
      assert.equal(shared.version, 3); // Starts at 1, validation bump makes it 2, sharing bump makes it 3

      // Verify DELIVERABLE 8: Knowledge Dependency Engine
      const obj2 = await orgService.extractKnowledge(
        tenantId,
        "Sales Performance Guidance",
        "Sales velocity updates",
        "PATTERN",
        ["CEO"],
        ["mem_sales_1", "mem_sales_2"],
        { explainability: "Historical deal velocity analysis" }
      );

      const obj3 = await orgService.extractKnowledge(
        tenantId,
        "Revenue Flow Model",
        "Forecast metrics",
        "STANDARD_PROCEDURE",
        ["CFO"],
        ["mem_rev_1", "mem_rev_2"],
        { explainability: "Revenue flow mapping" }
      );

      // Link: obj1 -> obj2 -> obj3
      await orgService.linkDependencies(tenantId, obj1.id, obj2.id);
      await orgService.linkDependencies(tenantId, obj2.id, obj3.id);

      const chain = await orgService.getDependencyChain(tenantId, obj1.id);
      assert.deepEqual(chain, [obj1.id, obj2.id, obj3.id]);

      // Verify DELIVERABLE 9: Knowledge Freshness Engine
      // Decay over 180 days (6 intervals of 30 days = 0.6 decay -> freshness should be 0.4)
      await orgService.decayKnowledgeFreshness(tenantId, 180);
      const repo = container.resolve<any>("IExecutiveOrganizationalKnowledgeRepository");
      const decayed = await repo.findKnowledge(tenantId, obj1.id);
      assert.ok(decayed);
      assert.equal(decayed.freshnessScore, 0.4);

      // Decay over 210 days (drops freshness below 0.4 -> deprecated)
      await orgService.decayKnowledgeFreshness(tenantId, 210);
      const deprecated = await repo.findKnowledge(tenantId, obj1.id);
      assert.ok(deprecated);
      assert.equal(deprecated.status, "DEPRECATED");

      // Verify Security: tenant boundaries
      await assert.rejects(
        async () => {
          await orgService.shareCrossExecutive("different_tenant", obj1.id, "CEO");
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Memory Optimization: Hot/Warm/Cold tiers, duplicate detection, compression, retention cost analysis, and health reports",
    run: async () => {
      await ensureBootstrapped();
      const optService = container.resolve<ExecutiveMemoryOptimizationService>("IExecutiveMemoryOptimizationService");
      const memService = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_optimization_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Opt Ops");

      // Register two identical memories to trigger duplicate detection
      const mem1 = await memService.registerMemory(tenantId, "mem_opt_1", {
        category: "STRATEGIC",
        key: "system_reliability_metric",
        value: { uptime: 0.999 },
        source: "SystemMonitor",
      });

      const mem2 = await memService.registerMemory(tenantId, "mem_opt_2", {
        category: "STRATEGIC",
        key: "system_reliability_metric",
        value: { uptime: 0.999 },
        source: "SystemMonitor",
      });

      const mem3 = await memService.registerMemory(tenantId, "mem_opt_3", {
        category: "STRATEGIC",
        key: "different_metric_key",
        value: { metrics: 42 },
        source: "SystemMonitor",
      });

      // Verify DELIVERABLE 1 & 2: Optimization Engine & Tiering
      const record = await optService.optimizeMemory(tenantId, mem1.id);
      assert.ok(record.optimizationScore > 0);
      assert.equal(record.tier, "HOT"); // High score due to strategic relevance + default parameters
      assert.equal(record.retentionRecommendation, "STRENGTHEN");

      await optService.optimizeMemory(tenantId, mem3.id);

      // Verify DELIVERABLE 4: Duplicate Detection Engine
      const duplicates = await optService.scanForDuplicates(tenantId);
      assert.ok(duplicates.length > 0);
      const dupItem = duplicates[0];
      assert.equal(dupItem.type, "EXACT");
      assert.equal(dupItem.similarityScore, 1.0);

      // Verify DELIVERABLE 5: Memory Compression
      await optService.compressMemory(tenantId, mem1.id);

      // Verify DELIVERABLE 10: Optimization Health Engine
      const report = await optService.generateHealthReport(tenantId);
      assert.ok(report.overallMemoryHealth > 0);
      assert.ok(report.duplicateRatio > 0);

      // Verify DELIVERABLE 3: Retention Analysis list
      const list = await optService.analyzeMemoryRetention(tenantId);
      assert.ok(list.length > 0);

      // Verify Security: tenant boundary checks
      await assert.rejects(
        async () => {
          await optService.optimizeMemory("different_tenant", mem1.id);
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Memory Governance: scoring, access evaluation, compliance check, trust levels, risk reports, audit lineage, and tenant safety",
    run: async () => {
      await ensureBootstrapped();
      const govService = container.resolve<ExecutiveMemoryGovernanceService>("IExecutiveMemoryGovernanceService");
      const memService = container.resolve<ExecutiveMemoryService>("IExecutiveMemoryService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_governance_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Gov Ops");

      // Register test memory
      const mem = await memService.registerMemory(tenantId, exec.id, {
        category: "STRATEGIC",
        key: "confidential_acquisition_target",
        value: { target: "AlphaCorp", priceMultiplier: 1.4 },
        source: "StrategicBoard",
      });

      // Verify DELIVERABLE 1: Governance Engine & Metadata
      const record = await govService.governMemory(tenantId, mem.id, {
        owner: "CEO",
        custodian: "ComplianceLead",
        classification: "CONFIDENTIAL",
        purpose: "M&A Strategic alignment",
        businessCriticality: "CRITICAL",
        riskClassification: "HIGH",
      });

      assert.ok(record.governanceScore > 0.7);
      assert.equal(record.classification, "CONFIDENTIAL");

      // Verify DELIVERABLE 2 & 5: Access Governance & Policy Evaluation
      const access1 = await govService.evaluateAccess(tenantId, mem.id, "Analyst", "QUERY");
      assert.equal(access1.decision, "DENIED"); // Restricted due to confidentiality

      const access2 = await govService.evaluateAccess(tenantId, mem.id, "CEO", "QUERY");
      assert.equal(access2.decision, "GRANTED");

      // Verify DELIVERABLE 3: Compliance Intelligence Engine
      const compliance = await govService.checkCompliancePolicies(tenantId, mem.id);
      assert.ok(compliance.complianceValid); // Classification matches high risk classification

      // Verify DELIVERABLE 6: Trust Intelligence Engine
      const trust = await govService.calculateTrustScore(tenantId, mem.id);
      assert.ok(trust.trustLevel > 0.5);

      // Verify DELIVERABLE 7: Governance Risk Engine
      const risks = await govService.generateRiskReport(tenantId);
      assert.equal(risks.length, 0); // No violations

      // Verify DELIVERABLE 8: Lineage Engine
      const lineage = await govService.getMemoryLineage(tenantId, mem.id);
      assert.ok(lineage.length > 0);
      assert.equal(lineage[0].stage, "CREATION");

      // Verify DELIVERABLE 10: Governance Health Engine
      const health = await govService.generateHealthReport(tenantId);
      assert.ok(health.overallGovernanceHealth > 0);

      // Verify Security: tenant boundaries
      await assert.rejects(
        async () => {
          await govService.evaluateAccess("different_tenant", mem.id, "CEO", "QUERY");
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Memory Certification: self-validation, self-healing, scorecard benchmarks, and compatibility",
    run: async () => {
      await ensureBootstrapped();
      const certService = container.resolve<ExecutiveMemoryCertificationService>("IExecutiveMemoryCertificationService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_memory_certification_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Cert Ops");

      // Verify DELIVERABLE 1 & 7: Certification Report & Compatibility
      const cert = await certService.generateCertificationReport(tenantId);
      assert.ok(cert.isCertified);
      assert.ok(cert.overallScore > 0.9);
      assert.ok(cert.certifiedLayers.includes("3.3A_FOUNDATION"));

      // Verify DELIVERABLE 2 & 3: Self Validation & Self Healing
      const val = await certService.runSelfValidation(tenantId);
      assert.ok(val.validationPassed);
      assert.ok(val.logs.length > 0);

      // Verify DELIVERABLE 4, 6 & 10: Scorecard & Platform Quality
      const card = await certService.generateScorecard(tenantId);
      assert.ok(card.overallScore > 0.9);
      assert.equal(card.scores.security, 1.0);

      // Verify DELIVERABLE 5: Health Dashboard
      const health = await certService.generateHealthDashboard(tenantId);
      assert.ok(health.platformHealth > 0.9);

      // Verify Security: tenant boundaries
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "tenant_memory_certification_test", requestId: "req-1" },
            () => certService.generateCertificationReport("different_tenant")
          );
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Goal Intelligence: hierarchy, dynamic priority calculations, dependencies, KPI tracking, conflicts, packaging, and security limits",
    run: async () => {
      await ensureBootstrapped();
      const goalService = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_goal_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Goal Ops");

      // Verify DELIVERABLE 1, 4 & 5: Goal Hierarchy, KPI, and Priority calculation
      const teamGoal = await goalService.createGoal(tenantId, {
        title: "Scale Annual Revenue",
        description: "Grow operational revenue by 30%",
        ownerRole: "CEO",
        parentId: undefined,
        kpis: [{
          kpiId: "arr_kpi",
          name: "Annual Recurring Revenue",
          targetValue: 13000000,
          currentValue: 10000000,
          thresholds: { acceptable: 11000000 },
          successCondition: "GREATER_THAN_OR_EQUAL",
          failureCondition: "LESS_THAN",
          tolerance: 0.05,
          measurementFrequency: "monthly",
        }],
        priorityMetrics: {
          businessImpact: 0.9,
          urgency: 0.8,
          executiveImportance: 0.95,
          missionAlignment: 0.9,
          risk: 0.2,
          opportunity: 0.85,
          confidence: 0.9,
          customerImpact: 0.8,
          financialImpact: 0.9,
        },
      });

      assert.equal(teamGoal.status, "DRAFT");
      assert.ok(teamGoal.priorityScore > 0.8);

      const indGoal = await goalService.createGoal(tenantId, {
        title: "Scale Inbound Lead Pipeline",
        description: "Increase inbound signups",
        ownerRole: "COO",
        parentId: teamGoal.id, // Hierarchy: Team -> Individual
        kpis: [{
          kpiId: "lead_kpi",
          name: "Lead count",
          targetValue: 5000,
          currentValue: 3000,
          thresholds: { acceptable: 4500 },
          successCondition: "GREATER_THAN_OR_EQUAL",
          failureCondition: "LESS_THAN",
          tolerance: 0.1,
          measurementFrequency: "weekly",
        }],
        priorityMetrics: {
          businessImpact: 0.7,
          urgency: 0.75,
          executiveImportance: 0.8,
          missionAlignment: 0.8,
          risk: 0.3,
          opportunity: 0.7,
          confidence: 0.85,
          customerImpact: 0.7,
          financialImpact: 0.6,
        },
      });

      assert.equal(indGoal.parentId, teamGoal.id);

      // Verify DELIVERABLE 3 & 9: Dependency relations and Diffs/Updates
      await goalService.updateGoal(
        tenantId,
        indGoal.id,
        {
          status: "ACTIVE",
          relations: [{ targetGoalId: teamGoal.id, type: "supports" }],
        },
        "COO",
        "Activate goal and support main ARR goal"
      );

      const updatedGoal = await container.resolve<any>("IExecutiveGoalRepository").findById(tenantId, indGoal.id);
      assert.equal(updatedGoal.status, "ACTIVE");
      assert.equal(updatedGoal.version, 2);

      // Verify DELIVERABLE 10: Health Evaluation
      const health = await goalService.evaluateGoalHealth(tenantId, indGoal.id);
      assert.equal(health.progress, 0.6); // 3000 / 5000 = 0.6
      assert.equal(health.completionPrediction, "ON_TRACK");

      // Verify DELIVERABLE 11: Conflict Engine
      // Create conflicting goal with same KPI but different targets
      const conflictGoal = await goalService.createGoal(tenantId, {
        title: "Scale Inbound Lead Pipeline", // Duplicate title
        description: "Contradictory pipeline target",
        ownerRole: "COO",
        parentId: teamGoal.id,
        kpis: [{
          kpiId: "lead_kpi",
          name: "Lead count",
          targetValue: 8000, // Contradictory target
          currentValue: 3000,
          thresholds: { acceptable: 7500 },
          successCondition: "GREATER_THAN_OR_EQUAL",
          failureCondition: "LESS_THAN",
          tolerance: 0.1,
          measurementFrequency: "weekly",
        }],
        priorityMetrics: {
          businessImpact: 0.7,
          urgency: 0.75,
          executiveImportance: 0.8,
          missionAlignment: 0.8,
          risk: 0.3,
          opportunity: 0.7,
          confidence: 0.85,
          customerImpact: 0.7,
          financialImpact: 0.6,
        },
      });

      const conflicts = await goalService.detectConflicts(tenantId, conflictGoal.id);
      assert.ok(conflicts.length > 0);

      // Verify DELIVERABLE 12: Unified Planning Package
      const pkg = await goalService.generateGoalPackage(tenantId, exec.id);
      assert.ok(pkg.goals.length >= 3);

      // Verify Security: tenant boundaries
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-1" },
            () => goalService.createGoal("tenant_goal_test", { title: "Leaked Goal" })
          );
        },
        /Security Violation/
      );
    }
  },
  {
    name: "Executive Goal Intelligence Hardening: tradeoffs, success probability, assumptions, and outcome projections",
    run: async () => {
      await ensureBootstrapped();
      const goalService = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_goal_hardening_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Hardened Ops");

      // Create a revenue-focused goal
      const revGoal = await goalService.createGoal(tenantId, {
        title: "Maximize Sales Revenue Expansion",
        description: "Focus on ARR growth and customer acquisition",
        ownerRole: "CEO",
        kpis: [{
          kpiId: "sales_kpi",
          name: "Sales growth",
          targetValue: 100000,
          currentValue: 80000,
          thresholds: { acceptable: 90000 },
          successCondition: "GREATER_THAN_OR_EQUAL",
          failureCondition: "LESS_THAN",
          tolerance: 0.05,
          measurementFrequency: "monthly",
        }],
        priorityMetrics: {
          businessImpact: 0.9,
          urgency: 0.8,
          executiveImportance: 0.9,
          missionAlignment: 0.9,
          risk: 0.3,
          opportunity: 0.8,
          confidence: 0.9,
          customerImpact: 0.8,
          financialImpact: 0.9,
        },
      });

      // Create a cost/profit-focused goal
      const costGoal = await goalService.createGoal(tenantId, {
        title: "Minimize Operating Cost and Burn Rate",
        description: "Focus on bottom-line profit margins and EBITDA improvement",
        ownerRole: "COO",
        kpis: [{
          kpiId: "burn_kpi",
          name: "Monthly burn",
          targetValue: 50000,
          currentValue: 40000,
          thresholds: { acceptable: 45000 },
          successCondition: "LESS_THAN_OR_EQUAL",
          failureCondition: "GREATER_THAN",
          tolerance: 0.05,
          measurementFrequency: "monthly",
        }],
        priorityMetrics: {
          businessImpact: 0.8,
          urgency: 0.7,
          executiveImportance: 0.8,
          missionAlignment: 0.8,
          risk: 0.2,
          opportunity: 0.6,
          confidence: 0.85,
          customerImpact: 0.5,
          financialImpact: 0.8,
        },
      });

      // 1. Verify Trade-off Detection
      const tradeoffProfile = await goalService.getGoalTradeoffProfile(tenantId, revGoal.id);
      assert.equal(tradeoffProfile.goalId, revGoal.id);
      assert.equal(tradeoffProfile.tenantId, tenantId);
      assert.ok(tradeoffProfile.tradeoffs.length > 0, "Should detect at least one tradeoff (Revenue vs Profit / Growth vs Cost)");
      const revenueProfitTradeoff = tradeoffProfile.tradeoffs.find(t => t.dimension === "REVENUE_VS_PROFIT" || t.dimension === "GROWTH_VS_COST");
      assert.ok(revenueProfitTradeoff, "Should contain Revenue vs Profit or Growth vs Cost tradeoff");
      assert.equal(revenueProfitTradeoff!.primaryImpactDirection, revenueProfitTradeoff!.dimension === "REVENUE_VS_PROFIT" ? "POSITIVE" : "NEGATIVE");
      assert.ok(revenueProfitTradeoff!.weight > 0);
      assert.ok(revenueProfitTradeoff!.reason.length > 0);
      assert.ok(tradeoffProfile.explanation.includes("tradeoff"), "Explainability check: explanation must contain details");

      // 2. Verify Success Probability Calculation
      const successProb = await goalService.getGoalSuccessProbability(tenantId, revGoal.id);
      assert.equal(successProb.goalId, revGoal.id);
      assert.equal(successProb.tenantId, tenantId);
      assert.ok(successProb.probabilityScore > 0 && successProb.probabilityScore < 1.0);
      assert.ok(successProb.confidenceBand.lower <= successProb.probabilityScore);
      assert.ok(successProb.confidenceBand.upper >= successProb.probabilityScore);
      assert.ok(successProb.reasonCodes.length > 0);
      assert.ok(successProb.successDrivers.length > 0);
      assert.ok(successProb.explanation.includes("probability"), "Explainability check: explanation must detail probability score calculation");

      // 3. Verify Assumption Lifecycle & Report
      const assumption1 = await goalService.createAssumption(tenantId, {
        goalIds: [revGoal.id],
        description: "Market expansion rate remains stable at 15%",
        confidence: 0.85,
        evidence: ["Q1 market study"],
        owner: "CEO",
        status: "VALIDATED",
        impactIfBroken: "CRITICAL"
      });
      assert.equal(assumption1.status, "VALIDATED");

      const assumption2 = await goalService.createAssumption(tenantId, {
        goalIds: [revGoal.id],
        description: "New marketing channels don't experience ad fatigue",
        confidence: 0.7,
        evidence: [],
        owner: "COO",
        status: "UNKNOWN",
        impactIfBroken: "HIGH"
      });

      let report = await goalService.getGoalAssumptionReport(tenantId, revGoal.id);
      assert.equal(report.goalId, revGoal.id);
      assert.equal(report.stabilityScore, 1.0, "All validated or unknown assumptions mean stability remains high");
      assert.equal(report.invalidatedCount, 0);

      // Invalidate an assumption to simulate failure and check stability impact (without goal mutation)
      await goalService.updateAssumption(tenantId, assumption1.id, { status: "INVALIDATED" }, "CEO", "Ad platforms reporting high cost per click");
      
      report = await goalService.getGoalAssumptionReport(tenantId, revGoal.id);
      assert.equal(report.invalidatedCount, 1);
      assert.equal(report.criticalInvalidatedCount, 1);
      assert.ok(report.stabilityScore < 1.0, "Invalidating a critical assumption must reduce stability score");
      
      // Ensure the goal status or health has NOT been mutated (must remain draft)
      const nonMutatedGoal = await container.resolve<any>("IExecutiveGoalRepository").findById(tenantId, revGoal.id);
      assert.equal(nonMutatedGoal.status, "DRAFT");

      // 4. Verify Outcome Projection Generation
      const outcomeProj = await goalService.getGoalOutcomeProjection(tenantId, revGoal.id);
      assert.equal(outcomeProj.goalId, revGoal.id);
      assert.ok(outcomeProj.projectedOutcomes.length > 0);
      const revOutcome = outcomeProj.projectedOutcomes.find(o => o.category === "REVENUE");
      assert.ok(revOutcome);
      assert.ok(revOutcome!.positiveDirection.length > 0);
      assert.ok(revOutcome!.negativeDirection.length > 0);
      assert.ok(revOutcome!.confidence > 0);
      assert.ok(outcomeProj.explanation.includes("projection"), "Explainability check: explanation must detail projected outcomes");

      // 5. Verify Security (Prevent cross-tenant metadata access)
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-2" },
            () => goalService.getGoalTradeoffProfile(tenantId, revGoal.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-3" },
            () => goalService.getGoalSuccessProbability(tenantId, revGoal.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-4" },
            () => goalService.getGoalAssumptionReport(tenantId, revGoal.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-5" },
            () => goalService.getGoalOutcomeProjection(tenantId, revGoal.id)
          );
        },
        /Security Violation/
      );

      // 6. Performance & Scale verification
      const start = Date.now();
      const assRepo = container.resolve<IGoalAssumptionRepository>("IGoalAssumptionRepository");
      for (let i = 0; i < 1000; i++) {
        await assRepo.findById(tenantId, assumption1.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Strategy Intelligence Foundation: lifecycle, constraints, health, comparison matrix, dependencies, package generation, and security limits",
    run: async () => {
      await ensureBootstrapped();
      const strategyService = container.resolve<ExecutiveStrategyIntelligenceService>("IExecutiveStrategyIntelligenceService");
      const goalService = container.resolve<ExecutiveGoalIntelligenceService>("IExecutiveGoalIntelligenceService");
      const service = container.resolve<ExecutiveIdentityService>("IExecutiveIdentityService");

      const tenantId = "tenant_strategy_test";
      const exec = await service.createExecutive(tenantId, "CHIEF_OPERATIONS", "Strategy Ops");

      // Setup a Goal
      const targetGoal = await goalService.createGoal(tenantId, {
        title: "Optimize System Throughput",
        description: "Maximize processing speed and stability",
        ownerRole: "COO",
        priorityMetrics: {
          businessImpact: 0.8,
          urgency: 0.7,
          executiveImportance: 0.85,
          missionAlignment: 0.9,
          risk: 0.2,
          opportunity: 0.75,
          confidence: 0.9,
          customerImpact: 0.8,
          financialImpact: 0.7,
        },
      });

      // 1. Verify Strategy Generation & Strategic Constraint Engine (Section 6)
      const strat1 = await strategyService.createStrategy(tenantId, {
        goalId: targetGoal.id,
        title: "Migrate Queue Infrastructure to Redis Streams",
        description: "Use low latency memory transport",
        status: "DRAFT",
        constraints: {
          legal: ["Standard OSS licensing terms verified"],
          compliance: ["SOC2 data persistence requirements met"],
          financial: {
            budgetLimit: 15000,
            estimatedCost: 12000
          },
          operational: ["Requires 4 hours of off-peak deployment maintenance"],
          market: ["Industry standard transport model validation"]
        },
        health: {
          feasibility: 0.85,
          confidence: 0.8,
          alignment: 0.9,
          risk: 0.15,
          resourceReadiness: 0.9,
          opportunityStrength: 0.85,
          strategicStability: 1.0,
          explanation: "Pre-evaluation estimates"
        }
      });

      assert.equal(strat1.status, "DRAFT");
      assert.equal(strat1.constraints.legal![0], "Standard OSS licensing terms verified");
      assert.equal(strat1.constraints.financial!.budgetLimit, 15000);

      // Create a second competing strategy (over budget to verify health/feasibility degradation)
      const strat2 = await strategyService.createStrategy(tenantId, {
        goalId: targetGoal.id,
        title: "Migrate Queue Infrastructure to Managed SaaS Platform",
        description: "High licensing cost managed option",
        status: "DRAFT",
        constraints: {
          legal: ["Commercial SaaS Agreement required"],
          compliance: ["External SOC2 verification required"],
          financial: {
            budgetLimit: 15000,
            estimatedCost: 25000 // OVER BUDGET
          },
          operational: ["Instant deployment, no maintenance overhead"],
          market: []
        },
        health: {
          feasibility: 0.7,
          confidence: 0.6,
          alignment: 0.8,
          risk: 0.4,
          resourceReadiness: 0.5,
          opportunityStrength: 0.7,
          strategicStability: 1.0,
          explanation: "Managed SaaS alternative"
        }
      });

      // 2. Verify Strategy Health Engine (Section 10) & Lifecycle transitions (Section 11)
      const health1 = await strategyService.evaluateStrategyHealth(tenantId, strat1.id);
      assert.ok(health1.feasibility > 0.8, "Should have high feasibility as it is under budget");
      assert.equal(health1.explanation.toLowerCase().includes("feasibility"), true);

      // Check status transitioned to EVALUATED
      const evaluatedStrat1 = await strategyService.getStrategyById(tenantId, strat1.id);
      assert.equal(evaluatedStrat1!.status, "EVALUATED");

      const health2 = await strategyService.evaluateStrategyHealth(tenantId, strat2.id);
      assert.ok(health2.feasibility < 0.6, "Should degrade feasibility due to over-budget cost constraint");
      assert.equal(health2.resourceReadiness, 0.45);

      // 3. Verify Strategy stability degradation under failed assumptions
      const assumption = await goalService.createAssumption(tenantId, {
        goalIds: [targetGoal.id],
        description: "Redis instance hosting cost remains stable",
        status: "VALIDATED",
        impactIfBroken: "CRITICAL"
      });

      // Link strategy to assumption
      await strategyService.updateStrategy(tenantId, strat1.id, {
        associatedAssumptions: [assumption.id]
      }, "COO", "Link assumptions to verify strategy stability");

      // Invalidate assumption
      await goalService.updateAssumption(tenantId, assumption.id, { status: "INVALIDATED" }, "COO", "Redis pricing changes");

      // Re-evaluate health. Instability must degrade feasibility and strategicStability.
      const degradedHealth1 = await strategyService.evaluateStrategyHealth(tenantId, strat1.id);
      assert.ok(degradedHealth1.strategicStability < 1.0, "Strategic stability must degrade when linked assumption is invalidated");
      assert.ok(degradedHealth1.feasibility < health1.feasibility, "Feasibility must degrade under planning instability");

      // 4. Verify Strategy Lifecycle APPROVED & ARCHIVED transition
      await strategyService.updateStrategy(tenantId, strat1.id, { status: "APPROVED" }, "COO", "Approved by executive board");
      const approvedStrat = await strategyService.getStrategyById(tenantId, strat1.id);
      assert.equal(approvedStrat!.status, "APPROVED");

      // 5. Verify Comparison Engine & Matrix
      const matrix = await strategyService.compareStrategies(tenantId, [strat1.id, strat2.id]);
      assert.equal(matrix.comparedStrategyIds.length, 2);
      assert.equal(matrix.items[0].strategyId, strat1.id, "Redis migration strategy should rank 1st due to budget compliance");
      assert.ok(matrix.items[0].pros.length > 0);
      assert.ok(matrix.items[1].cons.length > 0);
      assert.ok(matrix.explanation.includes("ranks highest"));

      // 6. Verify Executive Strategy Package (Section 12)
      const stratPkg = await strategyService.generateStrategyPackage(tenantId, exec.id);
      assert.equal(stratPkg.packageType, "EXECUTIVE_STRATEGY_PACKAGE");
      assert.equal(stratPkg.executiveId, exec.id);
      assert.ok(stratPkg.goals.length > 0);
      assert.ok(stratPkg.strategies.length >= 2);
      assert.ok(stratPkg.comparisonMatrix);
      assert.ok(stratPkg.assumptions.length > 0);
      assert.ok(stratPkg.health.totalStrategies >= 2);
      assert.ok(stratPkg.explainability.includes("cumulative planning stability index"));

      // 7. Verify Dependencies graph
      await strategyService.updateStrategy(tenantId, strat2.id, {
        relations: [{ targetStrategyId: strat1.id, type: "requires" }]
      }, "COO", "Establish strategy dependency relation");

      const graph = await strategyService.getStrategyDependencyGraph(tenantId, strat2.id);
      assert.equal(graph.nodes.length, 2);
      assert.equal(graph.edges[0].from, strat2.id);
      assert.equal(graph.edges[0].to, strat1.id);
      assert.equal(graph.edges[0].type, "requires");

      // 7.5. Verify Stage 3.4B+ Engines (Mission Alignment, Diversity, Explainability, Quality)
      
      // Setup some DNA values on exec for alignment tests
      exec.dna = {
        role: "CHIEF_OPERATIONS",
        version: "1.0.0",
        mission: {
          vision: "Standard operations vision",
          directives: ["Queue", "Streams", "Redis"],
          alignmentTargets: ["Operational Efficiency"]
        },
        personalityModel: {
          traits: {
            riskTolerance: 0.3
          },
          decisionSpeed: 0.8,
          decisionStyle: "analytical",
          cognitiveBiasesToManage: []
        }
      } as any;
      const identityRepo = container.resolve<any>("IExecutiveRepository");
      await identityRepo.saveExecutive(exec, exec.version);

      // 1. Independent Mission Alignment Engine (Section 2)
      const alignmentReport = await strategyService.getStrategyMissionAlignment(tenantId, strat1.id);
      assert.equal(alignmentReport.strategyId, strat1.id);
      assert.ok(alignmentReport.alignmentScore > 0.8, "Should align well due to Mission Directives match and risk within tolerance");
      assert.ok(alignmentReport.reasonCodes.includes("DIRECTIVE_MATCH"));
      assert.ok(alignmentReport.reasonCodes.includes("RISK_WITHIN_APPETITE"));

      // For strat2 (which has high risk 0.4 > tolerance 0.3, and operational constraints causing delays)
      const alignmentReport2 = await strategyService.getStrategyMissionAlignment(tenantId, strat2.id);
      assert.ok(alignmentReport2.alignmentScore < 0.8, "Should drop alignment score due to risk violation and decision speed mismatch");
      assert.ok(alignmentReport2.misalignmentCauses.length > 0);

      // 2. Strategy Diversity Engine (Prevent variation of one idea)
      // Provide some technology and operational variations to strat1 and strat2
      await strategyService.updateStrategy(tenantId, strat1.id, {
        constraints: {
          ...strat1.constraints,
          technology: ["redis", "ioredis"],
          operational: ["off-peak maintenance"]
        },
        supportingMemories: ["mem123"]
      }, "COO", "Add tech constraints");

      await strategyService.updateStrategy(tenantId, strat2.id, {
        constraints: {
          ...strat2.constraints,
          technology: ["aws-sqs", "lambda"],
          operational: ["instant SaaS deployment"]
        }
      }, "COO", "Add SaaS tech constraints");

      const diversityReport = await strategyService.getStrategyDiversityReport(tenantId, targetGoal.id);
      assert.equal(diversityReport.comparedStrategyIds.length, 2);
      assert.ok(diversityReport.technologyDiversity > 0.7, "Should have high technology diversity since tech stacks are different");
      assert.ok(diversityReport.overallDiversityScore > 0.6, "Overall diversity should indicate non-variation patterns");

      // 3. Strategy Explainability Engine (Section 7)
      const explainReport = await strategyService.getStrategyExplainability(tenantId, strat1.id);
      assert.equal(explainReport.strategyId, strat1.id);
      assert.ok(explainReport.whyNotAnotherStrategy.includes("chosen due to its feasibility score"));
      assert.ok(explainReport.evidence.includes("mem123"));

      // 4. Strategy Quality Engine (Section 8)
      const qualityScore = await strategyService.evaluateStrategyQuality(tenantId, strat1.id);
      assert.equal(qualityScore.strategyId, strat1.id);
      assert.ok(qualityScore.overallQualityScore > 0.7);
      assert.ok(qualityScore.metrics.coverage > 0.5);
      assert.ok(qualityScore.metrics.portfolioDiversity > 0.5);
      assert.ok(qualityScore.metrics.explainability > 0.8);

      // 5. Opportunity Discovery Engine (Section 3)
      const opportunityMap = await strategyService.getStrategyOpportunityMap(tenantId, strat1.id);
      assert.equal(opportunityMap.strategyId, strat1.id);
      assert.ok(opportunityMap.opportunities.length > 0);
      assert.ok(opportunityMap.opportunities.some(o => o.opportunity.includes("Technology Leverage")));

      // 6. Capability Gap Engine (Section 4)
      const capabilityAssessment = await strategyService.assessStrategyCapabilities(tenantId, strat1.id);
      assert.equal(capabilityAssessment.strategyId, strat1.id);
      assert.ok(capabilityAssessment.overallReadiness >= 0.7);
      assert.ok(capabilityAssessment.recommendedCapabilityCategories.length > 0);

      // 7. Strategy Portfolio Engine (Section 5)
      const portfolioReport = await strategyService.generateStrategyPortfolios(tenantId, [strat1.id, strat2.id]);
      assert.equal(portfolioReport.portfolios.length, 6);
      const growthPortfolio = portfolioReport.portfolios.find(p => p.name === "Growth Portfolio");
      assert.ok(growthPortfolio);
      assert.ok(growthPortfolio!.strategyWeights[strat1.id] > 0);
      assert.ok(growthPortfolio!.resourceAllocation[strat1.id] > 0);
      assert.ok(growthPortfolio!.dependencyMap.length > 0);

      // Verify security limits for new methods
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-opp" },
            () => strategyService.getStrategyOpportunityMap(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-cap" },
            () => strategyService.assessStrategyCapabilities(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-port" },
            () => strategyService.generateStrategyPortfolios(tenantId, [strat1.id])
          );
        },
        /Security Violation/
      );
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-align" },
            () => strategyService.getStrategyMissionAlignment(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-div" },
            () => strategyService.getStrategyDiversityReport(tenantId, targetGoal.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-exp" },
            () => strategyService.getStrategyExplainability(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat-qual" },
            () => strategyService.evaluateStrategyQuality(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      // 8. Verify Security (Prevent cross-tenant strategy access)
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat1" },
            () => strategyService.getStrategyById(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat2" },
            () => strategyService.evaluateStrategyHealth(tenantId, strat1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat3" },
            () => strategyService.compareStrategies(tenantId, [strat1.id])
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-strat4" },
            () => strategyService.generateStrategyPackage(tenantId, exec.id)
          );
        },
        /Security Violation/
      );

      // 9. Performance & Scale verification
      const start = Date.now();
      const stratRepo = container.resolve<MemoryExecutiveStrategyRepository>("IExecutiveStrategyRepository");
      for (let i = 0; i < 1000; i++) {
        await stratRepo.findById(tenantId, strat1.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 strategy lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Planning Engine (Stage 3.4C): plan formulation, phase planning, task hierarchy, milestones, resource assignments, dependency resolution, execution order, completeness, quality, and security boundaries",
    run: async () => {
      await ensureBootstrapped();
      const strategyService = container.resolve<ExecutiveStrategyIntelligenceService>("IExecutiveStrategyIntelligenceService");
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");

      const tenantId = "tenant_planning_test";

      // 1. Create a Strategy as input
      const strategy = await strategyService.createStrategy(tenantId, {
        title: "Queue Migration Strategy",
        description: "Migrate infrastructure to Redis Streams"
      });

      // 2. Plan Creation (Section 2)
      const plan = await planningService.createPlan(tenantId, {
        strategyId: strategy.id,
        title: "Queue Migration Operations Plan",
        description: "Executing queue infrastructure updates safely"
      });
      assert.equal(plan.status, "DRAFT");
      assert.equal(plan.strategyId, strategy.id);

      // 3. Phase Planning (Section 3)
      const planWithPhase = await planningService.addPhase(tenantId, plan.id, {
        title: "Preparation Phase",
        sequenceNumber: 1,
        description: "Prepare environment configuration"
      });
      const phase1 = planWithPhase.phases[0];
      assert.equal(phase1.title, "Preparation Phase");
      assert.equal(phase1.sequenceNumber, 1);

      // Add a second phase
      const planWithPhase2 = await planningService.addPhase(tenantId, plan.id, {
        title: "Migration Phase",
        sequenceNumber: 2,
        description: "Perform infrastructure rollout"
      });
      const phase2 = planWithPhase2.phases[1];
      assert.equal(phase2.title, "Migration Phase");

      // 4. Task Decomposition & Resources (Section 4 & 6)
      const planWithTask1 = await planningService.addTask(tenantId, plan.id, phase1.id, {
        title: "Audit Current Queues",
        durationDays: 2,
        assignedResources: [
          { id: "res1", name: "Ops Lead", role: "Site Reliability Engineer", estimatedCost: 5000 }
        ]
      });
      const task1 = planWithTask1.phases[0].tasks[0];
      assert.equal(task1.title, "Audit Current Queues");
      assert.equal(task1.assignedResources[0].role, "Site Reliability Engineer");

      // Add task 2 (which requires task 1)
      const planWithTask2 = await planningService.addTask(tenantId, plan.id, phase2.id, {
        title: "Rollout Redis Streams",
        durationDays: 4,
        dependencies: [
          { targetId: task1.id, type: "requires" }
        ],
        assignedResources: [
          { id: "res2", name: "Database Admin", role: "DBA", estimatedCost: 8000 }
        ]
      });
      const task2 = planWithTask2.phases[1].tasks[0];
      assert.equal(task2.title, "Rollout Redis Streams");
      assert.equal(task2.dependencies[0].targetId, task1.id);

      // 5. Milestone Engine (Section 5)
      const planWithMilestone = await planningService.addMilestone(tenantId, plan.id, {
        title: "Redis Rolled Out",
        phaseId: phase2.id,
        taskId: task2.id,
        isReached: false
      });
      assert.equal(planWithMilestone.milestones[0].title, "Redis Rolled Out");

      // 6. Execution Order & Dependency Resolution (Section 7 & 8)
      const executionGraph = await planningService.resolveExecutionGraph(tenantId, plan.id);
      assert.ok(executionGraph.order.length >= 2);
      assert.equal(executionGraph.order[0], task1.id, "Audit task must come first in topological sort");
      assert.equal(executionGraph.order[1], task2.id, "Rollout task must come second in topological sort");

      // 7. Planning Completeness (Section 8)
      const completeness = await planningService.evaluateCompleteness(tenantId, plan.id);
      assert.equal(completeness.isComplete, true);
      assert.equal(completeness.missingPhases, false);
      assert.equal(completeness.missingMilestones, false);
      assert.equal(completeness.missingResources, false);

      // 8. Resource Planning Engine (Section 5)
      const resources = await planningService.calculateResourceRequirements(tenantId, plan.id);
      assert.equal(resources.budget, 13000); // 5000 + 8000
      assert.equal(resources.timeDays, 6);

      // 9. Dependency Resolution Engine (Section 7)
      const depGraph = await planningService.getPlanningDependencyGraph(tenantId, plan.id);
      assert.ok(depGraph.nodes.length >= 3);
      assert.ok(depGraph.edges.length >= 1);

      // 10. Plan Explainability Engine (Section 9)
      const explainability = await planningService.getPlanExplainability(tenantId, plan.id);
      assert.ok(explainability.whyExecutionOrderExists.length > 0);
      assert.ok(explainability.whyResourcesRequired.length > 0);

      // 11. Planning Quality (Section 10)
      const quality = await planningService.evaluatePlanningQuality(tenantId, plan.id);
      assert.ok(quality.overallQualityScore > 0.5);

      // 12. Security Isolation (Prevent cross-tenant planning access)
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-plan1" },
            () => planningService.getPlanById(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-plan2" },
            () => planningService.addPhase(tenantId, plan.id, { title: "Hacked Phase" })
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-plan3" },
            () => planningService.addTask(tenantId, plan.id, phase1.id, { title: "Hacked Task" })
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-plan4" },
            () => planningService.evaluatePlanningQuality(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      // 13. Performance O(1) repository lookups
      const start = Date.now();
      const planRepo = container.resolve<MemoryExecutivePlanningRepository>("IExecutivePlanningRepository");
      for (let i = 0; i < 1000; i++) {
        await planRepo.findById(tenantId, plan.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 plan lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Timeline & Scheduling Engine (Stage 3.4D): critical path method, slack float, parallel grouping, business calendar shifts, deadline breaches, dynamic rescheduling simulation, explainability, health auditing, and isolation boundaries",
    run: async () => {
      await ensureBootstrapped();
      const strategyService = container.resolve<ExecutiveStrategyIntelligenceService>("IExecutiveStrategyIntelligenceService");
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const timelineService = container.resolve<ExecutiveTimelineService>("IExecutiveTimelineService");

      const tenantId = "tenant_timeline_test";

      // 1. Create Strategy & Plan as inputs
      const strategy = await strategyService.createStrategy(tenantId, {
        title: "Database Relocation",
        description: "Move server pools to primary datacenter"
      });

      const plan = await planningService.createPlan(tenantId, {
        strategyId: strategy.id,
        title: "Relocation Schedule Plan",
        description: "Timeline planning tasks"
      });

      // Add a Phase
      await planningService.addPhase(tenantId, plan.id, {
        id: "ph1",
        title: "Primary Relocation",
        sequenceNumber: 1
      });

      // Add Tasks with dependency paths
      await planningService.addTask(tenantId, plan.id, "ph1", {
        id: "t_audit",
        title: "Audit Servers",
        durationDays: 2,
        assignedResources: [{ id: "res1", name: "SRE", role: "Engineer", estimatedCost: 2000 }]
      });

      await planningService.addTask(tenantId, plan.id, "ph1", {
        id: "t_config",
        title: "Configure Infrastructure",
        durationDays: 3,
        dependencies: [{ targetId: "t_audit", type: "requires" }],
        assignedResources: [{ id: "res2", name: "NetOps", role: "Engineer", estimatedCost: 3000 }]
      });

      await planningService.addTask(tenantId, plan.id, "ph1", {
        id: "t_backup",
        title: "Setup Backup System",
        durationDays: 1,
        dependencies: [{ targetId: "t_audit", type: "requires" }],
        assignedResources: [{ id: "res3", name: "Backup Bot", role: "AI Agent", estimatedCost: 1000 }]
      });

      // Add a Milestone
      await planningService.addMilestone(tenantId, plan.id, {
        id: "m_complete",
        title: "Relocation Target Achieved",
        phaseId: "ph1",
        taskId: "t_config"
      });

      // 2. Timeline Generation (Section 2)
      const timeline = await timelineService.generateTimeline(tenantId, plan.id, "2026-06-01T00:00:00.000Z");
      assert.equal(timeline.planId, plan.id);

      // Verify Business Calendar Engine (Section 7)
      const auditNode = timeline.nodes.find(n => n.id === "t_audit");
      const configNode = timeline.nodes.find(n => n.id === "t_config");
      const backupNode = timeline.nodes.find(n => n.id === "t_backup");

      assert.ok(auditNode);
      assert.ok(configNode);
      assert.ok(backupNode);

      assert.equal(auditNode!.earlyStart, "2026-06-01T00:00:00.000Z");
      assert.equal(auditNode!.earlyFinish, "2026-06-03T00:00:00.000Z");

      assert.equal(configNode!.earlyStart, "2026-06-03T00:00:00.000Z");
      assert.equal(configNode!.earlyFinish, "2026-06-08T00:00:00.000Z"); // Skip weekend!

      // 3. Slack & Float Engine (Section 4)
      assert.ok(backupNode!.slackDays > 0);
      assert.equal(configNode!.slackDays, 0);

      // 4. Critical Path Engine (Section 3)
      assert.ok(timeline.criticalPath.includes("t_audit"));
      assert.ok(timeline.criticalPath.includes("t_config"));
      assert.ok(!timeline.criticalPath.includes("t_backup"));

      // 5. Dynamic Rescheduling (Section 8)
      const analysis = await timelineService.analyzeRescheduling(tenantId, plan.id, "t_audit", 3);
      assert.equal(analysis.planId, plan.id);
      assert.equal(analysis.delayedTaskId, "t_audit");
      assert.equal(analysis.delayDays, 3);
      assert.ok(analysis.affectedTasks.length >= 2);
      assert.ok(analysis.scheduleDriftDays >= 3);
      assert.ok(analysis.newCompletionDate !== timeline.projectEndDate);

      // Verify original timeline is unmodified
      const originalTimeline = await timelineService.getTimelineByPlanId(tenantId, plan.id);
      assert.equal(originalTimeline!.projectEndDate, timeline.projectEndDate);

      // 6. Timeline Health Engine (Section 9)
      const health = await timelineService.evaluateTimelineHealth(tenantId, plan.id);
      assert.ok(health.timelineRealism > 0.5);
      assert.equal(health.deadlineRisk, "LOW");

      // 7. Timeline Explainability Engine (Section 10)
      const explainability = await timelineService.getTimelineExplainability(tenantId, plan.id);
      assert.ok(explainability.whyThisDeadline.includes("longest path"));
      assert.ok(explainability.nodeExplanations["t_config"].whyThisDate.includes("predecessor"));

      // 8. Schedule Quality Engine (Section 11)
      const quality = await timelineService.evaluateScheduleQuality(tenantId, plan.id);
      assert.ok(quality.timelineQuality > 0.5);

      // 9. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-time1" },
            () => timelineService.getTimelineByPlanId(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-time2" },
            () => timelineService.analyzeRescheduling(tenantId, plan.id, "t_audit", 2)
          );
        },
        /Security Violation/
      );

      // 10. Performance O(1) repository lookups
      const start = Date.now();
      const timelineRepo = container.resolve<MemoryExecutiveTimelineRepository>("IExecutiveTimelineRepository");
      for (let i = 0; i < 1000; i++) {
        await timelineRepo.findByPlanId(tenantId, plan.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 timeline lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Scenario Planning Engine (Stage 3.4E): scenario generation, what-if simulation, comparison risk ranking, early warnings, explainability, health, and security boundaries",
    run: async () => {
      await ensureBootstrapped();
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const scenarioService = container.resolve<ExecutiveScenarioService>("IExecutiveScenarioService");

      const tenantId = "tenant_scenario_test";

      // 1. Create a Plan as parent reference
      const plan = await planningService.createPlan(tenantId, {
        title: "Relocation Target Plan",
        description: "Parent plan for scenario testing"
      });

      // 2. Scenario Generation (Section 2)
      const scenarioBase = await scenarioService.generateBusinessScenarios(tenantId, plan.id, {
        title: "Normal Growth Case",
        description: "Standard business operating plan",
        variables: { costMultiplier: 1.0, delayDays: 0 }
      });
      assert.equal(scenarioBase.planId, plan.id);
      assert.equal(scenarioBase.status, "DRAFT");

      // 3. What-if Simulation & Business Impact (Section 3 & 4 & 5)
      const scenarioSim = await scenarioService.simulateWhatIf(tenantId, plan.id, {
        costMultiplier: 1.5,
        delayDays: 5,
        churnRate: 0.1
      });
      assert.ok(scenarioSim.impactMetrics.revenueImpact < 0);
      assert.equal(scenarioSim.impactMetrics.timelineImpactDays, 5);
      assert.ok(scenarioSim.impactMetrics.operationalRiskScore > 0.1);

      // 4. Scenario Comparison (Section 6)
      const comparison = await scenarioService.compareScenarios(tenantId, scenarioBase.id, [scenarioSim.id]);
      assert.equal(comparison.optimalScenarioId, scenarioBase.id);
      assert.ok(comparison.recommendation.includes(scenarioBase.id));

      // 5. Early Warning Generation (Section 8)
      const warningsReport = await scenarioService.generateEarlyWarningReport(tenantId, plan.id);
      assert.equal(warningsReport.planId, plan.id);
      assert.ok(warningsReport.warnings.length >= 2);
      assert.ok(warningsReport.warnings.some(w => w.type === "churn_increase"));
      assert.ok(warningsReport.warnings.every(w => w.probability > 0));

      // 6. Explainability trace (Section 9)
      const explainability = await scenarioService.getScenarioExplainability(tenantId, scenarioSim.id);
      assert.ok(explainability.whyScenarioExists.length > 0);
      assert.ok(explainability.whyImpactsCalculated.length > 0);

      // 7. Scenario Quality Evaluation (Section 10)
      const quality = await scenarioService.evaluateScenarioQuality(tenantId, scenarioSim.id);
      assert.ok(quality.overallScenarioQuality > 0.5);

      // 8. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-scen1" },
            () => scenarioService.getScenarioExplainability(tenantId, scenarioSim.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-scen2" },
            () => scenarioService.simulateWhatIf(tenantId, plan.id, { churnRate: 0.2 })
          );
        },
        /Security Violation/
      );

      // 9. Performance O(1) repository lookups
      const start = Date.now();
      const scenarioRepo = container.resolve<MemoryExecutiveScenarioRepository>("IExecutiveScenarioRepository");
      for (let i = 0; i < 1000; i++) {
        await scenarioRepo.findById(tenantId, scenarioBase.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 scenario lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Planning Optimization Engine (Stage 3.4F): plan optimization, resource and cost optimization, execution readiness, explainability, quality, and tenant security",
    run: async () => {
      await ensureBootstrapped();
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const optService = container.resolve<ExecutivePlanningOptimizationService>("IExecutivePlanningOptimizationService");

      const tenantId = "tenant_opt_test";

      // 1. Create a base Plan with a phase & task to ensure readiness
      const plan = await planningService.createPlan(tenantId, {
        title: "Relocation Strategy Plan",
        description: "Parent plan for optimization testing"
      });

      await planningService.addPhase(tenantId, plan.id, {
        id: "ph1",
        title: "Primary Setup",
        sequenceNumber: 1
      });

      await planningService.addTask(tenantId, plan.id, "ph1", {
        id: "t_setup",
        title: "Setup Node Connections",
        durationDays: 3
      });

      // 2. Plan Optimization (Section 2)
      const opt = await optService.optimizePlan(tenantId, plan.id);
      assert.equal(opt.planId, plan.id);
      assert.ok(opt.costSavings > 0);

      // 3. Resource Optimization (Section 3)
      const resourceOpt = await optService.optimizeResources(tenantId, plan.id);
      assert.equal(resourceOpt.resourceAllocationEfficiency, 0.98);

      // 4. Cost Optimization (Section 4)
      const costOpt = await optService.optimizeCosts(tenantId, plan.id);
      assert.equal(costOpt.costSavings, 4000);

      // 5. Execution Readiness (Section 8)
      const readiness = await optService.evaluateExecutionReadiness(tenantId, plan.id);
      assert.equal(readiness.planId, plan.id);
      assert.equal(readiness.isReady, true);
      assert.ok(readiness.readinessScore > 0.8);

      // 6. Optimization Explainability (Section 10)
      const explain = await optService.getOptimizationExplainability(tenantId, plan.id);
      assert.ok(explain.whyCostIsHigh.includes("SRE"));
      assert.ok(explain.whyOpportunitiesWereDetected.includes("Redis"));

      // 7. Planning Quality Evaluation (Section 11)
      const quality = await optService.evaluatePlanningQuality(tenantId, plan.id);
      assert.ok(quality.overallPlanningQuality > 0.8);

      // 8. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-opt1" },
            () => optService.evaluateExecutionReadiness(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-opt2" },
            () => optService.optimizePlan(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      // 9. Performance O(1) repository lookups
      const start = Date.now();
      const optRepo = container.resolve<MemoryExecutivePlanningOptimizationRepository>("IExecutivePlanningOptimizationRepository");
      for (let i = 0; i < 1000; i++) {
        await optRepo.findByPlanId(tenantId, plan.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 planning optimization lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Risk & Contingency Engine (Stage 3.4G): risk detection, classification, root cause, propagation, compound risks, contingency planning, explainability, health, quality, and isolation boundaries",
    run: async () => {
      await ensureBootstrapped();
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const riskService = container.resolve<ExecutiveRiskService>("IExecutiveRiskService");

      const tenantId = "tenant_risk_test";

      // 1. Create a Plan with phase & task as base
      const plan = await planningService.createPlan(tenantId, {
        title: "Database Migration Plan",
        description: "Parent plan for risk testing"
      });

      await planningService.addPhase(tenantId, plan.id, {
        id: "ph1",
        title: "Core Migration Setup",
        sequenceNumber: 1
      });

      await planningService.addTask(tenantId, plan.id, "ph1", {
        id: "t_config",
        title: "Configure Database",
        durationDays: 4
      });

      // 2. Risk Detection & Classification (Section 2 & 3 & 4)
      const risks = await riskService.detectRisks(tenantId, plan.id);
      assert.ok(risks.length >= 2);
      const timelineRisk = risks.find(r => r.category === "TIMELINE");
      const resourceRisk = risks.find(r => r.category === "RESOURCE");

      assert.ok(timelineRisk);
      assert.ok(resourceRisk);
      assert.equal(timelineRisk.severity, "HIGH");
      assert.ok(timelineRisk.rootCause.length > 0);

      // 3. Contingency Planning (Section 6)
      const contingency = await riskService.generateContingencyPlan(tenantId, timelineRisk.id, {
        triggerCondition: "Delay exceeds 5 working days.",
        mitigationSteps: ["Assign netops contractor."]
      });
      assert.equal(contingency.riskId, timelineRisk.id);
      assert.equal(contingency.status, "APPROVED");

      // 4. Risk Propagation Graph (Section 5 & 7)
      const propGraph = await riskService.getRiskPropagationGraph(tenantId, plan.id);
      assert.ok(propGraph.nodes.length >= 2);
      assert.ok(propGraph.edges.length >= 1);
      assert.equal(propGraph.edges[0].sourceId, timelineRisk.id);
      assert.equal(propGraph.edges[0].targetId, resourceRisk.id);

      // 5. Risk Health Auditing (Section 10)
      const health = await riskService.evaluateRiskHealth(tenantId, plan.id);
      assert.ok(health.overallRiskIndex > 0.1);
      assert.ok(health.compoundRiskScore > 1.0);

      // 6. Risk Quality Evaluation (Section 11)
      const quality = await riskService.evaluateRiskQuality(tenantId, plan.id);
      assert.ok(quality.riskQualityScore > 0.5);

      // 7. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-risk1" },
            () => riskService.evaluateRiskHealth(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-risk2" },
            () => riskService.generateContingencyPlan(tenantId, timelineRisk.id, {})
          );
        },
        /Security Violation/
      );

      // 8. Performance O(1) repository lookups
      const start = Date.now();
      const riskRepo = container.resolve<MemoryExecutiveRiskRepository>("IExecutiveRiskRepository");
      for (let i = 0; i < 1000; i++) {
        await riskRepo.findRiskById(tenantId, timelineRisk.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 risk lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Resource & Capacity Management Engine (Stage 3.4H): inventory management, capacity tracking, task allocation, conflict detection, capability matching, health auditing, quality evaluation, and isolation checks",
    run: async () => {
      await ensureBootstrapped();
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const resourceService = container.resolve<ExecutiveResourceService>("IExecutiveResourceService");

      const tenantId = "tenant_resource_test";

      // 1. Create a Plan base
      const plan = await planningService.createPlan(tenantId, {
        title: "Staffing Strategy Plan",
        description: "Parent plan for resource capacity testing"
      });

      // 2. Resource Inventory & Capability Matching (Section 2)
      const res1 = await resourceService.addResourceToInventory(tenantId, {
        name: "Primary SRE",
        type: "HUMAN",
        capabilities: ["Kubernetes", "PostgreSQL"],
        capacityHoursPerWeek: 40,
        costPerHour: 80
      });
      assert.equal(res1.name, "Primary SRE");
      assert.ok(res1.capabilities.includes("Kubernetes"));

      // 3. Resource Allocation & Capacity Tracking (Section 3)
      const alloc1 = await resourceService.allocateResourceToTask(tenantId, plan.id, {
        resourceId: res1.id,
        taskId: "t_setup",
        allocatedHours: 25
      });
      assert.equal(alloc1.resourceId, res1.id);
      assert.equal(alloc1.allocatedHours, 25);

      const alloc2 = await resourceService.allocateResourceToTask(tenantId, plan.id, {
        resourceId: res1.id,
        taskId: "t_config",
        allocatedHours: 20
      });
      assert.equal(alloc2.allocatedHours, 20);

      // 4. Conflict Detection & Balancing (Section 5)
      const conflicts = await resourceService.detectResourceConflicts(tenantId, plan.id);
      assert.ok(conflicts.length >= 1);
      assert.equal(conflicts[0].resourceId, res1.id);
      assert.equal(conflicts[0].severity, "HIGH");

      // 5. Resource Health Auditing (Section 10)
      const health = await resourceService.evaluateResourceHealth(tenantId, plan.id);
      assert.ok(health.overallUtilizationRate > 0.5);
      assert.equal(health.conflictCount, 1);
      assert.equal(health.status, "WARNING");

      // 6. Resource Quality Evaluation (Section 11)
      const quality = await resourceService.evaluateResourceQuality(tenantId, plan.id);
      assert.ok(quality.overallQualityScore > 0.8);

      // 7. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-res1" },
            () => resourceService.evaluateResourceHealth(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-res2" },
            () => resourceService.allocateResourceToTask(tenantId, plan.id, {})
          );
        },
        /Security Violation/
      );

      // 8. Performance O(1) repository lookups
      const start = Date.now();
      const resRepo = container.resolve<MemoryExecutiveResourceRepository>("IExecutiveResourceRepository");
      for (let i = 0; i < 1000; i++) {
        await resRepo.findResourceById(tenantId, res1.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 resource lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Planning Governance & Compliance Engine (Stage 3.4I): governance checks, policy validation, compliance reporting, audit trailing, lineage auditing, explainability, health auditing, quality metrics, certification readiness, and isolation boundaries",
    run: async () => {
      await ensureBootstrapped();
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const govService = container.resolve<ExecutivePlanningGovernanceService>("IExecutivePlanningGovernanceService");

      const tenantId = "tenant_gov_test";

      // 1. Create a Plan base with loaded phase & task
      const plan = await planningService.createPlan(tenantId, {
        title: "Compliance Strategy Plan",
        description: "Parent plan for governance testing"
      });

      await planningService.addPhase(tenantId, plan.id, {
        id: "ph1",
        title: "Validation Phase",
        sequenceNumber: 1
      });

      await planningService.addTask(tenantId, plan.id, "ph1", {
        id: "t_validate",
        title: "Verify Certificates",
        durationDays: 2
      });

      // 2. Policy Validation (Section 3)
      const validation = await govService.validatePlanningPolicies(tenantId, plan.id);
      assert.equal(validation.planId, plan.id);
      assert.equal(validation.isValid, true);

      // 3. Compliance Engine & Approval Readiness (Section 4 & 5)
      const compliance = await govService.generateComplianceReport(tenantId, plan.id);
      assert.equal(compliance.isCompliant, true);
      assert.equal(compliance.complianceScore, 1.0);

      // 4. Audit Engine & Lineage (Section 6 & 7)
      const audit = await govService.generateAuditReport(tenantId, plan.id);
      assert.ok(audit.auditTrail.length >= 1);
      assert.ok(audit.auditTrail.some(a => a.action === "POLICY_VALIDATION"));

      // 5. Certification Readiness (Section 11)
      const certification = await govService.generateCertificationReport(tenantId, plan.id, "exec_chief_operations");
      assert.equal(certification.isCertified, true);
      assert.equal(certification.certifiedBy, "exec_chief_operations");

      // 6. Governance Health Auditing (Section 9)
      const health = await govService.evaluateGovernanceHealth(tenantId, plan.id);
      assert.equal(health.healthIndex, 1.0);
      assert.equal(health.status, "STABLE");

      // 7. Governance Quality Evaluation (Section 10)
      const quality = await govService.evaluateGovernanceQuality(tenantId, plan.id);
      assert.ok(quality.qualityScore > 0.8);

      // 8. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-gov1" },
            () => govService.evaluateGovernanceHealth(tenantId, plan.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-gov2" },
            () => govService.generateCertificationReport(tenantId, plan.id, "unauthorized_actor")
          );
        },
        /Security Violation/
      );

      // 9. Performance O(1) repository lookups
      const start = Date.now();
      const govRepo = container.resolve<MemoryExecutivePlanningGovernanceRepository>("IExecutivePlanningGovernanceRepository");
      for (let i = 0; i < 1000; i++) {
        await govRepo.findValidationByPlanId(tenantId, plan.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 governance lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Planning Hardening & Sandbox Security Engine (Stage 3.4J): audit tampering check, lineage tampering verification, privilege escalation rejection, contract validation, hardening reports, and isolation checks",
    run: async () => {
      await ensureBootstrapped();
      const planningService = container.resolve<ExecutivePlanningService>("IExecutivePlanningService");
      const hardService = container.resolve<ExecutivePlanningHardeningService>("IExecutivePlanningHardeningService");

      const tenantId = "tenant_hard_test";

      // 1. Create a Plan base
      const plan = await planningService.createPlan(tenantId, {
        title: "Hardened Plan",
        description: "Parent plan for hardening checks"
      });

      // 2. Audit & Lineage Tampering checks
      const hasTampering = await hardService.auditTamperingCheck(tenantId, plan.id);
      assert.equal(hasTampering, false);

      const lineageTampering = await hardService.lineageTamperingCheck(tenantId, plan.id);
      assert.equal(lineageTampering, false);

      // 3. Privilege Escalation rejection (fails safely)
      await assert.rejects(
        () => hardService.verifyPrivilegeEscalation(tenantId, "hacker_actor", "sys_admin"),
        /Security Violation/
      );

      // 4. Contract Bypass detection (fails safely)
      await assert.rejects(
        () => hardService.verifyContractCompliance(tenantId, plan.id, null),
        /Security Violation/
      );

      // 5. Generate Hardening Report on a clean plan with no violations
      const cleanPlan = await planningService.createPlan(tenantId, {
        title: "Clean Hardened Plan",
        description: "Parent plan for clean hardening report"
      });
      const report = await hardService.generateHardeningReport(tenantId, cleanPlan.id);
      assert.equal(report.isHardened, true);
      assert.equal(report.hardeningScore, 1.0);

      // 6. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-hard1" },
            () => hardService.generateHardeningReport(tenantId, cleanPlan.id)
          );
        },
        /Security Violation/
      );

      // 7. Performance O(1) repository lookups
      const start = Date.now();
      const hardRepo = container.resolve<MemoryExecutivePlanningHardeningRepository>("IExecutivePlanningHardeningRepository");
      for (let i = 0; i < 1000; i++) {
        await hardRepo.getViolationsByPlanId(tenantId, plan.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 hardening lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Decision Intelligence Engine (Stage 3.5A+): decision creation, status updates, classification, ownership, assumptions validation, stability checks, readiness evaluations, context integrity, immutable snapshots, history versions, performance, and isolation boundaries",
    run: async () => {
      await ensureBootstrapped();
      const decisionService = container.resolve<ExecutiveDecisionIntelligenceService>("IExecutiveDecisionIntelligenceService");

      const tenantId = "tenant_decision_test";

      // 1. Create decision with Ownership & Assumptions (Section 4 & 5)
      const dec1 = await decisionService.createDecision(tenantId, {
        title: "Hire Lead Developer",
        description: "Hire a Lead Dev to resolve engineering delay bottlenecks",
        status: "DRAFT",
        type: "Hiring",
        plans: ["plan_eng_1"],
        goals: ["goal_speed_1"],
        ownership: {
          owner: "exec_chief_operations",
          reviewer: "exec_cto",
          approver: "exec_ceo",
          stakeholders: ["exec_cfo"],
          responsibleExecutive: "exec_cto",
          delegatedExecutive: "exec_engineering_manager",
          escalationOwner: "exec_ceo"
        },
        assumptions: [
          {
            text: "Candidate accepts initial offer range.",
            confidence: 0.9,
            evidence: "Market average survey",
            owner: "exec_hr",
            criticality: "HIGH",
            validationStatus: "VALIDATED"
          }
        ],
        metadata: { costImpact: 8500, timelineImpactDays: -15 }
      });
      assert.equal(dec1.ownership.reviewer, "exec_cto");
      assert.equal(dec1.assumptions[0].validationStatus, "VALIDATED");

      // 2. Lifecycle transitions, version tracking, and history version lookup
      const updatedDec = await decisionService.updateDecision(tenantId, dec1.id, {
        status: "APPROVED",
        actorId: "exec_chief_operations",
        assumptions: [
          {
            text: "Candidate accepts initial offer range.",
            confidence: 0.9,
            evidence: "Market average survey",
            owner: "exec_hr",
            criticality: "HIGH",
            validationStatus: "BROKEN" // Invalidate assumption (Section 5)
          }
        ]
      });
      assert.equal(updatedDec.status, "APPROVED");
      assert.equal(updatedDec.version, 2);

      // Verify validationStatus change did NOT mutate core decision status, only stability
      assert.equal(updatedDec.assumptions[0].validationStatus, "BROKEN");

      const decRepo = container.resolve<MemoryExecutiveDecisionRepository>("IExecutiveDecisionRepository");
      const decV1 = await decRepo.findDecisionVersion(tenantId, dec1.id, 1);
      assert.ok(decV1);
      assert.equal(decV1.status, "DRAFT");
      assert.equal(decV1.assumptions[0].validationStatus, "VALIDATED");

      // 3. Immutable Snapshot check (Section 13)
      const snapshot = await decisionService.createDecisionSnapshot(tenantId, dec1.id);
      assert.equal(snapshot.version, 2);

      // Mutate original decision
      await decisionService.updateDecision(tenantId, dec1.id, { title: "Title Mutated" });
      const snapCheck = await decRepo.getSnapshot(tenantId, dec1.id);
      assert.ok(snapCheck);
      assert.equal(snapCheck.title, "Hire Lead Developer"); // Verify snapshot did not change (No shared references)

      // 4. Decision Stability Engine (Section 6)
      const stability = await decisionService.evaluateDecisionStability(tenantId, dec1.id);
      assert.equal(stability, "WARNING"); // Broken assumption reduces stability

      // 5. Decision Readiness Engine (Section 7)
      const readiness = await decisionService.evaluateDecisionReadiness(tenantId, dec1.id);
      assert.ok(readiness >= 0.8);

      // 6. Decision Context Integrity Engine (Section 8)
      const integrity = await decisionService.evaluateContextIntegrity(tenantId, dec1.id);
      assert.equal(integrity, 1.0);

      // 7. Decision Explainability Hardening (Section 9)
      const explanation = await decisionService.explainDecision(tenantId, dec1.id);
      assert.equal(explanation.decisionId, dec1.id);
      assert.equal(explanation.whyNotAnother, "Alternative fallbacks did not satisfy budget constraints.");
      assert.ok(explanation.whichAssumptions.includes("Candidate accepts initial offer range."));

      // 7.5 Derived Decisions Graph Traversal & Cycle Detection (Phase 16)
      const dec3 = await decisionService.createDecision(tenantId, {
        title: "Provision Backup Instance",
        description: "Standby database server context",
        status: "DRAFT",
        type: "Engineering"
      });
      await decisionService.linkDecisions(tenantId, dec1.id, dec3.id, "TRIGGERS");

      // Transitive graph traversal
      const traverseRes = await decisionService.traverseDecisionGraph(tenantId, dec1.id);
      assert.equal(traverseRes.hasCycle, false);
      assert.ok(traverseRes.nodes.some(n => n.decisionId === dec3.id));

      // Link dec3 back to dec1 to form a circular relation graph
      await decisionService.linkDecisions(tenantId, dec3.id, dec1.id, "DEPENDS_ON");
      const traverseResCycle = await decisionService.traverseDecisionGraph(tenantId, dec1.id);
      assert.equal(traverseResCycle.hasCycle, true);

      // 8. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-dec1" },
            () => decisionService.explainDecision(tenantId, dec1.id)
          );
        },
        /Security Violation/
      );

      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-dec2" },
            () => decisionService.updateDecision(tenantId, dec1.id, { status: "EXECUTED" })
          );
        },
        /Security Violation/
      );

      // 9. Performance O(1) repository lookups
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await decRepo.findDecisionById(tenantId, dec1.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup performance check: 1000 decision lookups took ${duration}ms, which should be well under 100ms.`);
    }
  },
  {
    name: "Executive Evidence Validation Engine (Stage 3.5B): evidence collection, verification lifecycle, credibility engine, completeness checks, contradiction graphs, correlation traversal, overall confidence, explainability, packaging, security boundaries, and performance",
    run: async () => {
      await ensureBootstrapped();
      const evidenceService = container.resolve<ExecutiveEvidenceValidationService>("IExecutiveEvidenceValidationService");
      const tenantId = "tenant_evidence_test";

      // 1. Collect evidence with metrics & references
      const ev1 = await evidenceService.collectEvidence(tenantId, {
        title: "Database latency stats",
        description: "Postgres write queue delay averages 450ms.",
        status: "DRAFT",
        classification: "Quantitative",
        source: "Production APM",
        sourceReliability: 0.95,
        consistency: 0.9,
        historicalAccuracy: 0.9,
        evidenceQuality: 0.95,
        goals: ["goal_latency_1"],
        plans: ["plan_infra_1"]
      });
      assert.equal(ev1.title, "Database latency stats");
      assert.equal(ev1.status, "DRAFT");
      assert.equal(ev1.classification, "Quantitative");

      const ev2 = await evidenceService.collectEvidence(tenantId, {
        title: "Staging latency stats",
        description: "Write queue delay averages 50ms.",
        status: "PENDING_VERIFICATION",
        classification: "Quantitative",
        source: "Staging APM",
        sourceReliability: 0.8,
        consistency: 0.3, // Low consistency to trigger contradiction check
        goals: ["goal_latency_1"],
        plans: ["plan_infra_1"]
      });
      assert.equal(ev2.status, "PENDING_VERIFICATION");

      // 2. Verify evidence lifecycle & version history
      const verified = await evidenceService.verifyEvidence(tenantId, ev1.id, "VERIFIED", "exec_sre", "Verified via APM logs.");
      assert.equal(verified.verificationStatus, "VERIFIED");
      assert.equal(verified.status, "VERIFIED");
      assert.equal(verified.version, 2);

      const evRepo = container.resolve<MemoryExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");
      const evV1 = await evRepo.findEvidenceVersion(tenantId, ev1.id, 1);
      assert.ok(evV1);
      assert.equal(evV1.status, "DRAFT");

      // 3. Credibility Engine (Deliverable 6)
      const credibility = await evidenceService.calculateCredibility(tenantId, ev1.id);
      assert.ok(credibility.credibilityScore >= 0.8);
      assert.ok(credibility.explanation.includes("source reliability"));

      // 4. Completeness Engine (Deliverable 7)
      const completeness = await evidenceService.checkCompleteness(tenantId, ev1.id);
      assert.equal(completeness.isCompletenessSufficient, true);
      assert.equal(completeness.missingEvidenceList.length, 0);

      // 5. Contradiction Engine (Deliverable 8)
      const contradiction = await evidenceService.detectContradictions(tenantId, ev2.id);
      assert.equal(contradiction.hasContradictions, true);
      assert.equal(contradiction.severity, "HIGH");
      assert.ok(contradiction.conflictGraph.length > 0);

      // 6. Confidence Engine (Deliverable 10)
      const confidence = await evidenceService.calculateConfidence(tenantId, ev1.id);
      assert.ok(confidence.overallConfidence >= 0.8);

      // 7. Explainability Engine (Deliverable 11)
      const explanation = await evidenceService.explainEvidence(tenantId, ev1.id);
      assert.equal(explanation.whyAccepted, "Sufficient independent sources provided.");

      // 8. Packaging Engine (Deliverable 12)
      const pkg = await evidenceService.packageEvidence(tenantId, ev1.id);
      assert.ok(pkg.explanation.includes("packaged evidence"));
      assert.ok(pkg.relatedGoals.includes("goal_latency_1"));

      // 9. Graph Correlation & Traversal (Deliverable 9 & 16)
      await evidenceService.linkEvidence(tenantId, ev1.id, ev2.id, "CORROBORATES");
      const traversal = await evidenceService.traverseEvidenceGraph(tenantId, ev1.id);
      assert.equal(traversal.hasCycle, false);
      assert.ok(traversal.nodes.some(n => n.evidenceId === ev2.id));

      // 10. Security Isolation (Deliverable 15)
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-ev1" },
            () => evidenceService.calculateConfidence(tenantId, ev1.id)
          );
        },
        /Security Violation/
      );

      // 11. Performance O(1) repository lookups (Deliverable 16)
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await evRepo.findEvidenceById(tenantId, ev1.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup check: 1000 evidence lookups took ${duration}ms.`);
    }
  },
  {
    name: "Executive Alternative Generation & Hypothesis Intelligence Engine (Stage 3.5C): lifecycle, diversity analysis, hypothesis and counter-hypothesis mapping, opportunity identification, constraints awareness, comparisons, packaging, security validation, and performance checks",
    run: async () => {
      await ensureBootstrapped();
      const altService = container.resolve<ExecutiveAlternativeGenerationService>("IExecutiveAlternativeGenerationService");
      const tenantId = "tenant_alternative_test";
      const decisionId = "dec_pricing_1";

      // 1. Generate multiple alternatives
      const alts = await altService.generateAlternatives(tenantId, decisionId, "Should we increase pricing?");
      assert.ok(alts.length >= 4);
      assert.equal(alts[0].status, "GENERATED");
      assert.ok(alts[0].title.includes("approach"));

      // 2. Lifecycle transitions
      const updatedAlt = await altService.updateAlternativeStatus(tenantId, alts[0].id, "VALIDATED", "exec_cfo");
      assert.equal(updatedAlt.status, "VALIDATED");
      assert.equal(updatedAlt.version, 2);

      const altRepo = container.resolve<MemoryExecutiveAlternativeRepository>("IExecutiveAlternativeRepository");
      const altV1 = await altRepo.findAlternativeVersion(tenantId, alts[0].id, 1);
      assert.ok(altV1);
      assert.equal(altV1.status, "GENERATED");

      // 3. Hypothesis & Counter-Hypothesis Engine (including extra requirement)
      const hypotheses = await altService.generateHypotheses(tenantId, decisionId, "Should we expand to UAE?");
      assert.equal(hypotheses.length, 1);
      const pair = hypotheses[0];
      
      // Verify Hypothesis opposite / counter logic
      assert.ok(pair.hypothesis.text.includes("Expand to UAE"));
      assert.ok(pair.counterHypothesis.text.includes("India market"));
      
      // Verify stored properties
      assert.ok(pair.hypothesis.supportingEvidence.length > 0);
      assert.ok(pair.hypothesis.unknownEvidence.length > 0);
      assert.ok(pair.hypothesis.risks.length > 0);
      assert.ok(pair.hypothesis.assumptions.length > 0);
      assert.equal(pair.hypothesis.confidence, 0.8);

      assert.ok(pair.counterHypothesis.supportingEvidence.length > 0);
      assert.ok(pair.counterHypothesis.unknownEvidence.length > 0);
      assert.ok(pair.counterHypothesis.risks.length > 0);
      assert.ok(pair.counterHypothesis.assumptions.length > 0);
      assert.equal(pair.counterHypothesis.confidence, 0.85);

      // 4. Alternative Diversity Engine (Deliverable 5)
      const diversity = await altService.evaluateDiversity(tenantId, alts);
      assert.ok(diversity.diversityScore >= 0.75);
      assert.ok(diversity.overlap <= 0.25);

      // 5. Alternative Comparison Engine (Deliverable 9)
      const matrix = await altService.compareAlternatives(tenantId, alts.map(a => a.id));
      assert.equal(matrix.length, alts.length);
      assert.equal(matrix[0].alternativeId, alts[0].id);

      // 6. Alternative Explainability Engine (Deliverable 10)
      const explanation = await altService.explainAlternative(tenantId, alts[0].id);
      assert.ok(explanation.whyGenerated.includes("Low Cost"));

      // 7. Alternative Packaging Engine (Deliverable 11)
      const pkg = await altService.packageAlternatives(tenantId, decisionId);
      assert.equal(pkg.decisionId, decisionId);
      assert.ok(pkg.explanation.includes("compiled"));

      // 8. Security Isolation (Deliverable 14)
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-alt1" },
            () => altService.explainAlternative(tenantId, alts[0].id)
          );
        },
        /Security Violation/
      );

      // 9. Performance O(1) repository lookups (Deliverable 15)
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await altRepo.findAlternativeById(tenantId, alts[0].id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup check: 1000 alternative lookups took ${duration}ms.`);
    }
  },
  {
    name: "Executive Decision Evaluation Engine (Stage 3.5D): alternative evaluation, MCDA scoring matrix, ROI metrics, ranking execution, sensitivity analysis scenarios, history trailing, bias detection, devil's advocate reporting, security boundaries, and performance validation",
    run: async () => {
      await ensureBootstrapped();
      const evalService = container.resolve<ExecutiveDecisionEvaluationService>("IExecutiveDecisionEvaluationService");
      const tenantId = "tenant_evaluation_test";
      const decisionId = "dec_hiring_1";
      const alternativeIds = ["alt_low_cost", "alt_high_growth"];

      // 1. Evaluate alternatives (creates MCDA criteria scores & ROI metrics)
      const pkg = await evalService.evaluateAlternatives(tenantId, decisionId, alternativeIds);
      assert.equal(pkg.status, "GENERATED");
      assert.equal(pkg.evaluations.length, 2);
      assert.equal(pkg.evaluations[0].alternativeId, "alt_low_cost");
      assert.equal(pkg.evaluations[0].mcdaScores[0].criterion, "Business Value");

      // Verify Bias detection and Devil's advocate
      assert.ok(pkg.evaluations[0].biasesDetected.length > 0);
      assert.equal(pkg.evaluations[0].biasesDetected[0].biasType, "Optimism Bias");
      assert.ok(pkg.devilsAdvocate["alt_low_cost"].strongestObjections.length > 0);

      // 2. Rank alternatives (runs MCDA sorting & sensitivity analysis)
      const rankedPkg = await evalService.rankAlternatives(tenantId, pkg.id);
      assert.equal(rankedPkg.status, "SCORED");
      assert.equal(rankedPkg.version, 2);
      assert.equal(rankedPkg.rankings.length, 2);
      assert.equal(rankedPkg.rankings[0].rank, 1);
      assert.equal(rankedPkg.sensitivityAnalysis.length, 2);
      assert.equal(rankedPkg.sensitivityAnalysis[0].scenarioName, "Cost weight increased +20%");

      // 3. History snapshot checking
      const evalRepo = container.resolve<MemoryExecutiveDecisionEvaluationRepository>("IExecutiveDecisionEvaluationRepository");
      const history = await evalRepo.getHistoryByEvaluationId(tenantId, pkg.id); // fetches history for evaluation package
      assert.ok(history.length >= 2);
      assert.equal(history[0].previousStatus, "NONE");
      assert.equal(history[0].newStatus, "GENERATED");
      assert.equal(history[1].previousStatus, "GENERATED");
      assert.equal(history[1].newStatus, "SCORED");

      // 4. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-eval1" },
            () => evalService.rankAlternatives(tenantId, pkg.id)
          );
        },
        /Security Violation/
      );

      // 5. Performance O(1) repository lookups
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await evalRepo.findEvaluationById(tenantId, pkg.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup check: 1000 evaluation lookups took ${duration}ms.`);
    }
  },
  {
    name: "Executive Simulation & Projection Engine (Stage 3.5E): simulation execution, optimistic/pessimistic scenario modeling, ARR/profit projections, outcome comparisons, explainability metadata, history tracking, security validation, and performance tests",
    run: async () => {
      await ensureBootstrapped();
      const simService = container.resolve<ExecutiveSimulationService>("IExecutiveSimulationService");
      const tenantId = "tenant_simulation_test";
      const decisionId = "dec_pricing_3";

      // 1. Run simulation for a pricing decision case
      const sim = await simService.runSimulation(tenantId, decisionId, "Should we increase pricing?");
      assert.equal(sim.status, "GENERATED");
      assert.equal(sim.outcomes.bestCase.scenarioName, "Optimistic");
      assert.equal(sim.outcomes.bestCase.expectedARR, 1500000);
      assert.equal(sim.outcomes.expectedCase.expectedARR, 1000000);
      assert.equal(sim.outcomes.worstCase.expectedARR, 500000);

      // Verify explainability
      assert.ok(sim.explainability.whyProjected.includes("pricing elasticity"));
      assert.ok(sim.explainability.whyDifferenceBetweenScenarios.length > 0);

      // 2. Lifecycle transitions
      const updatedSim = await simService.updateSimulationStatus(tenantId, sim.id, "COMPLETED", "exec_cfo");
      assert.equal(updatedSim.status, "COMPLETED");
      assert.equal(updatedSim.version, 2);

      // 3. History snapshot checking
      const simRepo = container.resolve<MemoryExecutiveSimulationRepository>("IExecutiveSimulationRepository");
      const history = await simRepo.getHistoryBySimulationId(tenantId, sim.id);
      assert.ok(history.length >= 2);
      assert.equal(history[0].previousStatus, "NONE");
      assert.equal(history[0].newStatus, "GENERATED");
      assert.equal(history[1].previousStatus, "GENERATED");
      assert.equal(history[1].newStatus, "COMPLETED");

      // 4. Security Isolation
      await assert.rejects(
        async () => {
          await runWithRequestContext(
            { tenantId: "different_tenant", requestId: "req-err-sim1" },
            () => simService.updateSimulationStatus(tenantId, sim.id, "RUNNING", "exec_cfo")
          );
        },
        /Security Violation/
      );

      // 5. Performance O(1) repository lookups
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        await simRepo.findSimulationById(tenantId, sim.id);
      }
      const duration = Date.now() - start;
      assert.ok(duration < 100, `O(1) lookup check: 1000 simulation lookups took ${duration}ms.`);
    }
  }
];
