export class RuntimeMetricsCollector {
  public pipelineExecutionCount: number = 0;
  public successfulPipelines: number = 0;
  public failedPipelines: number = 0;
  public recoveredPipelines: number = 0;
  public totalPipelineDurationMs: number = 0;
  public totalEngineDurationMs: number = 0;
  public engineExecutionCount: number = 0;
  public retryCount: number = 0;
  public skippedEngineCount: number = 0;
  public recoveryCount: number = 0;
  public terminationCount: number = 0;

  public getAveragePipelineDuration(): number {
    return this.pipelineExecutionCount > 0 ? this.totalPipelineDurationMs / this.pipelineExecutionCount : 0;
  }

  public getAverageEngineDuration(): number {
    return this.engineExecutionCount > 0 ? this.totalEngineDurationMs / this.engineExecutionCount : 0;
  }
}

export interface TraceChainNode {
  correlationId: string;
  traceId: string;
  pipelineExecutionId: string;
  tenantId: string;
  workspaceId: string;
  currentEngine: string;
  previousEngine: string | null;
  nextEngine: string | null;
  executionSequence: number;
  failureEvents: string[];
  recoveryEvents: string[];
  terminationEvents: string[];
}

export class RuntimeTraceCollector {
  private chains: TraceChainNode[] = [];

  public addNode(node: TraceChainNode): void {
    this.chains.push(JSON.parse(JSON.stringify(node)));
  }

  public getChains(): TraceChainNode[] {
    return this.chains;
  }
}

export interface DiagnosticEvent {
  category: "Warning" | "Error" | "Recovery" | "Validation" | "Security" | "Performance" | "Configuration" | "Dependency" | "Timeout";
  message: string;
  timestamp: Date;
  origin: string;
}

export class RuntimeDiagnosticsCollector {
  private events: DiagnosticEvent[] = [];

  public addEvent(category: DiagnosticEvent["category"], message: string, origin: string): void {
    this.events.push({
      category,
      message,
      timestamp: new Date(),
      origin
    });
  }

  public getEvents(): DiagnosticEvent[] {
    return this.events;
  }
}

export interface TimelineEvent {
  eventName: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class RuntimeEngineTimeline {
  public readonly events: TimelineEvent[] = [];

  public addEvent(eventName: string, metadata?: Record<string, any>): void {
    this.events.push({
      eventName,
      timestamp: new Date(),
      metadata
    });
  }
}

export class RuntimePipelineTimeline extends RuntimeEngineTimeline {}

export interface EngineTimelineEntry {
  engineName: string;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  status: string;
  inputVersion: string;
  outputVersion: string;
  failureCount: number;
  retryCount: number;
  recoveryStrategy: string;
  correlationId: string;
  pipelineExecutionId: string;
}

export class RuntimeObservabilityReport {
  constructor(
    public readonly reportId: string,
    public readonly timestamp: Date = new Date(),
    public readonly pipelineSummary: {
      status: string;
      correlationId: string;
      executionId: string;
      tenantId: string;
    },
    public readonly executionTimeline: TimelineEvent[],
    public readonly engineTimeline: EngineTimelineEntry[],
    public readonly metricsSummary: {
      pipelineExecutionCount: number;
      successfulPipelines: number;
      failedPipelines: number;
      recoveredPipelines: number;
      averagePipelineDurationMs: number;
      averageEngineDurationMs: number;
      engineExecutionCount: number;
      retryCount: number;
      skippedEngineCount: number;
      recoveryCount: number;
      terminationCount: number;
    },
    public readonly diagnosticsSummary: DiagnosticEvent[],
    public readonly failureSummary: string[],
    public readonly recoverySummary: string[],
    public readonly performanceSummary: {
      totalTimeMs: number;
      avgDurationMs: number;
    },
    public readonly securitySummary: {
      tenantIsolationPassed: boolean;
      workspaceIsolationPassed: boolean;
      violationsCount: number;
    }
  ) {}
}

export class RuntimeObservabilityManager {
  public readonly metricsCollector = new RuntimeMetricsCollector();
  public readonly traceCollector = new RuntimeTraceCollector();
  public readonly diagnosticsCollector = new RuntimeDiagnosticsCollector();
  public readonly timeline = new RuntimeEngineTimeline();
  private readonly engineTimelineEntries: EngineTimelineEntry[] = [];

