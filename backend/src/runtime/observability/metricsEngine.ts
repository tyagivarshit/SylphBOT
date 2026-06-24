interface ToolMetricsState {
  successes: number;
  failures: number;
  retries: number;
  latencySum: number;
  latencySamples: number;
}

export class MetricsEngine {
  // Key format: `${tenantId}:${toolName}`
  private toolMetrics = new Map<string, ToolMetricsState>();
  private queueDepths = new Map<string, number[]>();

  constructor() {}

  /**
   * Logs a successful tool run event with latency info.
   */
  public recordExecutionSuccess(tenantId: string, toolName: string, latencyMs: number): void {
    const key = `${tenantId}:${toolName}`;
    const state = this.getOrCreateState(key);

    state.successes++;
    state.latencySum += latencyMs;
    state.latencySamples++;

    this.toolMetrics.set(key, state);
  }

  /**
   * Logs a failed tool run event.
   */
  public recordExecutionFailure(tenantId: string, toolName: string, latencyMs: number): void {
    const key = `${tenantId}:${toolName}`;
    const state = this.getOrCreateState(key);

    state.failures++;
    state.latencySum += latencyMs;
    state.latencySamples++;

    this.toolMetrics.set(key, state);
  }

  /**
   * Logs a tool retry event.
   */
  public recordExecutionRetry(tenantId: string, toolName: string): void {
    const key = `${tenantId}:${toolName}`;
    const state = this.getOrCreateState(key);

    state.retries++;
    this.toolMetrics.set(key, state);
  }

  /**
   * Logs worker queue depth status.
   */
  public recordQueueDepth(tenantId: string, depth: number): void {
    const depths = this.queueDepths.get(tenantId) || [];
    depths.push(depth);
    if (depths.length > 100) depths.shift(); // retain last 100 queue depth metrics
    this.queueDepths.set(tenantId, depths);
  }

  /**
   * Resolves aggregated metrics ratios and throughput limits for a tenant.
   */
  public getMetricsSummary(tenantId: string): Record<string, number> {
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalRetries = 0;
    let latencySum = 0;
    let latencySamples = 0;

    for (const [key, state] of this.toolMetrics.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        totalSuccesses += state.successes;
        totalFailures += state.failures;
        totalRetries += state.retries;
        latencySum += state.latencySum;
        latencySamples += state.latencySamples;
      }
    }

    const throughput = totalSuccesses + totalFailures;
    const successRate = throughput > 0 ? totalSuccesses / throughput : 1.0;
    const failureRate = throughput > 0 ? totalFailures / throughput : 0.0;
    const retryRate = throughput > 0 ? totalRetries / throughput : 0.0;
    const averageLatencyMs = latencySamples > 0 ? latencySum / latencySamples : 0;

    const depths = this.queueDepths.get(tenantId) || [];
    const averageQueueDepth = depths.length > 0 
      ? depths.reduce((sum, d) => sum + d, 0) / depths.length 
      : 0;

    return {
      throughput,
      successRate,
      failureRate,
      retryRate,
      averageLatencyMs,
      averageQueueDepth
    };
  }

  private getOrCreateState(key: string): ToolMetricsState {
    let state = this.toolMetrics.get(key);
    if (!state) {
      state = {
        successes: 0,
        failures: 0,
        retries: 0,
        latencySum: 0,
        latencySamples: 0
      };
      this.toolMetrics.set(key, state);
    }
    return state;
  }

  /**
   * Resets internal metrics counters (for testing).
   */
  public clear(): void {
    this.toolMetrics.clear();
    this.queueDepths.clear();
  }
}
