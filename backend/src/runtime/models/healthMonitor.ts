import { ModelHealthStats } from "./types";
import { HealthMonitorInterface } from "./modelRouter";

export class ModelHealthMonitor implements HealthMonitorInterface {
  private stats = new Map<string, ModelHealthStats>();

  constructor() {}

  /**
   * Logs a successful model call and captures latency metrics.
   */
  public recordSuccess(modelId: string, latencyMs: number): void {
    const stat = this.getOrCreateStats(modelId);
    stat.successes++;
    stat.samples++;
    stat.latencySumMs += latencyMs;
    this.stats.set(modelId, stat);
  }

  /**
   * Logs a failed model call, incrementing failure rates.
   */
  public recordFailure(modelId: string): void {
    const stat = this.getOrCreateStats(modelId);
    stat.failures++;
    stat.samples++;
    stat.lastFailureAt = new Date();
    this.stats.set(modelId, stat);
  }

  /**
   * Computes the average latency of successful model invocations.
   */
  public getAverageLatency(modelId: string): number {
    const stat = this.stats.get(modelId);
    if (!stat || stat.successes === 0) return 0;
    return stat.latencySumMs / stat.successes;
  }

  /**
   * Calculates the current error rate.
   */
  public getErrorRate(modelId: string): number {
    const stat = this.stats.get(modelId);
    if (!stat || stat.samples === 0) return 0;
    return stat.failures / stat.samples;
  }

  /**
   * Checks availability based on error rate thresholds.
   */
  public isAvailable(modelId: string, errorThreshold = 0.5): boolean {
    const errorRate = this.getErrorRate(modelId);
    return errorRate < errorThreshold;
  }

  private getOrCreateStats(modelId: string): ModelHealthStats {
    let stat = this.stats.get(modelId);
    if (!stat) {
      stat = {
        latencySumMs: 0,
        samples: 0,
        failures: 0,
        successes: 0
      };
      this.stats.set(modelId, stat);
    }
    return stat;
  }

  /**
   * Resets collected statistics (for testing).
   */
  public clear(): void {
    this.stats.clear();
  }
}
