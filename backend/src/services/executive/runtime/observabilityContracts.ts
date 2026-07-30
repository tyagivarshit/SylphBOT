export interface IRuntimeLogger {
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
  debug(message: string, context?: Record<string, any>): void;
}

export interface IRuntimeMetricsExporter {
  counter(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, durationMs: number, tags?: Record<string, string>): void;
}

export interface IRuntimeTracer {
  startSpan(spanName: string, correlationId?: string): any;
  endSpan(span: any, status?: string): void;
  recordException(span: any, error: Error): void;
}

export interface IRuntimeHealthCheck {
  checkHealth(): Promise<{
    status: "UP" | "DOWN" | "DEGRADED";
    details: Record<string, any>;
  }>;
}
