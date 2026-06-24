import { TelemetryEngine } from "./telemetryEngine";
import { MetricsEngine } from "./metricsEngine";

export class EventAnalyticsEngine {
  constructor() {}

  /**
   * Identifies performance bottlenecks and tool latency spikes.
   */
  public analyzeBottlenecks(
    metricsEngine: MetricsEngine,
    tenantId: string
  ): { bottlenecks: string[]; recommendations: string[] } {
    const bottlenecks: string[] = [];
    const recommendations: string[] = [];

    const summary = metricsEngine.getMetricsSummary(tenantId);
    
    // Bottleneck trigger logic: latency > 1000ms
    if (summary.averageLatencyMs > 1000) {
      bottlenecks.push(`Average tool execution latency is high: ${summary.averageLatencyMs.toFixed(0)}ms`);
      recommendations.push("Consider increasing resource scheduler concurrency pool slots.");
    }

    // Failure rate trigger logic: failureRate > 15%
    if (summary.failureRate > 0.15) {
      bottlenecks.push(`Subsystem failure rate is high: ${(summary.failureRate * 100).toFixed(0)}%`);
      recommendations.push("Ensure circuit breakers recovery windows are properly calibrated.");
    }

    // Queue backlog check
    if (summary.averageQueueDepth > 5) {
      bottlenecks.push(`Scheduler queues are backlogged: average size ${summary.averageQueueDepth.toFixed(1)}`);
      recommendations.push("Optimize tenant fairness scheduler quotas or deploy more active workers.");
    }

    return { bottlenecks, recommendations };
  }

  /**
   * Tracks capacity trends and event patterns.
   */
  public analyzeCapacityTrends(
    telemetryEngine: TelemetryEngine,
    eventName = "event.processed"
  ): { totalVolume: number; capacityTrend: string } {
    const events = telemetryEngine.getEvents(eventName);
    const volume = events.length;

    let trend = "Stable";
    if (volume > 100) {
      trend = "Saturated (High event volume processed recently)";
    } else if (volume > 20) {
      trend = "Increasing (Moderate demand)";
    } else {
      trend = "Idle (Low demand)";
    }

    return {
      totalVolume: volume,
      capacityTrend: trend
    };
  }
}
