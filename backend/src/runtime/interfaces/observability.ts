export interface ITelemetry {
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  recordEvent(name: string, payload: Record<string, unknown>): void;
}

export interface TracingSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  tags: Record<string, string>;
}

export interface ITracing {
  startSpan(name: string, parentId?: string): TracingSpan;
  endSpan(spanId: string, tags?: Record<string, string>): void;
}

export interface ReasoningLog {
  executionId: string;
  traceId: string;
  prompt: string;
  completion: string;
  timestamp: Date;
}

export interface IReasoningLogger {
  logReasoning(log: ReasoningLog): Promise<void>;
}

export interface ICostTracker {
  recordCost(businessId: string, model: string, tokens: { prompt: number; completion: number }): Promise<number>;
  getCostSummary(businessId: string, start: Date, end: Date): Promise<number>;
}