  private activeCorrelationId: string = "corr_default";
  private activeExecutionId: string = "exec_default";
  private activeTenantId: string = "default_tenant";

  public initializeRun(correlationId: string, executionId: string, tenantId: string): void {
    this.activeCorrelationId = correlationId;
    this.activeExecutionId = executionId;
    this.activeTenantId = tenantId;
    this.timeline.addEvent("Pipeline Started", { correlationId, executionId, tenantId });
  }

  public recordPipelineRun(durationMs: number, success: boolean, recovered: boolean = false, terminated: boolean = false): void {
    this.metricsCollector.pipelineExecutionCount++;
    this.metricsCollector.totalPipelineDurationMs += durationMs;
    if (success) {
      this.metricsCollector.successfulPipelines++;
    } else {
      this.metricsCollector.failedPipelines++;
    }
    if (recovered) {
      this.metricsCollector.recoveredPipelines++;
    }
    if (terminated) {
      this.metricsCollector.terminationCount++;
    }
    this.timeline.addEvent("Pipeline Completed", { durationMs, success, recovered, terminated });
  }

  public recordEngineRun(
    engineName: string,
    startTime: Date,
    endTime: Date,
    durationMs: number,
    status: string,
    inputVersion: string,
    outputVersion: string,
    failureCount: number,
    retryCount: number,
    recoveryStrategy: string,
    correlationId: string,
    pipelineExecutionId: string
  ): void {
    this.metricsCollector.engineExecutionCount++;
    this.metricsCollector.totalEngineDurationMs += durationMs;
    if (status === "SKIPPED") {
      this.metricsCollector.skippedEngineCount++;
    }
    this.metricsCollector.retryCount += retryCount;

    this.timeline.addEvent(`${engineName} Started`, { startTime, correlationId });
    this.timeline.addEvent(`${engineName} Completed`, { endTime, durationMs, status });

    this.engineTimelineEntries.push({
      engineName,
      startTime,
      endTime,
      durationMs,
      status,
      inputVersion,
      outputVersion,
      failureCount,
      retryCount,
      recoveryStrategy,
      correlationId,
      pipelineExecutionId
    });
  }

  public compileReport(status: string): RuntimeObservabilityReport {
    const reportId = `rep_${Date.now()}`;
    const diagEvents = this.diagnosticsCollector.getEvents();
    
    const failures = diagEvents.filter(e => e.category === "Error").map(e => e.message);
    const recoveries = diagEvents.filter(e => e.category === "Recovery").map(e => e.message);
    
    const violationsCount = diagEvents.filter(e => e.category === "Security").length;

    return new RuntimeObservabilityReport(
      reportId,
      new Date(),
      {
        status,
        correlationId: this.activeCorrelationId,
        executionId: this.activeExecutionId,
        tenantId: this.activeTenantId
      },
      this.timeline.events,
      this.engineTimelineEntries,
      {
        pipelineExecutionCount: this.metricsCollector.pipelineExecutionCount,
        successfulPipelines: this.metricsCollector.successfulPipelines,
        failedPipelines: this.metricsCollector.failedPipelines,
        recoveredPipelines: this.metricsCollector.recoveredPipelines,
        averagePipelineDurationMs: this.metricsCollector.getAveragePipelineDuration(),
        averageEngineDurationMs: this.metricsCollector.getAverageEngineDuration(),
        engineExecutionCount: this.metricsCollector.engineExecutionCount,
        retryCount: this.metricsCollector.retryCount,
        skippedEngineCount: this.metricsCollector.skippedEngineCount,
        recoveryCount: this.metricsCollector.recoveryCount,
        terminationCount: this.metricsCollector.terminationCount
      },
      diagEvents,
      failures,
      recoveries,
      {
        totalTimeMs: this.metricsCollector.totalPipelineDurationMs,
        avgDurationMs: this.metricsCollector.getAveragePipelineDuration()
      },
      {
        tenantIsolationPassed: violationsCount === 0,
        workspaceIsolationPassed: true,
        violationsCount
      }
    );
  }
}
