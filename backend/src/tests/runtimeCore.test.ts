import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import { ConfigManager } from "../runtime/kernel/configManager";
import { ModuleRegistry } from "../runtime/core/moduleRegistry";
import { LifecycleManager } from "../runtime/kernel/lifecycleManager";
import { HealthRegistry } from "../runtime/kernel/healthRegistry";
import { StateManager } from "../runtime/kernel/stateManager";
import { FeatureFlagEngine } from "../runtime/kernel/featureFlags";
import { RuntimeManifest } from "../runtime/kernel/manifest";
import { Bootstrapper } from "../runtime/kernel/bootstrap";
import { CapabilityRegistry } from "../runtime/core/capabilityRegistry";
import { CompatibilityEngine } from "../runtime/core/compatibilityMetadata";
import { ContractRegistry } from "../runtime/communication/contractRegistry";
import { CorrelationEngine } from "../runtime/communication/correlationEngine";
import { EventScheduler } from "../runtime/communication/eventScheduler";
import { DeadLetterQueue } from "../runtime/communication/deadLetterQueue";
import { IdentityEngine } from "../runtime/communication/identityEngine";
import { RoutingEngine } from "../runtime/communication/routingEngine";
import { EventBus } from "../runtime/communication/eventBus";

export const runtimeCoreTests: any[] = [
  {
    name: "DI Container: singleton resolution returns identical instances",
    run: () => {
      const container = new DIContainer();
      let count = 0;
      container.registerSingleton("test", () => {
        count++;
        return { value: count };
      });

      const r1: any = container.resolve("test");
      const r2: any = container.resolve("test");

      assert.equal(r1.value, 1);
      assert.equal(r2.value, 1);
      assert.equal(count, 1);
      assert.equal(r1, r2);
    }
  },
  {
    name: "DI Container: transient resolution returns new instances",
    run: () => {
      const container = new DIContainer();
      let count = 0;
      container.registerTransient("test", () => {
        count++;
        return { value: count };
      });

      const r1: any = container.resolve("test");
      const r2: any = container.resolve("test");

      assert.equal(r1.value, 1);
      assert.equal(r2.value, 2);
      assert.notEqual(r1, r2);
    }
  },
  {
    name: "DI Container: scoped child container resolves separate scoped instances but shares singletons",
    run: () => {
      const container = new DIContainer();
      let singletonCount = 0;
      let scopedCount = 0;

      container.registerSingleton("singleton", () => {
        singletonCount++;
        return { value: singletonCount };
      });

      container.registerScoped("scoped", () => {
        scopedCount++;
        return { value: scopedCount };
      });

      const scopeA = container.createScope();
      const scopeB = container.createScope();

      const sA1: any = scopeA.resolve("singleton");
      const sB1: any = scopeB.resolve("singleton");
      assert.equal(sA1, sB1);
      assert.equal(singletonCount, 1);

      const scA1: any = scopeA.resolve("scoped");
      const scA2: any = scopeA.resolve("scoped");
      const scB1: any = scopeB.resolve("scoped");

      assert.equal(scA1, scA2);
      assert.notEqual(scA1, scB1);
      assert.equal(scA1.value, 1);
      assert.equal(scB1.value, 2);
    }
  },
  {
    name: "DI Container: throws clear error on circular dependency detection",
    run: () => {
      const container = new DIContainer();
      container.registerTransient("A", (c) => c.resolve("B"));
      container.registerTransient("B", (c) => c.resolve("C"));
      container.registerTransient("C", (c) => c.resolve("A"));

      assert.throws(() => {
        container.resolve("A");
      }, /Circular dependency detected/);
    }
  },
  {
    name: "Config Manager: retrieves configuration values and validates environment parameters",
    run: () => {
      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      assert.ok(["development", "staging", "production", "test"].includes(config.environment));
      assert.ok(["groq", "openai"].includes(config.modelProvider));
      assert.ok(["local", "remote"].includes(config.embeddingMode));
      assert.equal(configManager.get("environment"), config.environment);

      const version = configManager.getExtraSetting("version");
      const modelTimeout = configManager.getExtraSetting("timeouts.modelCompletion");

      assert.ok(typeof version === "string");
      assert.ok(typeof modelTimeout === "number");
    }
  },
  {
    name: "Module Registry: registers modules, tracks dependencies and validates graph",
    run: () => {
      const registry = new ModuleRegistry();
      registry.register({
        name: "module.a",
        version: "1.0.0",
        dependencies: ["module.b"],
      });

      const modA = registry.getModule("module.a");
      assert.ok(modA);
      assert.equal(modA.status, "REGISTERED");
      assert.equal(modA.health, "Initializing");

      const check1 = registry.validateDependencies();
      assert.equal(check1.isValid, false);
      assert.ok(check1.missing.length > 0);

      registry.register({
        name: "module.b",
        version: "1.2.0",
        dependencies: [],
      });

      const check2 = registry.validateDependencies();
      assert.equal(check2.isValid, true);
      assert.equal(check2.missing.length, 0);
    }
  },
  {
    name: "Lifecycle Manager: performs valid transitions and invokes callback hooks",
    run: async () => {
      const manager = new LifecycleManager();
      let initCalled = false;
      let startCalled = false;

      manager.registerHook({
        name: "test-module",
        onInitialize: async () => {
          initCalled = true;
        },
        onStart: async () => {
          startCalled = true;
        }
      });

      assert.equal(manager.getState(), "Stopped");
      await manager.transitionTo("Initialize");
      assert.equal(manager.getState(), "Initialize");
      assert.equal(initCalled, true);

      await manager.transitionTo("Start");
      assert.equal(manager.getState(), "Start");
      assert.equal(startCalled, true);

      await assert.rejects(async () => {
        await manager.transitionTo("Stopped");
      }, /Invalid lifecycle state transition/);
    }
  },
  {
    name: "Health Registry: handles module-level health parameters and compiles aggregate states",
    run: () => {
      const registry = new HealthRegistry();
      
      registry.setHealth("module.1", {
        health: "Healthy",
        readiness: "Ready",
        liveness: "Alive",
        startup: "Started",
        dependencyHealth: "Dependency Healthy"
      });

      registry.setHealth("module.2", {
        health: "Healthy",
        readiness: "Ready",
        liveness: "Alive",
        startup: "Started",
        dependencyHealth: "Dependency Healthy"
      });

      let agg = registry.getAggregateHealth();
      assert.equal(agg.health, "Healthy");
      assert.equal(agg.readiness, "Ready");
      assert.equal(agg.liveness, "Alive");
      assert.equal(agg.dependencyHealth, "Dependency Healthy");

      // Degrade module.1 health
      registry.setHealth("module.1", {
        health: "Degraded",
        readiness: "Ready",
        liveness: "Alive",
        startup: "Started",
        dependencyHealth: "Dependency Degraded"
      });

      agg = registry.getAggregateHealth();
      assert.equal(agg.health, "Degraded");
      assert.equal(agg.dependencyHealth, "Dependency Degraded");

      // Crash module.2 liveness
      registry.setHealth("module.2", {
        health: "Unavailable",
        readiness: "Not Ready",
        liveness: "Dead",
        startup: "Failed",
        dependencyHealth: "Dependency Unavailable"
      });

      agg = registry.getAggregateHealth();
      assert.equal(agg.health, "Unavailable");
      assert.equal(agg.readiness, "Not Ready");
      assert.equal(agg.liveness, "Dead");
      assert.equal(agg.dependencyHealth, "Dependency Unavailable");
    }
  },
  {
    name: "State Manager: sets, gets and updates system metric states dynamically",
    run: () => {
      const manager = new StateManager();
      let eventPayload: any = null;

      manager.on("change", (payload) => {
        eventPayload = payload;
      });

      manager.set("metric.throughput", 100);
      assert.equal(manager.get("metric.throughput"), 100);
      assert.deepEqual(eventPayload, {
        key: "metric.throughput",
        previous: undefined,
        current: 100
      });

      manager.increment("metric.throughput", 20);
      assert.equal(manager.get("metric.throughput"), 120);

      manager.decrement("metric.throughput", 5);
      assert.equal(manager.get("metric.throughput"), 115);
    }
  },
  {
    name: "Feature Flag Engine: checks flags and evaluates overrides",
    run: () => {
      const engine = new FeatureFlagEngine();
      engine.setFlag("shadowMode", true);
      engine.setFlag("newEngineFlag", false);

      assert.equal(engine.isEnabled("shadowMode"), true);
      assert.equal(engine.isEnabled("newEngineFlag"), false);
      assert.equal(engine.isEnabled("nonExistentFlag"), false);
    }
  },
  {
    name: "Capability Registry: validates registrations, discovery, permission checking",
    run: () => {
      const registry = new CapabilityRegistry();

      registry.register({
        name: "LeadQualification",
        version: "1.0.0",
        ownerId: "SalesAI",
        permissionsRequired: ["crm:write", "lead:qualify"],
        metadata: { retryInterval: 300 },
        health: "Healthy",
        status: "Active"
      });

      // Assert lookup finds capability
      const cap = registry.lookup("LeadQualification", "1.0.0");
      assert.ok(cap);
      assert.equal(cap.ownerId, "SalesAI");

      // Verify permission checking
      assert.equal(registry.hasPermission("LeadQualification", "1.0.0", ["crm:write", "lead:qualify"]), true);
      assert.equal(registry.hasPermission("LeadQualification", "1.0.0", ["crm:write"]), false);

      // Verify discovery matches criteria
      const disc = registry.discover({ ownerId: "SalesAI" });
      assert.equal(disc.length, 1);
      assert.equal(disc[0].name, "LeadQualification");

      // Update capability health
      registry.updateHealth("LeadQualification", "1.0.0", "Degraded");
      const updatedCap = registry.lookup("LeadQualification", "1.0.0");
      assert.equal(updatedCap.health, "Degraded");
    }
  },
  {
    name: "Compatibility Engine: evaluates semver wildcard constraints and contracts",
    run: () => {
      const engine = new CompatibilityEngine();

      assert.equal(engine.isModuleSupported("runtime.kernel"), true);
      assert.equal(engine.isModuleSupported("non.existent.module"), false);

      // Wildcard version checking (e.g. 1.0.x range check)
      assert.equal(engine.isExecutiveAiVersionSupported("1.0.5"), true);
      assert.equal(engine.isExecutiveAiVersionSupported("1.2.5"), false);

      // Contract version check
      assert.equal(engine.isContractVersionSupported("1.0.0"), true);
      assert.equal(engine.isContractVersionSupported("2.0.0"), false);
    }
  },
  {
    name: "Bootstrapper: runs complete business-agnostic boot sequence",
    run: async () => {
      const customContainer = new DIContainer();
      const boot = new Bootstrapper(customContainer);

      await boot.bootstrap();

      assert.ok(customContainer.has("IConfigManager"));
      assert.ok(customContainer.has("ILifecycleManager"));
      assert.ok(customContainer.has("IHealthRegistry"));
      assert.ok(customContainer.has("IStateManager"));
      assert.ok(customContainer.has("IFeatureFlagEngine"));
      assert.ok(customContainer.has("IRuntimeManifest"));

      const lifecycle: LifecycleManager = customContainer.resolve("ILifecycleManager");
      const health: HealthRegistry = customContainer.resolve("IHealthRegistry");

      assert.equal(lifecycle.getState(), "Ready");
      
      const agg = health.getAggregateHealth();
      assert.equal(agg.health, "Healthy");
      assert.equal(agg.readiness, "Ready");
      assert.equal(agg.liveness, "Alive");

      await boot.shutdown();
      assert.equal(lifecycle.getState(), "Stopped");
      assert.equal(health.getAggregateHealth().health, "Unavailable");
    }
  },
  {
    name: "Contract Registry & Event Bus: validates event payloads against schema and runs callbacks",
    run: async () => {
      const cr = new ContractRegistry();
      const cor = new CorrelationEngine();
      const es = new EventScheduler();
      const dlq = new DeadLetterQueue();
      const bus = new EventBus(cr, cor, es, dlq);

      cr.registerContract({
        name: "payment.processed",
        version: "1.0.0",
        schema: {
          amount: "number",
          success: "boolean"
        }
      });

      let receivedEnvelope: any = null;
      bus.subscribe("payment.processed", (env) => {
        receivedEnvelope = env;
      });

      // Publish valid event payload
      const eventId = await bus.publish("payment.processed", "1.0.0", { amount: 150.5, success: true }, { tenantId: "tenant_1" });
      assert.ok(eventId);
      
      // Allow async event loop execution
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.ok(receivedEnvelope);
      assert.equal(receivedEnvelope.payload.amount, 150.5);
      assert.equal(receivedEnvelope.metadata.status, "completed");

      // Publish invalid payload
      await assert.rejects(async () => {
        await bus.publish("payment.processed", "1.0.0", { amount: "150.5", success: true }, { tenantId: "tenant_1" });
      }, /Contract Validation Failed/);
    }
  },
  {
    name: "Identity Engine: links multi-channel mappings and merges unified profiles",
    run: () => {
      const engine = new IdentityEngine();

      // Resolve initial WhatsApp identity
      const id1 = engine.resolveIdentity("tenant_1", "WhatsApp", "wa_999");
      assert.ok(id1.unifiedId);
      assert.equal(id1.channels.get("WhatsApp"), "wa_999");

      // Link Instagram to WhatsApp unified ID
      const id2 = engine.linkIdentity(id1.unifiedId, "tenant_1", "Instagram", "ig_999");
      assert.equal(id2.unifiedId, id1.unifiedId);
      assert.equal(id2.channels.get("Instagram"), "ig_999");

      // Resolve another email identity
      const id3 = engine.resolveIdentity("tenant_1", "Email", "mail_999");
      assert.notEqual(id3.unifiedId, id1.unifiedId);

      // Link/Merge Email unified ID with the original
      const merged = engine.mergeIdentities(id1.unifiedId, id3.unifiedId, "tenant_1");
      assert.equal(merged.unifiedId, id1.unifiedId);
      assert.equal(merged.channels.get("Email"), "mail_999");

      // Bypassed looking up deleted ID
      const lookupDeleted = engine.lookup(id3.unifiedId);
      assert.equal(lookupDeleted, null);
    }
  },
  {
    name: "Routing Engine: routes dynamically based on capabilities and owner health states",
    run: () => {
      const capRegistry = new CapabilityRegistry();
      const healthRegistry = new HealthRegistry();
      const routing = new RoutingEngine(capRegistry, healthRegistry);

      capRegistry.register({
        name: "Refund",
        version: "1.0.0",
        ownerId: "FinanceAI",
        permissionsRequired: [],
        metadata: {},
        health: "Healthy",
        status: "Active"
      });

      // Resolve route
      const r1 = routing.route("Refund");
      assert.ok(r1);
      assert.equal(r1.destinationOwner, "FinanceAI");

      // Set FinanceAI health to Unavailable
      healthRegistry.setHealth("FinanceAI", {
        health: "Unavailable",
        readiness: "Not Ready",
        liveness: "Dead",
        startup: "Failed",
        dependencyHealth: "Dependency Unavailable"
      });

      // Routing to unavailable owner fails
      const r2 = routing.route("Refund");
      assert.equal(r2, null);

      // Register fallback route
      routing.registerFallback("Refund", "CEOAI");
      const r3 = routing.route("Refund");
      assert.ok(r3);
      assert.equal(r3.destinationOwner, "CEOAI");
    }
  },
  {
    name: "Correlation Engine: propagates parent span scopes, lineages and event steps",
    run: () => {
      const engine = new CorrelationEngine();

      const context1 = engine.createContext();
      assert.ok(context1.correlationId);
      assert.equal(context1.parentCorrelationId, undefined);

      // Test extending the context within the same execution path
      const context2 = engine.extendContext(context1, "step_two", "evt_1");
      assert.equal(context2.correlationId, context1.correlationId);
      assert.equal(context2.parentCorrelationId, context1.parentCorrelationId);
      assert.equal(context2.executionChain[0], "step_two");
      assert.equal(context2.lineage[0], "evt_1");

      // Test creating a child context representing a new span boundary
      const childContext = engine.createContext(context1);
      assert.equal(childContext.correlationId, context1.correlationId);
      assert.equal(childContext.parentCorrelationId, context1.correlationId);
    }
  },
  {
    name: "Dead Letter Queue: quarantines payloads and manages retry limits",
    run: () => {
      const dlq = new DeadLetterQueue();

      const id = dlq.quarantine("topic.a", { text: "err" }, "corr_123", "NullPointerException");
      assert.ok(id);
      
      const list = dlq.listQuarantined();
      assert.equal(list.length, 1);
      assert.equal(list[0].id, id);
      assert.equal(list[0].errorReason, "NullPointerException");

      // Retry
      const r1 = dlq.retry(id);
      assert.equal(r1.success, true);
      assert.equal(r1.topic, "topic.a");

      // Simulate failure loop and verify quarantine limit block
      dlq.retry(id);
      const r3 = dlq.retry(id);
      assert.equal(r3.success, false);
    }
  },
  {
    name: "Event Scheduler: manages future trigger queues and tics delayed jobs",
    run: () => {
      const es = new EventScheduler();

      const id = es.schedule("topic.delayed", { data: 1 }, 50);
      assert.ok(id);

      const jobs1 = es.tick(new Date(Date.now() + 10));
      assert.equal(jobs1.length, 0); // Not ready yet

      const jobs2 = es.tick(new Date(Date.now() + 60));
      assert.equal(jobs2.length, 1);
      assert.equal(jobs2[0].topic, "topic.delayed");
      assert.equal(jobs2[0].status, "executed");
    }
  }
];
