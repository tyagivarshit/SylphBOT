import { RuntimeCognitiveContext } from "./cognitiveContext";
import { RuntimeTaskContext } from "./taskContext";
import { RuntimeTrace } from "./trace";

export type RuntimeHealthType = "HEALTHY" | "DEGRADED" | "PARTIAL" | "FAILED";
export type RuntimeReadinessType = "READY" | "PARTIAL_READY" | "NOT_READY";

export class RuntimeSnapshotMetadata {
  constructor(
    public readonly snapshotId: string,
    public readonly correlationId: string,
    public readonly timestamp: Date = new Date(),
    public readonly version: string = "1.0.0",
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export interface DependencyDetail {
  name: string;
  status: "OK" | "WARNING" | "ERROR";
  latencyMs: number;
  warnings: string[];
  errors: string[];
}

export class RuntimeDependencyStatus {
  constructor(
    public readonly dependencies: Record<string, DependencyDetail> = {}
  ) {}
}

export class RuntimeDiagnosticsSummary {
  constructor(
    public readonly correlationId: string,
    public readonly warnings: string[],
    public readonly errors: string[],
    public readonly fallbacks: string[],
    public readonly timingsMs: Record<string, number>
  ) {}
}

export class RuntimeConfidence {
  constructor(
    public readonly score: number,
    public readonly metrics: {
      knowledgeCompleteness: number;
      memoryCompleteness: number;
      goalCompleteness: number;
      constraintCompleteness: number;
      capabilityCompleteness: number;
    }
  ) {}
}

export class ExecutiveRuntimeSnapshot {
  constructor(
    public readonly snapshotId: string,
    public readonly identity: any,
    public readonly businessContext: any,
    public readonly knowledge: any[],
    public readonly memory: any[],
    public readonly cognitiveContext: RuntimeCognitiveContext,
    public readonly taskContext: RuntimeTaskContext,
    public readonly health: RuntimeHealthType,
    public readonly readiness: RuntimeReadinessType,
    public readonly confidence: RuntimeConfidence,
    public readonly dependencyStatus: RuntimeDependencyStatus,
    public readonly diagnosticsSummary: RuntimeDiagnosticsSummary,
    public readonly metadata: RuntimeSnapshotMetadata
  ) {}
}

export class RuntimeStateBuilder {
  public build(
    traceId: string,
    correlationId: string,
    cognitiveContext: RuntimeCognitiveContext,
    taskContext: RuntimeTaskContext,
    trace: RuntimeTrace,
    errors: Error[]
  ): ExecutiveRuntimeSnapshot {
    const buildStart = Date.now();

    const warnings: string[] = [];
    const traceErrors: string[] = [];
    const fallbacks: string[] = [];
    const timingsMs: Record<string, number> = {};
    const dependencies: Record<string, DependencyDetail> = {};

    // Map trace entries
    const entries = trace.getEntries();
    for (const entry of entries) {
      timingsMs[entry.stage] = entry.durationMs || 0;
      
      const entryWarnings = entry.metadata?.warnings || [];
      warnings.push(...entryWarnings);

      if (entry.status === "FAILED") {
        const errMessage = entry.metadata?.error || "Stage execution failed";
        traceErrors.push(errMessage);
      }

      if (["Identity Resolution", "Business Context Resolution", "Knowledge Resolution", "Memory Resolution", "Context Prioritization", "Context Ranking", "Context Compression", "Task Context Build"].includes(entry.stage)) {
        dependencies[entry.stage] = {
          name: entry.stage,
          status: entry.status === "FAILED" ? "ERROR" : entryWarnings.length > 0 ? "WARNING" : "OK",
          latencyMs: entry.durationMs || 0,
          warnings: entryWarnings,
          errors: entry.status === "FAILED" ? [entry.metadata?.error || "Stage failed"] : []
        };
      }
    }

    for (const err of errors) {
      traceErrors.push(err.message);
    }

    // Health Evaluation
    const healthStart = Date.now();
    let health: RuntimeHealthType = "HEALTHY";
    if (traceErrors.length > 0) {
      health = "FAILED";
    } else if (warnings.length > 0) {
      health = "DEGRADED";
    }
    const healthTime = Date.now() - healthStart;

    // Readiness Evaluation
    const readinessStart = Date.now();
    let readiness: RuntimeReadinessType = "READY";
    if (health === "FAILED") {
      readiness = "NOT_READY";
    } else if (health === "DEGRADED" || !cognitiveContext.topKnowledge.length || !cognitiveContext.topMemory.length) {
      readiness = "PARTIAL_READY";
    }
    const readinessTime = Date.now() - readinessStart;

    // Confidence Evaluation
    const confidenceStart = Date.now();
    const knowledgeCompleteness = cognitiveContext.topKnowledge.length > 0 ? 1.0 : 0.0;
    const memoryCompleteness = cognitiveContext.topMemory.length > 0 ? 1.0 : 0.0;
    const goalCompleteness = taskContext.currentGoal !== "Unknown" ? 1.0 : 0.0;
    const constraintCompleteness = taskContext.constraints.length > 0 ? 1.0 : 0.5;
    const capabilityCompleteness = taskContext.capabilities.length > 0 ? 1.0 : 0.5;

    let score = (knowledgeCompleteness + memoryCompleteness + goalCompleteness + constraintCompleteness + capabilityCompleteness) / 5;
    if (health === "DEGRADED") score *= 0.8;
    if (health === "FAILED") score = 0.0;

    const confidence = new RuntimeConfidence(score, {
      knowledgeCompleteness,
      memoryCompleteness,
      goalCompleteness,
      constraintCompleteness,
      capabilityCompleteness
    });
    const confidenceTime = Date.now() - confidenceStart;

    const dependencyAggregationTime = 0;
    const diagnosticsAggregationTime = Date.now() - buildStart;

    const snapshotId = `snap_${traceId}_${Date.now()}`;
    const snapshotMetadata = new RuntimeSnapshotMetadata(
      snapshotId,
      correlationId,
      new Date(),
      "1.0.0",
      {
        buildTimeMs: Date.now() - buildStart,
        healthEvaluationTimeMs: healthTime,
        readinessEvaluationTimeMs: readinessTime,
        confidenceEvaluationTimeMs: confidenceTime,
        dependencyAggregationTimeMs: dependencyAggregationTime,
        diagnosticsAggregationTimeMs: diagnosticsAggregationTime
      }
    );

    const dependencyStatus = new RuntimeDependencyStatus(dependencies);
    const diagnosticsSummary = new RuntimeDiagnosticsSummary(correlationId, warnings, traceErrors, fallbacks, timingsMs);

    return new ExecutiveRuntimeSnapshot(
      snapshotId,
      cognitiveContext.identity,
      cognitiveContext.businessContext,
      cognitiveContext.topKnowledge,
      cognitiveContext.topMemory,
      cognitiveContext,
      taskContext,
      health,
      readiness,
      confidence,
      dependencyStatus,
      diagnosticsSummary,
      snapshotMetadata
    );
  }
}
