export interface CorrelationContext {
  correlationId: string;
  parentCorrelationId?: string;
  spanId: string;
  executionChain: string[];
  lineage: string[];
}

export class CorrelationEngine {
  /**
   * Create a new tracking context.
   */
  public createContext(parentContext?: CorrelationContext): CorrelationContext {
    const correlationId = parentContext?.correlationId || this.generateUuid();
    const parentCorrelationId = parentContext ? parentContext.correlationId : undefined;
    const spanId = this.generateUuid();

    return {
      correlationId,
      parentCorrelationId,
      spanId,
      executionChain: parentContext ? [...parentContext.executionChain] : [],
      lineage: parentContext ? [...parentContext.lineage] : []
    };
  }

  /**
   * Extends the tracking context with a new step.
   */
  public extendContext(context: CorrelationContext, stepName: string, eventId: string): CorrelationContext {
    const extendedChain = [...context.executionChain, stepName];
    const extendedLineage = [...context.lineage, eventId];

    return {
      ...context,
      spanId: this.generateUuid(),
      executionChain: extendedChain,
      lineage: extendedLineage
    };
  }

  /**
   * Convert context to string for transport over headers or logs.
   */
  public serialize(context: CorrelationContext): string {
    return JSON.stringify(context);
  }

  /**
   * Convert serialized context back to object.
   */
  public deserialize(raw: string): CorrelationContext {
    try {
      return JSON.parse(raw) as CorrelationContext;
    } catch (err) {
      // Return fresh context on parsing failure
      return this.createContext();
    }
  }

  private generateUuid(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}
