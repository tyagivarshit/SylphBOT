import { IWorkflowObservability } from "../interfaces/workflow";

export interface WorkflowMetric {
  instanceId: string;
  metricName: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: Date;
}

export class WorkflowObservability implements IWorkflowObservability {
  private metrics: WorkflowMetric[] = [];

  public recordMetrics(instanceId: string, metricName: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      instanceId,
      metricName,
      value,
      tags,
      timestamp: new Date()
    });
  }

  public async getMetrics(criteria?: Record<string, any>): Promise<any> {
    let filtered = [...this.metrics];
    if (criteria) {
      if (criteria.metricName) {
        filtered = filtered.filter(m => m.metricName === criteria.metricName);
      }
      if (criteria.instanceId) {
        filtered = filtered.filter(m => m.instanceId === criteria.instanceId);
      }
    }

    const total = filtered.length;
    const latencyMetrics = filtered.filter(m => m.metricName === "latency");
    const failureMetrics = filtered.filter(m => m.metricName === "failure");
    const successMetrics = filtered.filter(m => m.metricName === "success");
    const retryMetrics = filtered.filter(m => m.metricName === "retry");
    const timeoutMetrics = filtered.filter(m => m.metricName === "timeout");

    const averageLatency = latencyMetrics.length > 0
      ? latencyMetrics.reduce((sum, m) => sum + m.value, 0) / latencyMetrics.length
      : 0;

    const totalSuccess = successMetrics.length;
    const totalFailure = failureMetrics.length;
    const totalRetries = retryMetrics.reduce((sum, m) => sum + m.value, 0);
    const totalTimeouts = timeoutMetrics.length;

    const throughput = totalSuccess + totalFailure;
    const successRate = throughput > 0 ? totalSuccess / throughput : 1.0;

    // Queue depth tracking based on running vs queued instances
    const activeInstances = new Set(filtered.map(m => m.instanceId));
    const queueDepth = Math.max(0, activeInstances.size - totalSuccess - totalFailure);

    return {
      throughput,
      successRate,
      failureRate: throughput > 0 ? totalFailure / throughput : 0.0,
      averageLatencyMs: averageLatency,
      totalSuccess,
      totalFailure,
      totalRetries,
      totalTimeouts,
      queueDepth
    };
  }

  public resetMetrics(): void {
    this.metrics = [];
  }
}
