import { IRuntimeContext, IRuntimeMetadata } from "./types";

export class RuntimeMetadata implements IRuntimeMetadata {
  constructor(
    public readonly runtimeVersion: string = "1.0.0",
    public readonly environment: string = process.env.NODE_ENV || "development",
    public readonly runtimeId: string = `rt_${Math.random().toString(36).substring(2, 15)}`,
    public readonly tags: string[] = [],
    public readonly additionalProperties: Record<string, any> = {}
  ) {}
}

export class RuntimeContext implements IRuntimeContext {
  constructor(
    public readonly traceId: string,
    public readonly correlationId: string,
    public readonly requestMetadata: Record<string, any> = {},
    public readonly runtimeMetadata: IRuntimeMetadata = new RuntimeMetadata(),
    public readonly executionMetadata: Record<string, any> = {},
    public readonly identity: Record<string, any> | null = null,
    public readonly businessContext: Record<string, any> | null = null,
    public readonly workspace: Record<string, any> | null = null,
    public readonly conversation: Record<string, any> | null = null,
    public readonly customer: Record<string, any> | null = null,
    public readonly knowledge: Record<string, any> | null = null,
    public readonly memory: Record<string, any> | null = null,
    public readonly goals: Record<string, any>[] | null = null,
    public readonly constraints: Record<string, any>[] | null = null,
    public readonly permissions: string[] | null = null
  ) {}

  /**
   * Immutably copies the context with new properties.
   */
  public with(updates: Partial<IRuntimeContext>): RuntimeContext {
    return new RuntimeContext(
      updates.traceId !== undefined ? updates.traceId : this.traceId,
      updates.correlationId !== undefined ? updates.correlationId : this.correlationId,
      updates.requestMetadata !== undefined ? { ...this.requestMetadata, ...updates.requestMetadata } : this.requestMetadata,
      updates.runtimeMetadata !== undefined ? updates.runtimeMetadata : this.runtimeMetadata,
      updates.executionMetadata !== undefined ? { ...this.executionMetadata, ...updates.executionMetadata } : this.executionMetadata,
      updates.identity !== undefined ? updates.identity : this.identity,
      updates.businessContext !== undefined ? updates.businessContext : this.businessContext,
      updates.workspace !== undefined ? updates.workspace : this.workspace,
      updates.conversation !== undefined ? updates.conversation : this.conversation,
      updates.customer !== undefined ? updates.customer : this.customer,
      updates.knowledge !== undefined ? updates.knowledge : this.knowledge,
      updates.memory !== undefined ? updates.memory : this.memory,
      updates.goals !== undefined ? updates.goals : this.goals,
      updates.constraints !== undefined ? updates.constraints : this.constraints,
      updates.permissions !== undefined ? updates.permissions : this.permissions
    );
  }
}
