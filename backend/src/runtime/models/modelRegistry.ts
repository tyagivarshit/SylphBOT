import { ModelMetadata } from "./types";

export class ModelRegistry {
  private models = new Map<string, ModelMetadata>();

  constructor() {
    // Pre-populate registry with standard models metadata (completely business-agnostic)
    this.registerModel({
      id: "gpt-4o",
      name: "OpenAI GPT-4o",
      provider: "openai",
      contextLimit: 128000,
      inputCostPer1k: 0.005,
      outputCostPer1k: 0.015,
      capabilities: ["chat", "completion", "vision"],
      version: "2024-05-13"
    });

    this.registerModel({
      id: "claude-3-5-sonnet",
      name: "Anthropic Claude 3.5 Sonnet",
      provider: "anthropic",
      contextLimit: 200000,
      inputCostPer1k: 0.003,
      outputCostPer1k: 0.015,
      capabilities: ["chat", "completion", "vision"],
      version: "2024-06-20"
    });

    this.registerModel({
      id: "gemini-1.5-pro",
      name: "Google Gemini 1.5 Pro",
      provider: "gemini",
      contextLimit: 1048576,
      inputCostPer1k: 0.007,
      outputCostPer1k: 0.021,
      capabilities: ["chat", "completion", "embedding", "vision"],
      version: "1.5-pro"
    });

    this.registerModel({
      id: "text-embedding-3-small",
      name: "OpenAI text-embedding-3-small",
      provider: "openai",
      contextLimit: 8191,
      inputCostPer1k: 0.00002,
      outputCostPer1k: 0,
      capabilities: ["embedding"],
      version: "3-small"
    });

    this.registerModel({
      id: "llama3-70b-8192",
      name: "Groq LLaMA3 70B",
      provider: "groq",
      contextLimit: 8192,
      inputCostPer1k: 0.00059,
      outputCostPer1k: 0.00079,
      capabilities: ["chat", "completion", "classification"],
      version: "8192"
    });
  }

  /**
   * Register a new model's metadata into the registry.
   */
  public registerModel(model: ModelMetadata): void {
    if (this.models.has(model.id)) {
      throw new Error(`Model [${model.id}] is already registered in registry.`);
    }
    this.models.set(model.id, model);
  }

  /**
   * Retrieves a model's metadata by its ID.
   */
  public getModel(modelId: string): ModelMetadata | null {
    return this.models.get(modelId) || null;
  }

  /**
   * Lists all currently registered models.
   */
  public listModels(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  /**
   * Utility: gets the cheapest model matching the requested capability
   */
  public getCheapestModel(capability: "chat" | "completion" | "embedding" | "classification" | "vision"): ModelMetadata | null {
    let cheapest: ModelMetadata | null = null;
    let minCost = Infinity;

    for (const model of this.models.values()) {
      if (model.capabilities.includes(capability)) {
        const cost = model.inputCostPer1k + model.outputCostPer1k;
        if (cost < minCost) {
          minCost = cost;
          cheapest = model;
        }
      }
    }

    return cheapest;
  }
}
