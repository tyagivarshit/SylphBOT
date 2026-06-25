import { DIContainer, container } from "./diContainer";
import { ConfigManager } from "./configManager";
import { LifecycleManager } from "./lifecycleManager";
import { HealthRegistry } from "./healthRegistry";
import { StateManager } from "./stateManager";
import { FeatureFlagEngine } from "./featureFlags";
import { RuntimeManifest, ManifestModuleInfo } from "./manifest";
import {
  ContextBudgetManager,
  ContextIntelligenceEngine,
  MemoryEngine,
  MemorySelectionEngine,
  KnowledgeSelectionEngine,
  LearningRegistry,
  ConstitutionIntegrationLayer,
  PromptCompiler,
  ReasoningFramework
} from "../intelligence";
import {
  ToolRegistry,
  ValidationEngine,
  PermissionEngine,
  PolicyEngine,
  ApprovalEngine,
  CircuitBreakerEngine,
  RetryManager,
  ExecutionTracker,
  ResourceScheduler,
  ToolExecutor
} from "../execution";
import {
  TelemetryEngine,
  TracingEngine,
  ReasoningTraceEngine,
  CostTracker,
  MetricsEngine,
  HealthMonitor,
  AuditEngine,
  EventAnalyticsEngine,
  AlertEngine,
  ObservabilityAPILayer
} from "../observability";
import {
  SandboxRuntime,
  SandboxMemory,
  ShadowModeManager,
  SimulationEngine,
  ReplayEngine,
  ExperimentFramework,
  ScenarioGenerator,
  SafetyEvaluator,
  DecisionComparator,
  CertificationEngine
} from "../sandbox";
import {
  ContractRegistry,
  CorrelationEngine,
  EventScheduler,
  DeadLetterQueue,
  RoutingEngine,
  EventBus
} from "../communication";
import { CapabilityRegistry } from "../core/capabilityRegistry";
import {
  ModelRegistry,
  ProviderRegistry,
  ModelRouter,
  FallbackManager,
  ModelHealthMonitor,
  ModelCostManager,
  ModelManager,
  OpenAIAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  GroqAdapter,
  OpenRouterAdapter,
  OllamaAdapter
} from "../models";





export interface BootstrapOptions {
  skipValidation?: boolean;
  getModulesCallback?: () => ManifestModuleInfo[];
}

export class Bootstrapper {
  private diContainer: DIContainer;
  private configManager!: ConfigManager;
  private lifecycleManager!: LifecycleManager;
  private healthRegistry!: HealthRegistry;
  private stateManager!: StateManager;
  private featureFlagEngine!: FeatureFlagEngine;
  private runtimeManifest!: RuntimeManifest;

  constructor(diContainer: DIContainer = container) {
    this.diContainer = diContainer;
  }

  /**
   * Start the core runtime kernel.
   * Completely business-agnostic.
   */
  public async bootstrap(options: BootstrapOptions = {}): Promise<void> {
    try {
      console.log("[Runtime Kernel] Initializing Bootstrapper...");

      // 1. Instantiate kernel services
      this.configManager = new ConfigManager();
      this.lifecycleManager = new LifecycleManager();
      this.healthRegistry = new HealthRegistry();
      this.stateManager = new StateManager();
      this.featureFlagEngine = new FeatureFlagEngine();
      
      const getModules = options.getModulesCallback || (() => [
        {
          name: "runtime.kernel",
          version: this.configManager.getExtraSetting("version", "1.0.0"),
          dependencies: [],
          capabilities: ["kernel-di", "kernel-config", "kernel-lifecycle", "kernel-health"],
          health: "Healthy",
          status: "STARTED"
        }
      ]);
      
      this.runtimeManifest = new RuntimeManifest(this.configManager, getModules);

      // 2. Register core services in dependency injection container
      this.registerServices();

      // 3. Set health to Initializing
      this.healthRegistry.setHealth("runtime.kernel", {
        health: "Healthy",
        readiness: "Not Ready",
        liveness: "Alive",
        startup: "Initializing",
        dependencyHealth: "Dependency Healthy",
        reason: "Kernel booting"
      });

      // 4. Transition: Stopped -> Initialize
      await this.lifecycleManager.transitionTo("Initialize");
      this.healthRegistry.setHealth("runtime.kernel", {
        health: "Healthy",
        readiness: "Not Ready",
        liveness: "Alive",
        startup: "Initializing",
        dependencyHealth: "Dependency Healthy",
        reason: "Initializing lifecycle hooks"
      });

      // 5. Transition: Initialize -> Start
      await this.lifecycleManager.transitionTo("Start");
      this.healthRegistry.setHealth("runtime.kernel", {
        health: "Healthy",
        readiness: "Not Ready",
        liveness: "Alive",
        startup: "Started",
        dependencyHealth: "Dependency Healthy",
        reason: "Kernel components active"
      });

      // 6. Transition: Start -> Ready
      await this.lifecycleManager.transitionTo("Ready");
      this.healthRegistry.setHealth("runtime.kernel", {
        health: "Healthy",
        readiness: "Ready",
        liveness: "Alive",
        startup: "Started",
        dependencyHealth: "Dependency Healthy",
        reason: "Ready for communication"
      });

      this.stateManager.set("system.ready", true);
      console.log("[Runtime Kernel] Bootstrap complete. Ready state achieved.");
    } catch (err) {
      console.error("[Runtime Kernel] Bootstrap failed:", err);
      if (this.lifecycleManager) {
        await this.lifecycleManager.transitionTo("Failed").catch(() => {});
      }
      if (this.healthRegistry) {
        this.healthRegistry.setHealth("runtime.kernel", {
          health: "Unavailable",
          readiness: "Not Ready",
          liveness: "Dead",
          startup: "Failed",
          dependencyHealth: "Dependency Unavailable",
          reason: String(err)
        });
      }
      throw err;
    }
  }

