import { IModelManager, MessageDTO, CompletionResult, CompletionOptions } from "../interfaces/core";
import { ModelRegistry } from "./modelRegistry";
import { ProviderRegistry } from "./providerRegistry";
import { ModelRouter } from "./modelRouter";
import { FallbackManager } from "./fallbackManager";
import { ModelHealthMonitor } from "./healthMonitor";
import { ModelCostManager } from "./costManager";
import { RuntimeGuard } from "../kernel/runtimeGuard";

export class ModelManager implements IModelManager {
  private modelRegistry: ModelRegistry;
  private providerRegistry: ProviderRegistry;
  private router: ModelRouter;
  private fallbackManager: FallbackManager;
  private healthMonitor: ModelHealthMonitor;
  private costManager: ModelCostManager;

  constructor(
    modelRegistry: ModelRegistry,
    providerRegistry: ProviderRegistry,
    router: ModelRouter,
    fallbackManager: FallbackManager,
    healthMonitor: ModelHealthMonitor,
    costManager: ModelCostManager
  ) {
    this.modelRegistry = modelRegistry;
    this.providerRegistry = providerRegistry;
    this.router = router;
    this.fallbackManager = fallbackManager;
    this.healthMonitor = healthMonitor;
    this.costManager = costManager;
  }

  /**
   * Implements generateCompletion as required by the IModelManager interface.
   * Leverages fallback manager, health monitor, and cost manager.
   */
  public async generateCompletion(
    messages: MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    // 1. Enforce budget limits
    if (this.costManager.isBudgetExceeded()) {
      throw new Error(`[Model Manager] Operations blocked: model cost budget limit exceeded.`);
    }

    // 2. Select model or route dynamically if options.model is not specified
    let primaryModelId = options?.model;
    if (!primaryModelId) {
      // Determine routing strategy based on options (e.g. default to cheapest)
      // We can map option settings or temperature to strategy
      const strategy = options?.temperature && options.temperature < 0.3 ? "fastest" : "cheapest";
      primaryModelId = this.router.route("chat", strategy);
    }

    RuntimeGuard.enforceModelAccess(primaryModelId);

    // Verify model exists in registry
    const metadata = this.modelRegistry.getModel(primaryModelId);
    if (!metadata) {
      throw new Error(`Model [${primaryModelId}] not found in registry.`);
    }

    // 3. Define the actual task execution callback for failover
    const executeTask = async (modelId: string): Promise<CompletionResult> => {
      const modelMeta = this.modelRegistry.getModel(modelId);
      if (!modelMeta) {
        throw new Error(`Model [${modelId}] metadata missing.`);
      }

      const adapter = this.providerRegistry.getAdapter(modelMeta.provider);
      if (!adapter) {
        throw new Error(`No adapter found for provider [${modelMeta.provider}] for model [${modelId}].`);
      }

      const start = Date.now();
      try {
        const result = await adapter.generateCompletion(modelId, messages, options);
        const duration = Date.now() - start;

        // Record health metrics
        this.healthMonitor.recordSuccess(modelId, duration);

        // Record cost usage
        if (result.tokensUsed) {
          this.costManager.recordUsage(
            modelId,
            result.tokensUsed.prompt,
            result.tokensUsed.completion
          );
        }

        return result;
      } catch (error) {
        this.healthMonitor.recordFailure(modelId);
        throw error;
      }
    };

    // 4. Run through fallback chains with automatic failover
    return this.fallbackManager.executeWithFailover(
      primaryModelId,
      executeTask,
      (modelId) => this.healthMonitor.isAvailable(modelId)
    );
  }

  /**
   * Universal generate call for text or messages inputs.
   */
  public async generate(
    prompt: string | MessageDTO[],
    options?: CompletionOptions
  ): Promise<CompletionResult> {
    const messages: MessageDTO[] = typeof prompt === "string"
      ? [{ role: "user", content: prompt }]
      : prompt;
    return this.generateCompletion(messages, options);
  }

  /**
   * Universal embedding generator.
   */
  public async embed(
    text: string,
    options?: { model?: string }
  ): Promise<number[]> {
    const modelId = options?.model || this.router.route("embedding", "cheapest");
    RuntimeGuard.enforceModelAccess(modelId);
    const modelMeta = this.modelRegistry.getModel(modelId);
    if (!modelMeta) {
      throw new Error(`Model [${modelId}] not found in registry.`);
    }

    const adapter = this.providerRegistry.getAdapter(modelMeta.provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider [${modelMeta.provider}].`);
    }

    const start = Date.now();
    try {
      const vector = await adapter.getEmbedding(modelId, text);
      const duration = Date.now() - start;
      this.healthMonitor.recordSuccess(modelId, duration);
      // Track nominal/flat costs for embedding requests if applicable
      this.costManager.recordUsage(modelId, text.length / 4, 0); // 1 token approx 4 characters
      return vector;
    } catch (error) {
      this.healthMonitor.recordFailure(modelId);
      throw error;
    }
  }

  /**
   * Universal classifier (direct classification syntax).
   */
  public async classify(
    text: string,
    categories: string[],
    options?: { model?: string }
  ): Promise<string> {
    const modelId = options?.model || this.router.route("classification", "cheapest");
    
    const messages: MessageDTO[] = [
      {
        role: "system",
        content: `You are an accurate classifier. Classify the input text into exactly one of these categories: [${categories.join(", ")}]. Output ONLY the category name and nothing else.`
      },
      {
        role: roleHelper(modelId),
        content: text
      }
    ];

    const result = await this.generateCompletion(messages, {
      model: modelId,
      temperature: 0.0,
      maxTokens: 50
    });

    const output = result.content.trim();
    // Validate output matches one of the categories or fallback to first
    const matched = categories.find(c => output.toLowerCase().includes(c.toLowerCase()));
    return matched || categories[0];
  }
}

function roleHelper(modelId: string): "user" | "system" | "assistant" {
  return "user";
}
