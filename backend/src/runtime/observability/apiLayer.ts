import { TelemetryEngine } from "./telemetryEngine";
import { TracingEngine } from "./tracingEngine";
import { ReasoningTraceEngine } from "./reasoningTraceEngine";
import { CostTracker } from "./costTracker";
import { MetricsEngine } from "./metricsEngine";
import { HealthMonitor } from "./healthMonitor";
import { AuditEngine } from "./auditEngine";
import { AlertEngine } from "./alertEngine";
import { TracingSpan } from "../interfaces/observability";
import { SanitizedReasoningLog, AuditRecord, SystemHealthStatus, AlertRecord } from "./types";
import { DIContainer, container } from "../kernel/diContainer";


export class ObservabilityAPILayer {
  private diContainer: DIContainer;
  private telemetry: TelemetryEngine;
  private tracing: TracingEngine;
  private reasoningLogger: ReasoningTraceEngine;
  private costTracker: CostTracker;
  private metrics: MetricsEngine;
  private healthMonitor: HealthMonitor;
  private auditEngine: AuditEngine;
  private alertEngine: AlertEngine;

  constructor(
    diContainer: DIContainer = container,
    telemetry = new TelemetryEngine(),
    tracing = new TracingEngine(),
    reasoningLogger = new ReasoningTraceEngine(),
    costTracker = new CostTracker(),
    metrics = new MetricsEngine(),
    healthMonitor = new HealthMonitor(),
    auditEngine = new AuditEngine(),
    alertEngine = new AlertEngine()
  ) {
    this.diContainer = diContainer;
    this.telemetry = telemetry;
    this.tracing = tracing;
    this.reasoningLogger = reasoningLogger;
    this.costTracker = costTracker;
    this.metrics = metrics;
    this.healthMonitor = healthMonitor;
    this.auditEngine = auditEngine;
    this.alertEngine = alertEngine;
  }

  /**
   * Resolves aggregated metrics ratios for a tenant boundary.
   */
  public getMetricsSummary(tenantId: string): Record<string, number> {
    return this.metrics.getMetricsSummary(tenantId);
  }

  /**
   * Resolves full parent-child trace lineages for debugging.
   */
  public getTraceLineage(spanId: string): any[] {
    return this.tracing.getTraceLineage(spanId);
  }

  /**
   * Resolves privacy-compliant reasoning logs.
   */
  public getReasoningLogs(filter?: { intent?: string; minConfidence?: number }): SanitizedReasoningLog[] {
    return this.reasoningLogger.getLogs(filter);
  }

  /**
   * Resolves tenant action audits history.
   */
  public getAuditHistory(tenantId: string): AuditRecord[] {
    return this.auditEngine.getAuditHistory(tenantId);
  }

  /**
   * Retrieves aggregated system health readiness/liveness.
   */
  public getSystemHealth(): SystemHealthStatus {
    return this.healthMonitor.aggregateSystemHealth();
  }

  /**
   * Retrieves aggregate costs in USD.
   */
  public async getCostSummary(tenantId: string, start?: Date, end?: Date): Promise<number> {
    const s = start || new Date(Date.now() - 30 * 24 * 3600 * 1000); // default last 30d
    const e = end || new Date();
    return this.costTracker.getCostSummary(tenantId, s, e);
  }

  /**
   * Resolves currently unresolved alerts for a tenant.
   */
  public getActiveAlerts(tenantId: string): AlertRecord[] {
    return this.alertEngine.getAlerts(tenantId, true);
  }

  /**
   * Evaluates alerts trigger rules against current metrics state.
   */
  public runAlertEvaluation(tenantId: string): AlertRecord[] {
    const summary = this.getMetricsSummary(tenantId);
    const tenantCost = this.costTracker.getTenantTotalCost(tenantId);
    return this.alertEngine.evaluateRules(tenantId, summary, tenantCost);
  }
}