  /**
   * Stop the core runtime kernel gracefully.
   */
  public async shutdown(): Promise<void> {
    console.log("[Runtime Kernel] Shutting down kernel...");
    if (this.lifecycleManager) {
      await this.lifecycleManager.transitionTo("Stopping").catch(() => {});
    }

    this.stateManager.set("system.ready", false);

    if (this.healthRegistry) {
      this.healthRegistry.setHealth("runtime.kernel", {
        health: "Unavailable",
        readiness: "Not Ready",
        liveness: "Dead",
        startup: "Failed",
        dependencyHealth: "Dependency Unavailable",
        reason: "Shutdown triggered"
      });
    }

    if (this.lifecycleManager) {
      await this.lifecycleManager.transitionTo("Stopped").catch(() => {});
    }
    console.log("[Runtime Kernel] Shutdown complete.");
  }

  private registerServices(): void {
    this.diContainer.registerInstance("IConfigManager", this.configManager);
    this.diContainer.registerInstance("ILifecycleManager", this.lifecycleManager);
    this.diContainer.registerInstance("IHealthRegistry", this.healthRegistry);
    this.diContainer.registerInstance("IStateManager", this.stateManager);
    this.diContainer.registerInstance("IFeatureFlagEngine", this.featureFlagEngine);
    this.diContainer.registerInstance("IRuntimeManifest", this.runtimeManifest);

    // Register Intelligence Layer Infrastructure
    const constitutionLayer = new ConstitutionIntegrationLayer();
    const budgetManager = new ContextBudgetManager();
    const contextEngine = new ContextIntelligenceEngine(budgetManager);
    const memoryEngine = new MemoryEngine();
    const memorySelection = new MemorySelectionEngine(this.diContainer);
    const knowledgeSelection = new KnowledgeSelectionEngine(this.diContainer);
    const learningRegistry = new LearningRegistry();
    const promptCompiler = new PromptCompiler(constitutionLayer);
    const reasoningFramework = new ReasoningFramework(this.diContainer, contextEngine, budgetManager, promptCompiler);

    this.diContainer.registerInstance("IConstitutionIntegrationLayer", constitutionLayer);
    this.diContainer.registerInstance("IContextBudgetManager", budgetManager);
    this.diContainer.registerInstance("IContextIntelligenceEngine", contextEngine);
    this.diContainer.registerInstance("IMemoryEngine", memoryEngine);
    this.diContainer.registerInstance("IMemorySelectionEngine", memorySelection);
    this.diContainer.registerInstance("IKnowledgeSelectionEngine", knowledgeSelection);
    this.diContainer.registerInstance("ILearningRegistry", learningRegistry);
    this.diContainer.registerInstance("IPromptCompiler", promptCompiler);
    this.diContainer.registerInstance("IReasoningFramework", reasoningFramework);

    // Register Execution Layer Infrastructure
    const toolRegistry = new ToolRegistry();
    toolRegistry.registerTool({
      name: "automation_step",
      description: "Executes automation step",
      schema: { type: "object", properties: {} },
      execute: async (context: any, args: any) => {
        const { step, trigger, message, businessId, leadId } = args;
        const prisma = (await import("../../config/prisma")).default;
        const { executionId, flowId } = trigger;

        if (!step) return null;

        if (step.stepType === "MESSAGE" || step.stepType === "SEND_MESSAGE") {
          if (!step.message) return null;
          if (step.nextStep) {
            await prisma.automationExecution.update({
              where: { id: executionId },
              data: { currentStep: step.nextStep },
            });
          } else {
            await prisma.automationExecution.update({
              where: { id: executionId },
              data: { status: "COMPLETED" },
            });
          }
          return step.message;
        }

        if (step.stepType === "CONDITION") {
          const cleanMessage = message.toLowerCase().replace(/[^\w\s]/g, "");
          const condition = step.condition?.toLowerCase().replace(/[^\w\s]/g, "");
          if (!condition) return null;
          const regex = new RegExp(`\\b${condition}\\b`);
          const matched = regex.test(cleanMessage);
          if (!matched) return null;

          const nextStep = await prisma.automationStep.findFirst({
            where: { flowId, stepKey: step.nextStep || "" },
          });
          if (!nextStep) return null;

          await prisma.automationExecution.update({
            where: { id: executionId },
            data: { currentStep: nextStep.stepKey },
          });

          if (nextStep.stepType === "MESSAGE" || nextStep.stepType === "SEND_MESSAGE") {
            return nextStep.message || null;
          }
          return null;
        }

        if (step.stepType === "DELAY") {
          return null;
        }

        if (step.stepType === "END") {
          await prisma.automationExecution.update({
            where: { id: executionId },
            data: { status: "COMPLETED" },
          });
          return null;
        }

        return null;
      }
    });
    const validationEngine = new ValidationEngine();
    const permissionEngine = new PermissionEngine();
    const policyEngine = new PolicyEngine();
    const approvalEngine = new ApprovalEngine();
    const circuitBreaker = new CircuitBreakerEngine();
    const retryManager = new RetryManager();
    const executionTracker = new ExecutionTracker();
    const resourceScheduler = new ResourceScheduler();
    const toolExecutor = new ToolExecutor(
      this.diContainer,
      toolRegistry,
      validationEngine,
      permissionEngine,
      policyEngine,
      approvalEngine,
      executionTracker,
      circuitBreaker,
      retryManager,
      resourceScheduler
    );

    this.diContainer.registerInstance("IToolRegistry", toolRegistry);
    this.diContainer.registerInstance("IValidationEngine", validationEngine);
    this.diContainer.registerInstance("IPermissionEngine", permissionEngine);
    this.diContainer.registerInstance("IPolicyEngine", policyEngine);
    this.diContainer.registerInstance("IApprovalEngine", approvalEngine);
    this.diContainer.registerInstance("ICircuitBreakerEngine", circuitBreaker);
    this.diContainer.registerInstance("IRetryManager", retryManager);
    this.diContainer.registerInstance("IExecutionTracker", executionTracker);
    this.diContainer.registerInstance("IResourceScheduler", resourceScheduler);
    this.diContainer.registerInstance("IToolExecutor", toolExecutor);

    // Register Observability Layer Infrastructure
    const telemetryEngine = new TelemetryEngine();
    const tracingEngine = new TracingEngine();
    const reasoningTraceEngine = new ReasoningTraceEngine();
    const costTracker = new CostTracker();
    const metricsEngine = new MetricsEngine();
    const healthMonitor = new HealthMonitor(this.diContainer);
    const auditEngine = new AuditEngine();
    const eventAnalyticsEngine = new EventAnalyticsEngine();
    const alertEngine = new AlertEngine();
    const observabilityApi = new ObservabilityAPILayer(
      this.diContainer,
      telemetryEngine,
      tracingEngine,
      reasoningTraceEngine,
      costTracker,
      metricsEngine,
      healthMonitor,
      auditEngine,
      alertEngine
    );

    this.diContainer.registerInstance("ITelemetryEngine", telemetryEngine);
    this.diContainer.registerInstance("ITracingEngine", tracingEngine);
    this.diContainer.registerInstance("IReasoningTraceEngine", reasoningTraceEngine);
    this.diContainer.registerInstance("ICostTracker", costTracker);
    this.diContainer.registerInstance("IMetricsEngine", metricsEngine);
    this.diContainer.registerInstance("IHealthMonitor", healthMonitor);
    this.diContainer.registerInstance("IAuditEngine", auditEngine);
    this.diContainer.registerInstance("IEventAnalyticsEngine", eventAnalyticsEngine);
    this.diContainer.registerInstance("IAlertEngine", alertEngine);
    this.diContainer.registerInstance("IObservabilityAPILayer", observabilityApi);

    // Register Sandbox Layer Infrastructure
    const sandboxRuntime = new SandboxRuntime();
    const sandboxMemory = new SandboxMemory();
    const shadowModeManager = new ShadowModeManager();
    const simulationEngine = new SimulationEngine();
    const replayEngine = new ReplayEngine();
    const experimentFramework = new ExperimentFramework();
    const scenarioGenerator = new ScenarioGenerator();
    const safetyEvaluator = new SafetyEvaluator();
    const decisionComparator = new DecisionComparator();
    const certificationEngine = new CertificationEngine();

    this.diContainer.registerInstance("ISandboxManager", sandboxRuntime);
    this.diContainer.registerInstance("ISandboxMemory", sandboxMemory);
    this.diContainer.registerInstance("IShadowModeManager", shadowModeManager);
    this.diContainer.registerInstance("ISimulationEngine", simulationEngine);
    this.diContainer.registerInstance("IReplayEngine", replayEngine);
    this.diContainer.registerInstance("IExperimentFramework", experimentFramework);
    this.diContainer.registerInstance("IScenarioGenerator", scenarioGenerator);
    this.diContainer.registerInstance("ISafetyEvaluator", safetyEvaluator);
    this.diContainer.registerInstance("IDecisionComparator", decisionComparator);
    this.diContainer.registerInstance("ICertificationEngine", certificationEngine);

    // Register Communication Layer Infrastructure
    const capabilityRegistry = new CapabilityRegistry();
    const contractRegistry = new ContractRegistry();
    const correlationEngine = new CorrelationEngine();
    const eventScheduler = new EventScheduler();
    const dlq = new DeadLetterQueue();
    const routingEngine = new RoutingEngine(capabilityRegistry, this.healthRegistry);
    const eventBus = new EventBus(contractRegistry, correlationEngine, eventScheduler, dlq, routingEngine);

    this.diContainer.registerInstance("ICapabilityRegistry", capabilityRegistry);
    this.diContainer.registerInstance("IContractRegistry", contractRegistry);
    this.diContainer.registerInstance("ICorrelationEngine", correlationEngine);
    this.diContainer.registerInstance("IEventScheduler", eventScheduler);
    this.diContainer.registerInstance("IDeadLetterQueue", dlq);
    this.diContainer.registerInstance("IRoutingEngine", routingEngine);
    this.diContainer.registerInstance("IEventBus", eventBus);

    // Register Models Layer Infrastructure
    const modelRegistry = new ModelRegistry();
    const providerRegistry = new ProviderRegistry();
    const modelHealthMonitor = new ModelHealthMonitor();
    const modelRouter = new ModelRouter(modelRegistry, modelHealthMonitor);
    const fallbackManager = new FallbackManager();
    const modelCostManager = new ModelCostManager(modelRegistry);

    // Register all default provider adapters
    providerRegistry.registerProvider({ id: "openai", health: "Healthy", status: "active" }, new OpenAIAdapter({ id: "openai", health: "Healthy", status: "active" }));
    providerRegistry.registerProvider({ id: "anthropic", health: "Healthy", status: "active" }, new AnthropicAdapter({ id: "anthropic", health: "Healthy", status: "active" }));
    providerRegistry.registerProvider({ id: "gemini", health: "Healthy", status: "active" }, new GeminiAdapter({ id: "gemini", health: "Healthy", status: "active" }));
    providerRegistry.registerProvider({ id: "groq", health: "Healthy", status: "active" }, new GroqAdapter({ id: "groq", health: "Healthy", status: "active" }));
    providerRegistry.registerProvider({ id: "openrouter", health: "Healthy", status: "active" }, new OpenRouterAdapter({ id: "openrouter", health: "Healthy", status: "active" }));
    providerRegistry.registerProvider({ id: "ollama", health: "Healthy", status: "active" }, new OllamaAdapter({ id: "ollama", health: "Healthy", status: "active" }));

    const modelManager = new ModelManager(
      modelRegistry,
      providerRegistry,
      modelRouter,
      fallbackManager,
      modelHealthMonitor,
      modelCostManager
    );

    this.diContainer.registerInstance("IModelRegistry", modelRegistry);
    this.diContainer.registerInstance("IProviderRegistry", providerRegistry);
    this.diContainer.registerInstance("IModelRouter", modelRouter);
    this.diContainer.registerInstance("IFallbackManager", fallbackManager);
    this.diContainer.registerInstance("IModelHealthMonitor", modelHealthMonitor);
    this.diContainer.registerInstance("IModelCostManager", modelCostManager);
    this.diContainer.registerInstance("IModelManager", modelManager);
  }
}

export const bootstrapper = new Bootstrapper();
