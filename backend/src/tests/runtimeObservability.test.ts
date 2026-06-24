import assert from "node:assert/strict";
import { DIContainer } from "../runtime/kernel/diContainer";
import {
  TelemetryEngine,
  TracingEngine,
  ReasoningTraceEngine,
  CostTracker,
  MetricsEngine,
  HealthMonitor,
  AuditEngine,
  EventAnalyticsEngine,
  AlertEngine,
  ObservabilityAPILayer
} from "../runtime/observability";

export const runtimeObservabilityTests: any[] = [
  {
    name: "Telemetry Engine: records metric values and event payloads with tag filtering",
    run: () => {
      const telemetry = new TelemetryEngine();
      
      telemetry.recordMetric("cpu_utilization", 45.2, { host: "server_1" });
      telemetry.recordMetric("cpu_utilization", 88.0, { host: "server_2" });
      telemetry.recordEvent("execution.started", { tool: "fetch" });

      const metrics = telemetry.getMetrics("cpu_utilization", { host: "server_1" });
      assert.equal(metrics.length, 1);
      assert.equal(metrics[0].value, 45.2);

      const events = telemetry.getEvents("execution.started");
      assert.equal(events.length, 1);
      assert.equal(events[0].payload.tool, "fetch");
    }
  },
  {
    name: "Tracing Engine: creates trace spans and builds complete chronological parent-child lineages",
    run: () => {
      const tracing = new TracingEngine();

      const span1 = tracing.startSpan("event_intake");
      const span2 = tracing.startSpan("context_assembly", span1.spanId);
      const span3 = tracing.startSpan("tool_execution", span2.spanId);

      tracing.endSpan(span3.spanId, { status: "success" });
      tracing.endSpan(span2.spanId);
      tracing.endSpan(span1.spanId);

      const lineage = tracing.getTraceLineage(span3.spanId);
      assert.equal(lineage.length, 3);
      assert.equal(lineage[0].name, "event_intake");
      assert.equal(lineage[1].name, "context_assembly");
      assert.equal(lineage[2].name, "tool_execution");
      assert.equal(lineage[2].tags.status, "success");
    }
  },
  {
    name: "Reasoning Trace Engine: sanitizes prompts/completions to satisfy privacy requirements",
    run: async () => {
      // Test strict privacy mode (true)
      const engine = new ReasoningTraceEngine(true);

      const rawLog = {
        executionId: "exec_1",
        traceId: "t1",
        prompt: "System instructions. SecretKey: 12345.",
        completion: JSON.stringify({ intent: "billing", confidence: 0.95, reasoning: "User asking price" }),
        timestamp: new Date()
      };

      await engine.logReasoning(rawLog);
      
      const logs = engine.getLogs();
      assert.equal(logs.length, 1);
      
      // Raw sensitive text must NEVER be stored
      assert.ok(!logs[0].prompt.includes("SecretKey"));
      assert.ok(logs[0].prompt.includes("PII Masked"));
      assert.ok(!logs[0].completion.includes("reasoning"));
      assert.ok(logs[0].completion.includes("PII Masked"));

      // Structured metadata should be stored correctly
      assert.equal(logs[0].intent, "billing");
      assert.equal(logs[0].confidence, 0.95);
    }
  },
  {
    name: "Cost Tracking Engine: records LLM token costs and tool invocation budgets",
    run: async () => {
      const tracker = new CostTracker();

      // Record gpt-4 cost
      const costGpt4 = await tracker.recordCost("tenant_1", "gpt-4", { prompt: 1000, completion: 500 });
      assert.equal(costGpt4, 0.025); // (1000/1000)*0.01 + (500/1000)*0.03 = 0.01 + 0.015 = 0.025

      // Record tool cost
      const costTool = await tracker.recordToolCost("tenant_1", "send_email", 0.05);
      assert.equal(costTool, 0.05);

      const summary = await tracker.getCostSummary("tenant_1", new Date(Date.now() - 1000), new Date(Date.now() + 1000));
      assert.equal(summary, 0.075); // 0.025 + 0.05

      assert.equal(tracker.getTenantTotalCost("tenant_1"), 0.075);
    }
  },
  {
    name: "Metrics Engine: tracks throughput, failure ratios, retry rates and queue sample depths",
    run: () => {
      const metrics = new MetricsEngine();

      metrics.recordExecutionSuccess("t1", "send_msg", 150);
      metrics.recordExecutionSuccess("t1", "send_msg", 250);
      metrics.recordExecutionFailure("t1", "send_msg", 500);
      metrics.recordExecutionRetry("t1", "send_msg");
      metrics.recordQueueDepth("t1", 3);

      const summary = metrics.getMetricsSummary("t1");
      assert.equal(summary.throughput, 3);
      assert.equal(summary.successRate, 2 / 3);
      assert.equal(summary.failureRate, 1 / 3);
      assert.equal(summary.retryRate, 1 / 3);
      assert.equal(summary.averageLatencyMs, 300); // (150 + 250 + 500) / 3 = 300
      assert.equal(summary.averageQueueDepth, 3);
    }
  },
  {
    name: "Health Monitor: evaluates subsystems readiness, process liveness, and core dependencies",
    run: () => {
      const di = new DIContainer();
      const monitor = new HealthMonitor(di);

      // System starts not ready since core services aren't registered
      assert.equal(monitor.checkReadiness(), "Not Ready");
      assert.equal(monitor.checkLiveness(), "Alive");

      const state1 = monitor.aggregateSystemHealth();
      assert.equal(state1.health, "Failed"); // subsystems are missing

      // Register mock interfaces to trigger active status
      di.registerInstance("IConfigManager", {});
      di.registerInstance("ILifecycleManager", {});
      di.registerInstance("IContractRegistry", {});
      di.registerInstance("IConstitutionIntegrationLayer", {});
      di.registerInstance("IMemoryEngine", {});
      di.registerInstance("IToolExecutor", {});
      di.registerInstance("IToolRegistry", {});

      assert.equal(monitor.checkReadiness(), "Ready");
      const state2 = monitor.aggregateSystemHealth();
      assert.equal(state2.health, "Healthy");
    }
  },
  {
    name: "Audit Engine: writes immutable log and applies retention prune cuts",
    run: () => {
      const audit = new AuditEngine();

      audit.logAudit("t1", "tool.execute", "admin_1", { tool: "fetch" });
      audit.logAudit("t2", "tool.execute", "admin_2", { tool: "query" });

      const logs = audit.getAuditHistory("t1");
      assert.equal(logs.length, 1);
      assert.equal(logs[0].userId, "admin_1");
      assert.equal(logs[0].action, "tool.execute");

      // Verify pruning logic
      const now = new Date();
      audit.prune(new Date(now.getTime() + 1000)); // prune everything
      assert.equal(audit.getAuditHistory("t1").length, 0);
    }
  },
  {
    name: "Event Analytics: detects latency/queue bottlenecks and monitors throughput capacity trends",
    run: () => {
      const analytics = new EventAnalyticsEngine();
      const telemetry = new TelemetryEngine();
      const metrics = new MetricsEngine();

      // Latency bottleneck trigger
      metrics.recordExecutionSuccess("t1", "tool", 2500); // 2.5s latency
      const analysis1 = analytics.analyzeBottlenecks(metrics, "t1");
      assert.ok(analysis1.bottlenecks.length > 0);
      assert.ok(analysis1.bottlenecks[0].includes("latency is high"));

      // Throughput trends
      for (let i = 0; i < 110; i++) {
        telemetry.recordEvent("event.processed", {});
      }
      const trend = analytics.analyzeCapacityTrends(telemetry, "event.processed");
      assert.equal(trend.totalVolume, 110);
      assert.ok(trend.capacityTrend.includes("Saturated"));
    }
  },
  {
    name: "Alert Engine: evaluates metric thresholds and logs alert incidents",
    run: () => {
      const alert = new AlertEngine();

      // High failure rate metric evaluation trigger
      const alerts = alert.evaluateRules("t1", { failureRate: 0.2, averageLatencyMs: 500 });
      assert.equal(alerts.length, 1);
      assert.ok(alerts[0].message.includes("rule_high_failure_rate"));

      const activeAlerts = alert.getAlerts("t1", true);
      assert.equal(activeAlerts.length, 1);

      alert.resolveAlert(alerts[0].id);
      assert.equal(alert.getAlerts("t1", true).length, 0);
    }
  },
  {
    name: "Observability API Layer: exposes structured observability queries",
    run: async () => {
      const di = new DIContainer();
      
      const telemetry = new TelemetryEngine();
      const tracing = new TracingEngine();
      const reasoning = new ReasoningTraceEngine();
      const costs = new CostTracker();
      const metrics = new MetricsEngine();
      const health = new HealthMonitor(di);
      const audit = new AuditEngine();
      const alert = new AlertEngine();

      const api = new ObservabilityAPILayer(di, telemetry, tracing, reasoning, costs, metrics, health, audit, alert);

      // Populate metrics
      metrics.recordExecutionSuccess("t1", "tool", 10);
      await costs.recordToolCost("t1", "tool", 0.02);
      audit.logAudit("t1", "run", "u1", {});

      const sum = api.getMetricsSummary("t1");
      assert.equal(sum.throughput, 1);

      const history = api.getAuditHistory("t1");
      assert.equal(history.length, 1);

      const val = await api.getCostSummary("t1");
      assert.equal(val, 0.02);
    }
  }
];
