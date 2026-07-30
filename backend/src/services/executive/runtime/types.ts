/**
 * Sprint 4 — Executive Runtime Foundation Types
 * This file defines the core type declarations and state models.
 */

export type RuntimeState =
  | "INITIALIZING"
  | "BUILDING_CONTEXT"
  | "READY"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "RECOVERING"
  | "CANCELLED";

export type TraceStageStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface IRuntimeTraceEntry {
  readonly stage: string;
  readonly startTime: Date;
  readonly endTime: Date | null;
  readonly durationMs: number | null;
  readonly status: TraceStageStatus;
  readonly warnings: string[];
  readonly errors: Error[];
  readonly metadata: Record<string, any>;
}

export interface IRuntimeMetadata {
  readonly runtimeVersion: string;
  readonly environment: string;
  readonly runtimeId: string;
  readonly tags: string[];
  readonly additionalProperties: Record<string, any>;
}

export interface IRuntimeContext {
  readonly traceId: string;
  readonly correlationId: string;
  readonly requestMetadata: Record<string, any>;
  readonly runtimeMetadata: IRuntimeMetadata;
  readonly executionMetadata: Record<string, any>;
  
  readonly identity: Record<string, any> | null;
  readonly businessContext: Record<string, any> | null;
  readonly workspace: Record<string, any> | null;
  readonly conversation: Record<string, any> | null;
  readonly customer: Record<string, any> | null;
  readonly knowledge: Record<string, any> | null;
  readonly memory: Record<string, any> | null;
  readonly goals: Record<string, any>[] | null;
  readonly constraints: Record<string, any>[] | null;
  readonly permissions: string[] | null;
}

export interface IRuntimeTrace {
  getEntries(): IRuntimeTraceEntry[];
  startStage(stage: string, metadata?: Record<string, any>): void;
  completeStage(stage: string, metadata?: Record<string, any>): void;
  failStage(stage: string, error: Error, metadata?: Record<string, any>): void;
  addWarning(stage: string, warning: string): void;
}

export interface IRuntimeExecutionResult {
  readonly status: RuntimeState;
  readonly context: IRuntimeContext;
  readonly trace: IRuntimeTrace;
  readonly metrics: Record<string, any>; // Metrics Placeholder
  readonly errors: Error[]; // Errors Placeholder
  readonly response: Record<string, any> | null; // Future Response Placeholder
}
