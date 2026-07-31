export * from "./types";
export * from "./context";
export * from "./trace";
export * from "./lifecycle";
export * from "./result";
export * from "./coordinator";
export * from "./builderTypes";
export * from "./contextBuilder";
export * from "./assembler";
export * from "./resolverTypes";
export * from "./resolvers";
export * from "./repositoryContracts";
export * from "./repositories";
export * from "./observabilityContracts";
export * from "./providerContracts";
export * from "./cognitiveContext";
export * from "./taskContext";
export * from "./stateFinalizer";
export * from "./enginePipeline";
export * from "./contractValidator";

import { RuntimeCoordinator } from "./coordinator";
import { RuntimeExecutionResult } from "./result";

/**
 * ExecutiveRuntime is the foundational orchestration root for Sprint 4.
 * In future phases, all incoming Executive requests (Identity, Planning,
 * Decision, Learning, etc.) will be dynamically coordinated here.
 */
export class ExecutiveRuntime {
  /**
   * Orchestrates the boot, execution lifecycle, context build, and results collection.
   */
  public async handleRequest(input: {
    traceId: string;
    correlationId: string;
    objective: string;
    requestMetadata?: Record<string, any>;
  }, di?: any): Promise<RuntimeExecutionResult> {
    const coordinator = new RuntimeCoordinator();
    
    // 1. Initialize runtime metadata and trace paths
    const context = coordinator.initialize(
      input.traceId,
      input.correlationId,
      input.requestMetadata || {}
    );

    // 2. Transition state, build context packages, and run validation rules
    await coordinator.buildContext({
      actorId: input.requestMetadata?.actorId || "system",
      tenantId: input.requestMetadata?.tenantId || "default_tenant",
      objective: input.objective,
      permissions: ["executive:execute"]
    }, di);

    // 3. Execute the dry-run pipeline
    const result = await coordinator.execute(input.objective);

    // 4. Clean up scope bounds
    coordinator.dispose();

    return result;
  }
}
