import { IShadowModeManager } from "../interfaces/sandbox";
import { MessageDTO, CompletionResult } from "../interfaces/core";
import { DecisionComparator } from "./decisionComparator";

export class ShadowModeManager implements IShadowModeManager {
  private comparator: DecisionComparator;
  private shadowEvaluations: Array<{
    businessId: string;
    productionOutput: string;
    shadowOutput: string;
    similarityScore: number;
    intentMatch: boolean;
    timestamp: Date;
  }> = [];

  constructor(comparator = new DecisionComparator()) {
    this.comparator = comparator;
  }

  /**
   * Runs a side-effect-free shadow completion and compares it against production outcomes.
   * Ensures that shadow actions are NEVER committed to production.
   */
  public async runShadowCompletion(
    businessId: string,
    messages: MessageDTO[],
    activeResult: CompletionResult
  ): Promise<void> {
    if (!messages || messages.length === 0 || !activeResult) return;

    // Simulate shadow completion generation (e.g., calling a variant model configuration)
    const shadowOutput = activeResult.content.includes("billing") 
      ? "Execute billing workflow and invoice check"
      : activeResult.content; // fallback/mock matching active result

    // Execute decision comparison
    const comparison = this.comparator.compare(activeResult.content, shadowOutput);

    this.shadowEvaluations.push({
      businessId,
      productionOutput: activeResult.content,
      shadowOutput,
      similarityScore: comparison.similarityScore,
      intentMatch: comparison.intentMatch,
      timestamp: new Date()
    });
  }

  /**
   * Retrieves evaluation logs.
   */
  public getEvaluations(): any[] {
    return this.shadowEvaluations;
  }

  /**
   * Resets evaluation logs.
   */
  public clear(): void {
    this.shadowEvaluations = [];
  }
}
