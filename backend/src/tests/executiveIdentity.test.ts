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
import { ExecutiveGoalIntelligenceService } from "../services/executive/goalIntelligence.service";
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
  }
];
