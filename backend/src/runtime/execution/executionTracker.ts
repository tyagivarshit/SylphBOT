import { ExecutionRecord } from "./types";

export class ExecutionTracker {
  private records = new Map<string, ExecutionRecord>();

  constructor() {}

  /**
   * Initializes tracking metadata for a tool run.
   */
  public startExecution(
    correlationId: string,
    tenantId: string,
    toolName: string,
    input: any
  ): string {
    const executionId = `exec_${tenantId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const record: ExecutionRecord = {
      executionId,
      correlationId,
      tenantId,
      toolName,
      status: "running",
      startTime: new Date(),
      input,
      retriesAttempted: 0
    };

    this.records.set(executionId, record);
    return executionId;
  }

  /**
   * Marks a tool execution as successfully completed.
   */
  public completeExecution(executionId: string, output: any): void {
    const record = this.records.get(executionId);
    if (!record) return;

    record.status = "completed";
    record.endTime = new Date();
    record.latencyMs = record.endTime.getTime() - record.startTime.getTime();
    record.output = output;

    this.records.set(executionId, record);
  }

  /**
   * Marks a tool execution as failed.
   */
  public failExecution(executionId: string, error: string): void {
    const record = this.records.get(executionId);
    if (!record) return;

    record.status = "failed";
    record.endTime = new Date();
    record.latencyMs = record.endTime.getTime() - record.startTime.getTime();
    record.error = error;

    this.records.set(executionId, record);
  }

  /**
   * Tracks a retry event on an execution record.
   */
  public recordRetry(executionId: string): void {
    const record = this.records.get(executionId);
    if (!record) return;

    record.retriesAttempted++;
    record.status = "retry_pending";
    this.records.set(executionId, record);
  }

  /**
   * Resolves a logged execution record.
   */
  public getRecord(executionId: string): ExecutionRecord | null {
    return this.records.get(executionId) || null;
  }

  /**
   * Clears execution histories (for testing).
   */
  public clear(): void {
    this.records.clear();
  }
}
