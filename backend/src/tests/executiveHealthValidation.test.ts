import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import { RuntimeEngineRegistry, IRuntimeEngine, EngineExecutionContext } from "../services/executive/runtime/enginePipeline";
import { PipelineContractRegistry, RuntimeContractMetadata } from "../services/executive/runtime/contractValidator";
import { RuntimeFailureManager } from "../services/executive/runtime/failureRecovery";
import { RuntimeObservabilityManager } from "../services/executive/runtime/observabilityManager";
import {
  RuntimeHealthManager,
  RuntimeReadinessManager,
  RuntimeHealthValidator,
  RuntimeDependencyValidator,
  RuntimeEngineValidator,
  RuntimeHealthSnapshot,
  RuntimeReadinessReport
} from "../services/executive/runtime/healthValidation";


export const executiveHealthValidationTests: any[] = [
  {
    name: "RuntimeHealthSnapshot: enforces absolute immutability",
    run: () => {
      const snapshot = new RuntimeHealthSnapshot({
        snapshotId: "snap_test_123",
        timestamp: new Date(),
        runtimeHealth: "HEALTHY",
        runtimeReadiness: "READY",
        healthyComponents: ["ComponentA"],
        unhealthyComponents: [],
        dependencySummary: {
          "Test Dependency": {
            name: "Test Dependency",
            availability: "AVAILABLE",
            version: "1.0.0",
            initializationStatus: "INITIALIZED",
            health: "HEALTHY",
            errors: [],
            warnings: []
          }
        },
        engineSummary: {},
        validationSummary: { passed: true, details: {}, errors: [], warnings: [] },
        correlationId: "corr_test",
        pipelineExecutionId: "exec_test"
      });

      assert.equal(snapshot.snapshotId, "snap_test_123");
      assert.equal(snapshot.runtimeHealth, "HEALTHY");

      // Verify read-only properties
      assert.throws(() => {
        (snapshot as any).runtimeHealth = "FAILED";
      }, TypeError);

      assert.throws(() => {
        snapshot.healthyComponents.push("ComponentB");
      }, TypeError);

      assert.throws(() => {
        (snapshot.dependencySummary as any)["Test Dependency"].health = "FAILED";
      }, TypeError);
    }
  },
  {
    name: "RuntimeReadinessReport: enforces absolute immutability",
    run: () => {
      const report = new RuntimeReadinessReport({
        overallRuntimeStatus: "READY",
        healthSummary: {
          health: "HEALTHY",
          timestamp: new Date(),
          correlationId: "corr_test",
          pipelineExecutionId: "exec_test"
        },
        readinessSummary: {
          status: "READY",
          message: "Ready to accept requests"
        },
        dependencySummary: {},
        engineSummary: {},
        configurationSummary: {
          environment: "test",
          configurationPassed: true,
          activeVariables: ["NODE_ENV"],
          missingRequired: [],
          warnings: []
        },
        securitySummary: {
          tenantIsolationPassed: true,
          workspaceIsolationPassed: true,
          configurationIntegrityPassed: true,
          runtimeIntegrityPassed: true,
          pipelineIntegrityPassed: true,
          violationsCount: 0,
          messages: []
        },
        recommendations: ["Ensure logs are aggregated"]
      });

      assert.equal(report.overallRuntimeStatus, "READY");

      // Verify read-only properties
      assert.throws(() => {
        (report as any).overallRuntimeStatus = "NOT_READY";
      }, TypeError);

      assert.throws(() => {
        report.recommendations.push("Another recommendation");
      }, TypeError);
    }
  },
  {
    name: "RuntimeDependencyValidator: validates registered and fallback resolver dependencies",
    run: async () => {
      const di = new DIContainer();
      
      // Initially, resolvers should be degraded or failed because no repositories or database is registered
      const validator = new RuntimeDependencyValidator(di);
      const initialReport = await validator.validate();

      assert.equal(initialReport["Identity Resolver"].health, "FAILED");
      assert.equal(initialReport["Business Resolver"].health, "FAILED");

      // Now register DB client fallback
      di.registerInstance("PrismaClient", {});
      const secondReport = await validator.validate();

      // Resolver fallbacks should now be degraded instead of failed (since Prisma is present)
      assert.equal(secondReport["Business Resolver"].health, "DEGRADED");
      assert.equal(secondReport["Knowledge Resolver"].health, "DEGRADED");
      assert.equal(secondReport["Memory Resolver"].health, "DEGRADED");
    }
  },
  {
    name: "RuntimeEngineValidator: verifies registration status and execution order sequential rules",
    run: async () => {
      const registry = new RuntimeEngineRegistry();
      const validator = new RuntimeEngineValidator(registry);

      // Verify unregistered engines
      const initialReport = await validator.validate();
      assert.equal(initialReport["Thinking"].registered, false);
      assert.equal(initialReport["Thinking"].executionOrderValid, false);

      // Register first engine in order
      class DummyEngine implements IRuntimeEngine {
        constructor(public readonly name: string) {}
        async execute(context: EngineExecutionContext): Promise<void> {}
      }
      registry.register(new DummyEngine("Thinking"));
      
      const secondReport = await validator.validate();
      assert.equal(secondReport["Thinking"].registered, true);
      assert.equal(secondReport["Thinking"].executionOrderValid, true);
      
      // Register out of order (skip Planning, register Decision)
      registry.register(new DummyEngine("Decision"));
      const thirdReport = await validator.validate();
      assert.equal(thirdReport["Decision"].registered, true);
      assert.equal(thirdReport["Decision"].executionOrderValid, false); // invalid because Planning is missing
      
      // Register Planning
      registry.register(new DummyEngine("Planning"));
      const fourthReport = await validator.validate();
      assert.equal(fourthReport["Decision"].executionOrderValid, true); // now valid as sequence is unbroken
    }
  },
  {
    name: "RuntimeHealthValidator: performs security validation including tenant and workspace isolation",
    run: async () => {
      const di = new DIContainer();
      di.registerInstance("RuntimeEngineRegistry", {});
      di.registerInstance("PipelineContractRegistry", {});

      const registry = new RuntimeEngineRegistry();
      const validator = new RuntimeHealthValidator(di, registry);

      // Verify validation failure on cross-tenant correlation ID
      const result = await validator.validate("cross-tenant-violator-id", "exec_test");
      assert.equal(result.securitySummary.tenantIsolationPassed, false);
      assert.ok(result.securitySummary.violationsCount > 0);
      assert.equal(result.overallHealth, "FAILED");
    }
  },
  {
    name: "RuntimeHealthManager & RuntimeReadinessManager: perform complete checks and output reports",
    run: async () => {
      const di = new DIContainer();
      const registry = new RuntimeEngineRegistry();
      
      // Setup mock registries & engines to achieve a clean setup
      di.registerInstance("RuntimeEngineRegistry", registry);
      di.registerInstance("PipelineContractRegistry", new PipelineContractRegistry());
      di.registerInstance("PrismaClient", {});
      di.registerInstance("IExecutiveIdentityService", {
        listExecutives: async () => []
      });
      di.registerInstance("IBusinessContextRepository", {});
      di.registerInstance("IKnowledgeRepository", {});
      di.registerInstance("IMemoryRepository", {});
      di.registerInstance("RuntimeFailureManager", new RuntimeFailureManager());
      di.registerInstance("RuntimeObservabilityManager", new RuntimeObservabilityManager());
      di.registerInstance("ITelemetryEngine", {});
      di.registerInstance("ICircuitBreakerEngine", {});


      const engines = ["Thinking", "Planning", "Decision", "Execution", "Monitoring", "Learning"];
      class DummyEngine implements IRuntimeEngine {
        constructor(public readonly name: string) {}
        async execute(context: EngineExecutionContext): Promise<void> {}
      }
      for (const name of engines) {
        registry.register(new DummyEngine(name));
      }

      // Add unified observability mock
      const observabilityEvents: any[] = [];
      di.registerInstance("IHealthRegistry", {
        setHealth: (module: string, status: any) => {
          observabilityEvents.push({ module, status });
        }
      });

      const healthManager = new RuntimeHealthManager(di, registry);
      const readinessManager = new RuntimeReadinessManager(di, healthManager);

      // Perform checks
      const snapshot = await healthManager.performHealthCheck("corr_normal", "exec_normal");
      const report = await readinessManager.determineReadiness("corr_normal", "exec_normal");

      assert.equal(snapshot.correlationId, "corr_normal");
      assert.ok(snapshot.healthyComponents.includes("Dependency Health"));
      assert.ok(snapshot.healthyComponents.includes("Engine Health"));

      // Verify Observability integration trigger
      assert.ok(observabilityEvents.length > 0);
      assert.equal(observabilityEvents[0].module, "ExecutiveRuntimeHealth");

      assert.equal(report.overallRuntimeStatus, "READY");
      assert.equal(report.healthSummary.health, "HEALTHY");
    }
  }
];
