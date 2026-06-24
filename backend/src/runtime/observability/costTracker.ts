import { ICostTracker } from "../interfaces/observability";
import { CostEntry } from "./types";

export class CostTracker implements ICostTracker {
  private costs: CostEntry[] = [];

  constructor() {}

  /**
   * Records cost computed from LLM prompt and completion token counts.
   * Pricing profiles are model-specific (e.g. gpt-4 vs gpt-3.5-turbo).
   */
  public async recordCost(
    businessId: string,
    model: string,
    tokens: { prompt: number; completion: number }
  ): Promise<number> {
    let inputRatePer1k = 0.0015;
    let outputRatePer1k = 0.002;

    const lowerModel = model.toLowerCase();
    if (lowerModel.includes("gpt-4") || lowerModel.includes("claude-3")) {
      inputRatePer1k = 0.01;
      outputRatePer1k = 0.03;
    } else if (lowerModel.includes("groq") || lowerModel.includes("llama")) {
      inputRatePer1k = 0.0005;
      outputRatePer1k = 0.001;
    }

    const promptCost = (tokens.prompt / 1000) * inputRatePer1k;
    const completionCost = (tokens.completion / 1000) * outputRatePer1k;
    const totalCost = Math.round((promptCost + completionCost) * 1000000) / 1000000;

    const entry: CostEntry = {
      id: `cost_${businessId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenantId: businessId,
      type: "llm",
      modelName: model,
      costInUsd: totalCost,
      timestamp: new Date(),
      metadata: { tokens }
    };

    this.costs.push(entry);
    return totalCost;
  }

  /**
   * Logs a tool execution cost entry (e.g. static utility call charges).
   */
  public async recordToolCost(
    businessId: string,
    toolName: string,
    customCost = 0.01
  ): Promise<number> {
    const entry: CostEntry = {
      id: `cost_${businessId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenantId: businessId,
      type: "tool",
      toolName,
      costInUsd: customCost,
      timestamp: new Date()
    };

    this.costs.push(entry);
    return customCost;
  }

  /**
   * Resolves aggregate costs for a tenant within a specific date timeframe.
   */
  public async getCostSummary(businessId: string, start: Date, end: Date): Promise<number> {
    const startTime = start.getTime();
    const endTime = end.getTime();

    const sum = this.costs
      .filter(c => c.tenantId === businessId && c.timestamp.getTime() >= startTime && c.timestamp.getTime() <= endTime)
      .reduce((s, c) => s + c.costInUsd, 0);
    return Math.round(sum * 1000000) / 1000000;
  }

  /**
   * Resolves absolute cost sum for a single tenant.
   */
  public getTenantTotalCost(businessId: string): number {
    const sum = this.costs
      .filter(c => c.tenantId === businessId)
      .reduce((s, c) => s + c.costInUsd, 0);
    return Math.round(sum * 1000000) / 1000000;
  }

  /**
   * Resolves absolute cost sum for the whole system.
   */
  public getRuntimeTotalCost(): number {
    const sum = this.costs.reduce((s, c) => s + c.costInUsd, 0);
    return Math.round(sum * 1000000) / 1000000;
  }


  /**
   * Clears cost array (for testing).
   */
  public clear(): void {
    this.costs = [];
  }
}
