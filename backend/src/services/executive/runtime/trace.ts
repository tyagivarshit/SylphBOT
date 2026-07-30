import { IRuntimeTrace, IRuntimeTraceEntry, TraceStageStatus } from "./types";

export class RuntimeTraceEntry implements IRuntimeTraceEntry {
  public endTime: Date | null = null;
  public durationMs: number | null = null;
  public status: TraceStageStatus = "PENDING";
  public warnings: string[] = [];
  public errors: Error[] = [];

  constructor(
    public readonly stage: string,
    public readonly startTime: Date = new Date(),
    public readonly metadata: Record<string, any> = {}
  ) {}

  public complete(metadata?: Record<string, any>): void {
    this.status = "COMPLETED";
    this.endTime = new Date();
    this.durationMs = this.endTime.getTime() - this.startTime.getTime();
    if (metadata) {
      Object.assign(this.metadata, metadata);
    }
  }

  public fail(error: Error, metadata?: Record<string, any>): void {
    this.status = "FAILED";
    this.endTime = new Date();
    this.durationMs = this.endTime.getTime() - this.startTime.getTime();
    this.errors.push(error);
    if (metadata) {
      Object.assign(this.metadata, metadata);
    }
  }

  public cancel(metadata?: Record<string, any>): void {
    this.status = "CANCELLED";
    this.endTime = new Date();
    this.durationMs = this.endTime.getTime() - this.startTime.getTime();
    if (metadata) {
      Object.assign(this.metadata, metadata);
    }
  }

  public addWarning(warning: string): void {
    this.warnings.push(warning);
  }
}

export class RuntimeTrace implements IRuntimeTrace {
  private entriesMap = new Map<string, RuntimeTraceEntry>();

  public getEntries(): IRuntimeTraceEntry[] {
    return Array.from(this.entriesMap.values());
  }

  public startStage(stage: string, metadata: Record<string, any> = {}): void {
    if (this.entriesMap.has(stage)) {
      this.entriesMap.get(stage)!.addWarning(`Re-entered stage: ${stage}`);
    }
    const entry = new RuntimeTraceEntry(stage, new Date(), metadata);
    entry.status = "RUNNING";
    this.entriesMap.set(stage, entry);
  }

  public completeStage(stage: string, metadata?: Record<string, any>): void {
    const entry = this.entriesMap.get(stage);
    if (entry) {
      entry.complete(metadata);
    } else {
      const implicitEntry = new RuntimeTraceEntry(stage);
      implicitEntry.complete(metadata);
      implicitEntry.addWarning("Stage completed without explicit start call.");
      this.entriesMap.set(stage, implicitEntry);
    }
  }

  public failStage(stage: string, error: Error, metadata?: Record<string, any>): void {
    const entry = this.entriesMap.get(stage);
    if (entry) {
      entry.fail(error, metadata);
    } else {
      const implicitEntry = new RuntimeTraceEntry(stage);
      implicitEntry.fail(error, metadata);
      implicitEntry.addWarning("Stage failed without explicit start call.");
      this.entriesMap.set(stage, implicitEntry);
    }
  }

  public addWarning(stage: string, warning: string): void {
    const entry = this.entriesMap.get(stage);
    if (entry) {
      entry.addWarning(warning);
    }
  }
}
