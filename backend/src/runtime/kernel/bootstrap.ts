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
  EventBus,
  IdentityEngine
} from "../communication";
import { CapabilityRegistry } from "../core/capabilityRegistry";
import { CompatibilityEngine } from "../core/compatibilityMetadata";
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

import {
  StateProjectionEngine,
  PluginRegistry,
  OrganizationGraph
} from "../core/universalCore";
import {
  KnowledgeRuntimePlugin,
  CrmRuntimePlugin,
  ConversationRuntimePlugin,
  GrowthRuntimePlugin,
  SchedulingRuntimePlugin,
  FinanceRuntimePlugin
} from "../core/domainPlugins";
import {
  WorkflowRegistry,
  WorkflowMemory,
  WorkflowObservability,
  WorkflowTriggerEngine,
  WorkflowOrchestrator
} from "../workflow";
import { OigEventIntegrator } from "../oig/eventIntegration";
import {
  RuntimeGovernanceEngine,
  SemanticResolutionLayer,
  DecisionMetadataEngine
} from "../governance";


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
      await this.registerServices();

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

  private async registerServices(): Promise<void> {
    this.diContainer.registerInstance("IConfigManager", this.configManager);
    this.diContainer.registerInstance("ILifecycleManager", this.lifecycleManager);
    this.diContainer.registerInstance("IHealthRegistry", this.healthRegistry);
    this.diContainer.registerInstance("IStateManager", this.stateManager);
    this.diContainer.registerInstance("IFeatureFlagEngine", this.featureFlagEngine);
    this.diContainer.registerInstance("IRuntimeManifest", this.runtimeManifest);

    // Register Compatibility Engine
    const compatibilityEngine = new CompatibilityEngine();
    this.diContainer.registerInstance("ICompatibilityEngine", compatibilityEngine);

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

    const identityEngine = new IdentityEngine();
    this.diContainer.registerInstance("IIdentityEngineInstance", identityEngine);

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

    // ==========================================
    // UNIVERSAL CORE RUNTIME LAYER
    // ==========================================
    const stateProjectionEngine = new StateProjectionEngine();
    const pluginRegistry = new PluginRegistry(this.diContainer);
    const organizationGraph = new OrganizationGraph();

    this.diContainer.registerInstance("IStateProjectionEngine", stateProjectionEngine);
    this.diContainer.registerInstance("IPluginRegistry", pluginRegistry);
    this.diContainer.registerInstance("IOrganizationGraph", organizationGraph);
    this.diContainer.registerInstance("IOrganizationIntelligenceGraph", organizationGraph);

    // Initialize Event-driven Graph Integration (Phase 7)
    const oigEventIntegrator = new OigEventIntegrator(organizationGraph, eventBus, this.diContainer);
    oigEventIntegrator.initialize();

    // Initialize Runtime Governance Engine & Semantic Resolution Layer (Stage 2.9)
    const runtimeGovernanceEngine = new RuntimeGovernanceEngine(this.diContainer, eventBus);
    const semanticResolutionLayer = new SemanticResolutionLayer(organizationGraph);
    const decisionMetadataEngine = new DecisionMetadataEngine(organizationGraph);

    this.diContainer.registerInstance("IRuntimeGovernanceEngine", runtimeGovernanceEngine);
    this.diContainer.registerInstance("ISemanticResolutionLayer", semanticResolutionLayer);
    this.diContainer.registerInstance("IDecisionMetadataEngine", decisionMetadataEngine);

    // ==========================================
    // WORKFLOW RUNTIME LAYER
    // ==========================================
    const workflowRegistry = new WorkflowRegistry();
    const workflowMemory = new WorkflowMemory();
    const workflowObservability = new WorkflowObservability();
    const workflowOrchestrator = new WorkflowOrchestrator(
      this.diContainer,
      workflowRegistry,
      workflowMemory,
      workflowObservability
    );
    const workflowTriggerEngine = new WorkflowTriggerEngine(
      workflowRegistry,
      workflowMemory,
      workflowOrchestrator,
      eventBus
    );

    this.diContainer.registerInstance("IWorkflowRegistry", workflowRegistry);
    this.diContainer.registerInstance("IWorkflowMemory", workflowMemory);
    this.diContainer.registerInstance("IWorkflowObservability", workflowObservability);
    this.diContainer.registerInstance("IWorkflowOrchestrator", workflowOrchestrator);
    this.diContainer.registerInstance("IWorkflowTriggerEngine", workflowTriggerEngine);

    // Auto-wiring trigger dynamic eventbus subscriptions
    const originalRegisterWorkflow = workflowRegistry.registerWorkflow.bind(workflowRegistry);
    workflowRegistry.registerWorkflow = async (definition) => {
      await originalRegisterWorkflow(definition);
      for (const trigger of definition.triggers) {
        if (trigger.type === "event" && trigger.topic) {
          eventBus.subscribe(trigger.topic, async (envelope: any) => {
            const payload = envelope?.payload || envelope || {};
            await workflowTriggerEngine.handleEvent(trigger.topic!, payload);
          });
        }
      }
    };


    // Register all Domain specializations as plugins
    await pluginRegistry.registerPlugin(new KnowledgeRuntimePlugin());
    await pluginRegistry.registerPlugin(new CrmRuntimePlugin());
    await pluginRegistry.registerPlugin(new ConversationRuntimePlugin());
    await pluginRegistry.registerPlugin(new GrowthRuntimePlugin());
    await pluginRegistry.registerPlugin(new SchedulingRuntimePlugin());
    await pluginRegistry.registerPlugin(new FinanceRuntimePlugin());
  }
}

export const bootstrapper = new Bootstrapper();
