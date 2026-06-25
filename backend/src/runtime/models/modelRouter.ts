import { ModelRegistry } from "./modelRegistry";

export interface HealthMonitorInterface {
  getAverageLatency(modelId: string): number;
}

export class ModelRouter {
  private registry: ModelRegistry;
  private healthMonitor?: HealthMonitorInterface;

  constructor(registry: ModelRegistry, healthMonitor?: HealthMonitorInterface) {
    this.registry = registry;
    this.healthMonitor = healthMonitor;
  }

  /**
   * Routes a request to the best model ID based on the capability and strategy requested.
   */
  public route(
    capability: "chat" | "completion" | "embedding" | "classification" | "vision",
    strategy: "cheapest" | "fastest" | "premium" = "cheapest"
  ): string {
    const models = this.registry.listModels().filter(m => m.capabilities.includes(capability));
    if (models.length === 0) {
      throw new Error(`No models registered with capability: [${capability}].`);
    }

    if (strategy === "cheapest") {
      const cheapest = this.registry.getCheapestModel(capability);
      if (cheapest) return cheapest.id;
    }

    if (strategy === "fastest" && this.healthMonitor) {
      let fastestId = models[0].id;
      let minLatency = Infinity;

      for (const m of models) {
        const avg = this.healthMonitor.getAverageLatency(m.id);
        if (avg > 0 && avg < minLatency) {
          minLatency = avg;
          fastestId = m.id;
        }
      }
      return fastestId;
    }

    if (strategy === "premium") {
      // Find models with higher costs/limits representing premium services
      const premiums = models.filter(m => m.id.includes("gpt-4") || m.id.includes("claude-3-5") || m.id.includes("pro"));
      if (premiums.length > 0) {
        return premiums[0].id;
      }
    }

    // Default fallback to first matching capability model
    return models[0].id;
  }
}
