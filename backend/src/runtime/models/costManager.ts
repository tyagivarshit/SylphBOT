import { ModelRegistry } from "./modelRegistry";

export interface CostRecord {
  timestamp: Date;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  promptCost: number;
  completionCost: number;
  totalCost: number;
}

export class ModelCostManager {
  private registry: ModelRegistry;
  private totalSpentUsd: number = 0;
  private budgetLimitUsd: number = 100.0; // default budget limit of $100
  private records: CostRecord[] = [];

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  /**
   * Tracks and calculates the cost of a request based on model metadata.
   */
  public recordUsage(
    modelId: string,
    promptTokens: number,
    completionTokens: number
  ): CostRecord {
    const metadata = this.registry.getModel(modelId);
    
    // Default prices per 1k tokens if model isn't registered
    const inputCostPer1k = metadata ? metadata.inputCostPer1k : 0.0015;
    const outputCostPer1k = metadata ? metadata.outputCostPer1k : 0.002;

    const promptCost = (promptTokens / 1000) * inputCostPer1k;
    const completionCost = (completionTokens / 1000) * outputCostPer1k;
    const totalCost = promptCost + completionCost;

    const record: CostRecord = {
      timestamp: new Date(),
      modelId,
      promptTokens,
      completionTokens,
      promptCost,
      completionCost,
      totalCost
    };

    this.records.push(record);
    this.totalSpentUsd += totalCost;

    return record;
  }

  /**
   * Returns total budget spent so far.
   */
  public getTotalSpent(): number {
    return this.totalSpentUsd;
  }

  /**
   * Sets budget limit.
   */
  public setBudgetLimit(limitUsd: number): void {
    this.budgetLimitUsd = limitUsd;
  }

  /**
   * Returns budget limit.
   */
  public getBudgetLimit(): number {
    return this.budgetLimitUsd;
  }

  /**
   * Returns whether the budget limit has been exceeded.
   */
  public isBudgetExceeded(): boolean {
    return this.totalSpentUsd >= this.budgetLimitUsd;
  }

  /**
   * Retrieves all logged cost records.
   */
  public getCostRecords(): CostRecord[] {
    return this.records;
  }

  /**
   * Clears accumulated cost tracking (useful for testing/resets).
   */
  public clear(): void {
    this.totalSpentUsd = 0;
    this.records = [];
  }
}
