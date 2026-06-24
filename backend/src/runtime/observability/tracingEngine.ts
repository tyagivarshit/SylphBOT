import { ITracing, TracingSpan } from "../interfaces/observability";

export class TracingEngine implements ITracing {
  private spans = new Map<string, TracingSpan>();

  constructor() {}

  /**
   * Starts a new tracing span, generating unique Span IDs.
   */
  public startSpan(name: string, parentSpanId?: string): TracingSpan {
    const spanId = `span_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    
    const span: TracingSpan = {
      spanId,
      parentSpanId,
      name,
      startTime: new Date(),
      tags: {}
    };

    this.spans.set(spanId, span);
    return span;
  }

  /**
   * Concludes a span execution and updates metadata tag limits.
   */
  public endSpan(spanId: string, tags: Record<string, string> = {}): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = new Date();
    span.tags = { ...span.tags, ...tags };
    this.spans.set(spanId, span);
  }

  /**
   * Resolves a trace lineage list traversing upwards from child spans to top parent nodes.
   */
  public getTraceLineage(spanId: string): TracingSpan[] {
    const lineage: TracingSpan[] = [];
    let currentId: string | undefined = spanId;

    while (currentId) {
      const span = this.spans.get(currentId);
      if (!span) break;

      lineage.push(span);
      currentId = span.parentSpanId;
    }

    return lineage.reverse(); // Parent to child order
  }

  /**
   * Retrieve all spans recorded.
   */
  public listSpans(): TracingSpan[] {
    return Array.from(this.spans.values());
  }

  /**
   * Clears traces map (for testing).
   */
  public clear(): void {
    this.spans.clear();
  }
}
