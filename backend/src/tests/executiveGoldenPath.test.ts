import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import { RuntimeEngineRegistry, ThinkingEngineAdapter, PlanningEngineAdapter, DecisionEngineAdapter, ExecutionEngineAdapter, MonitoringEngineAdapter, LearningEngineAdapter } from "../services/executive/runtime/enginePipeline";
import { PipelineContractRegistry } from "../services/executive/runtime/contractValidator";
import { RuntimeFailureManager } from "../services/executive/runtime/failureRecovery";
import { RuntimeObservabilityManager } from "../services/executive/runtime/observabilityManager";
import { RuntimeGoldenPathValidator } from "../services/executive/runtime/goldenPathValidation";

export const executiveGoldenPathTests: any[] = [
  {
    name: "RuntimeGoldenPathValidator: runs complete verification and yields PASS_WITH_WARNINGS",
    run: async () => {
      const di = new DIContainer();
      const registry = new RuntimeEngineRegistry();
      
      // Setup mock registries & engines to achieve a clean setup
      di.registerInstance("RuntimeEngineRegistry", registry);
      di.registerInstance("PipelineContractRegistry", new PipelineContractRegistry());
      di.registerInstance("PrismaClient", {});
      di.registerInstance("IExecutiveIdentityService", {
        listExecutives: async () => [
          { id: "exec_1", role: "SPRINT2_EXECUTIVE_RUNTIME", status: "ACTIVE", dna: { capabilityProfile: { executableCapabilities: ["executive:execute"] } } }
        ]
      });
      di.registerInstance("IBusinessContextRepository", {
        loadBusinessProfile: async (id: string) => ({ id, name: "Golden Workspace", industry: "General", teamSize: "1-10" }),
        loadLatestSubscription: async (id: string) => ({ status: "ACTIVE", planCode: "PREMIUM" })
      });
      di.registerInstance("IKnowledgeRepository", {
        loadKnowledgeForRuntime: async () => []
      });
      di.registerInstance("IMemoryRepository", {
        loadMemoryForConversation: async () => []
      });
      di.registerInstance("RuntimeFailureManager", new RuntimeFailureManager());
      di.registerInstance("RuntimeObservabilityManager", new RuntimeObservabilityManager());
      di.registerInstance("ITelemetryEngine", {});
      di.registerInstance("IHealthRegistry", {
        setHealth: () => {}
      });

      // Register sequential adapters
      registry.register(new ThinkingEngineAdapter(di));
      registry.register(new PlanningEngineAdapter(di));
      registry.register(new DecisionEngineAdapter(di));
      registry.register(new ExecutionEngineAdapter(di));
      registry.register(new MonitoringEngineAdapter(di));
      registry.register(new LearningEngineAdapter(di));

      const validator = new RuntimeGoldenPathValidator(di);
      const report = await validator.runGoldenPathValidation("Verify golden path", {
        tenantId: "default_tenant",
        actorId: "actor_normal",
        correlationId: "corr_gp_normal"
      });

      console.log(report.toFormattedString());

      // Assertions
      assert.equal(report.executionResult.overallResult, "PASS");
      assert.equal(report.warnings.length, 0);
      assert.equal(report.executionResult.stageResults["Identity"].status, "SUCCESS");
      assert.equal(report.executionResult.stageResults["Thinking"].status, "SUCCESS");
    }
  },
  {
    name: "RuntimeGoldenPathValidator: fails validation if cross-tenant security violation is detected",
    run: async () => {
      const di = new DIContainer();
      di.registerInstance("RuntimeEngineRegistry", new RuntimeEngineRegistry());
      di.registerInstance("PipelineContractRegistry", new PipelineContractRegistry());

      const validator = new RuntimeGoldenPathValidator(di);
      const report = await validator.runGoldenPathValidation("Test validation fail", {
        tenantId: "tenant_a",
        actorId: "actor_normal",
        correlationId: "corr_broken_tenant_b"
      });

      assert.equal(report.executionResult.overallResult, "FAIL");
      assert.ok(report.errors.length > 0);
      assert.ok(report.errors.some(e => e.includes("Tenant Isolation Violation")));
    }
  }
];
