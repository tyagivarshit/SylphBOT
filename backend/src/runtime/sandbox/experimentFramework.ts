import { ExperimentVariant } from "./types";

export class ExperimentFramework {
  // Key format: experimentId
  private experiments = new Map<string, ExperimentVariant[]>();

  constructor() {}

  /**
   * Registers an A/B testing experiment with variants.
   */
  public registerExperiment(experimentId: string, variants: ExperimentVariant[]): void {
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(`Experiment [${experimentId}] variants weight sum must equal 1.0. Current: ${totalWeight}`);
    }
    this.experiments.set(experimentId, variants);
  }

  /**
   * Randomly allocates traffic to a variant based on configured weights.
   */
  public allocateTraffic(experimentId: string): string {
    const variants = this.experiments.get(experimentId);
    if (!variants || variants.length === 0) {
      throw new Error(`Experiment [${experimentId}] not found.`);
    }

    const rand = Math.random();
    let cumulativeWeight = 0;

    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (rand <= cumulativeWeight) {
        return variant.variantId;
      }
    }

    return variants[variants.length - 1].variantId; // Fallback to last
  }

  /**
   * Measures performance of a variant outcome.
   */
  public recordOutcome(
    experimentId: string,
    variantId: string,
    success: boolean,
    latencyMs: number,
    costUsd = 0.002
  ): void {
    const variants = this.experiments.get(experimentId);
    if (!variants) return;

    const variant = variants.find(v => v.variantId === variantId);
    if (!variant) return;

    variant.metrics.invocations++;
    if (success) {
      variant.metrics.successes++;
    }
    variant.metrics.latencyMsSum += latencyMs;
    variant.metrics.estimatedCostUsd += costUsd;

    this.experiments.set(experimentId, variants);
  }

  /**
   * Compares the success rates and average latencies of variants.
   */
  public evaluateExperiment(experimentId: string): Record<string, { successRate: number; avgLatencyMs: number; totalCost: number }> {
    const variants = this.experiments.get(experimentId);
    if (!variants) return {};

    const summary: Record<string, { successRate: number; avgLatencyMs: number; totalCost: number }> = {};
    for (const v of variants) {
      const successRate = v.metrics.invocations > 0 ? v.metrics.successes / v.metrics.invocations : 0.0;
      const avgLatencyMs = v.metrics.invocations > 0 ? v.metrics.latencyMsSum / v.metrics.invocations : 0.0;
      summary[v.variantId] = {
        successRate,
        avgLatencyMs,
        totalCost: v.metrics.estimatedCostUsd
      };
    }

    return summary;
  }
}
