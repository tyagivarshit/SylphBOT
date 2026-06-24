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
  }
}

export const bootstrapper = new Bootstrapper();
