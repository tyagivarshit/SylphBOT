import { RuntimeContext } from "./context";
import { RuntimeLifecycle } from "./lifecycle";
import { RuntimeTrace } from "./trace";
import { RuntimeExecutionResult } from "./result";
import { IRuntimeContext } from "./types";
import { ContextAssembler } from "./assembler";
import { container } from "../../../runtime/kernel/diContainer";
import { RuntimeIdentityResolver, RuntimeBusinessContextResolver, RuntimeKnowledgeResolver, RuntimeMemoryResolver } from "./resolvers";
import { RuntimeCognitiveContext, CognitiveContextMetadata, RuntimeContextPrioritizer, RuntimeContextRanker, RuntimeContextCompressor } from "./cognitiveContext";
import { RuntimeTaskContext, RuntimeTaskContextBuilder, TaskContextMetadata } from "./taskContext";
import { ExecutiveRuntimeSnapshot, RuntimeStateBuilder } from "./stateFinalizer";

export class RuntimeCoordinator {
  private lifecycle = new RuntimeLifecycle();
  private trace = new RuntimeTrace();
  private context: RuntimeContext | null = null;
  private assembler = new ContextAssembler();
  private errors: Error[] = [];
  private cognitiveContext?: RuntimeCognitiveContext;
  private taskContext?: RuntimeTaskContext;
  private snapshot?: ExecutiveRuntimeSnapshot;

  public getCognitiveContext(): RuntimeCognitiveContext | undefined {
    return this.cognitiveContext;
  }

  public getTaskContext(): RuntimeTaskContext | undefined {
    return this.taskContext;
  }

  public getSnapshot(): ExecutiveRuntimeSnapshot | undefined {
    return this.snapshot;
  }

  /**
   * Initializes the runtime with basic request identifiers.
   */
  public initialize(traceId: string, correlationId: string, requestMetadata: Record<string, any> = {}): RuntimeContext {
    this.lifecycle.initialize();
    this.trace.startStage("INITIALIZING", { traceId, correlationId });
    
    this.context = new RuntimeContext(traceId, correlationId, requestMetadata);
    
    this.trace.completeStage("INITIALIZING");
    return this.context;
  }

  /**
   * Begins context gathering and runs the assembler pipeline sequentially.
   */
  public async buildContext(rawRequest: any, di: any = null): Promise<RuntimeContext> {
    if (!this.context) {
      throw new Error("Runtime context must be initialized before building.");
    }

    this.lifecycle.startBuildingContext();
    this.trace.startStage("BUILDING_CONTEXT", { rawRequest });

    // Use request scope container if passed, otherwise default to global container
    const activeDI = di || container;

    // 1. Identity Resolution
    this.trace.startStage("Identity Resolution");
    const actorId = rawRequest?.actorId || "system";
    const role = rawRequest?.executiveRole || "SPRINT2_EXECUTIVE_RUNTIME";
    const tenantId = rawRequest?.tenantId || "default_tenant";

    const identityResolver = new RuntimeIdentityResolver(activeDI);
    const identityResult = await identityResolver.resolve(actorId, role, tenantId);
    
    if (!identityResult.success) {
      const err = identityResult.error || new Error(`Identity Resolution Failed for role [${role}] on tenant [${tenantId}].`);
      this.errors.push(err);
      this.trace.failStage("Identity Resolution", err, { reason: err.message });
      this.trace.completeStage("BUILDING_CONTEXT");
      this.lifecycle.fail(err, "Identity resolution failed");
      return this.context;
    }
    this.trace.completeStage("Identity Resolution");

    // 2. Business Context Resolution
    this.trace.startStage("Business Context Resolution");
    const businessResolver = new RuntimeBusinessContextResolver(activeDI);
    const businessResult = await businessResolver.resolve(tenantId);

    if (!businessResult.success) {
      const err = businessResult.error || new Error(`Business Context Resolution Failed for tenant [${tenantId}].`);
      this.errors.push(err);
      this.trace.failStage("Business Context Resolution", err, { reason: err.message });
      this.trace.completeStage("BUILDING_CONTEXT");
      this.lifecycle.fail(err, "Business context resolution failed");
      return this.context;
    }
    this.trace.completeStage("Business Context Resolution");

    // 3. Consistency validation checks
    this.trace.startStage("Validation Status");
    const identityWorkspaceId = identityResult.identity?.workspaceId;
    const businessId = businessResult.business?.businessId;

    if (identityWorkspaceId !== tenantId || businessId !== tenantId || identityWorkspaceId !== businessId) {
      const err = new Error(`Validation Status: Tenant consistency check failed. Identity Tenant: [${identityWorkspaceId}], Business Tenant: [${businessId}], Request Tenant: [${tenantId}].`);
      this.errors.push(err);
      this.trace.failStage("Validation Status", err, { reason: err.message });
      this.trace.completeStage("BUILDING_CONTEXT");
      this.lifecycle.fail(err, "Validation status failed due to tenant inconsistency");
      return this.context;
    }
    this.trace.completeStage("Validation Status");

    // 4. Knowledge Resolution Stage
    this.trace.startStage("Knowledge Resolution");
    const knowledgeResolver = new RuntimeKnowledgeResolver(activeDI);
    const knowledgeResult = await knowledgeResolver.resolve(tenantId, rawRequest.objective || "", { limit: 5 });
    
    // Check tenant isolation consistency on retrieved items
    let validatedKnowledge: any[] = [];
    if (knowledgeResult.success && knowledgeResult.retrievedKnowledge) {
      for (const item of knowledgeResult.retrievedKnowledge) {
        if (item.tenantId && item.tenantId !== tenantId) {
          this.trace.addWarning("Knowledge Resolution", `Security Warning: Cross-tenant knowledge leak prevented for node [${item.id}].`);
        } else {
          validatedKnowledge.push(item);
        }
      }
    } else if (!knowledgeResult.success) {
      // Non-blocking failure: record warning and add to diagnostics
      this.trace.addWarning("Knowledge Resolution", `Knowledge resolution failed: ${knowledgeResult.error?.message}`);
    }
    
    this.trace.completeStage("Knowledge Resolution", {
      retrievedCount: validatedKnowledge.length,
      durationMs: knowledgeResult.diagnostics.durationMs,
      cacheHit: knowledgeResult.diagnostics.cacheHit
    });

    // 5. Memory Resolution Stage
    this.trace.startStage("Memory Resolution");
    const executiveId = identityResult.identity?.identityId || "system";
    const memoryResolver = new RuntimeMemoryResolver(activeDI);
    const memoryResult = await memoryResolver.resolve(tenantId, executiveId, rawRequest.objective || "", { limit: 5 });

    let validatedMemories: any[] = [];
    if (memoryResult.success && memoryResult.retrievedMemories) {
      for (const item of memoryResult.retrievedMemories) {
        // Enforce memory tenant isolation
        const itemTenant = item.tenantId || item.lead?.businessId;
        if (itemTenant && itemTenant !== tenantId) {
          this.trace.addWarning("Memory Resolution", `Security Warning: Cross-tenant memory leak prevented for node [${item.id}].`);
        } else {
          validatedMemories.push(item);
        }
      }
    } else if (!memoryResult.success) {
      this.trace.addWarning("Memory Resolution", `Memory resolution failed: ${memoryResult.error?.message}`);
    }

    this.trace.completeStage("Memory Resolution", {
      retrievedCount: validatedMemories.length,
      durationMs: memoryResult.diagnostics.durationMs,
      cacheHit: memoryResult.diagnostics.cacheHit
    });

    // 6. Enrich context immutably using resolved entities
    let enrichedContext = this.context.with({
      identity: identityResult.identity,
      businessContext: businessResult.business,
      workspace: {
        id: tenantId,
        name: businessResult.business?.workspaceProfile?.name || "Workspace",
        environment: process.env.NODE_ENV || "development",
      },
      knowledge: validatedKnowledge,
      memory: validatedMemories,
      permissions: identityResult.identity?.permissions || ["executive:execute"],
    });

    // 7. Run assembler for other custom builders and schema validators
    const result = await this.assembler.assemble(enrichedContext, rawRequest);
    
    if (!result.success) {
      this.errors.push(...result.errors);
      for (const err of result.errors) {
        this.trace.failStage("BUILDING_CONTEXT", err);
      }
    }

    for (const warn of result.warnings) {
      this.trace.addWarning("BUILDING_CONTEXT", warn);
    }

    this.context = result.context;

    // 8. Transform resolved RuntimeContext into Cognitive Context
    this.trace.startStage("Context Prioritization");
    const prioritizer = new RuntimeContextPrioritizer();
    let knowledgePriorities = [];
    let memoryPriorities = [];
    try {
      knowledgePriorities = prioritizer.prioritize(validatedKnowledge, "knowledge");
      memoryPriorities = prioritizer.prioritize(validatedMemories, "memory");
      this.trace.completeStage("Context Prioritization");
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.trace.failStage("Context Prioritization", error);
      knowledgePriorities = validatedKnowledge.map(k => ({ itemId: k.id || k.key || "", score: 0.5, reasons: ["fallback"] }));
      memoryPriorities = validatedMemories.map(m => ({ itemId: m.id || m.key || "", score: 0.5, reasons: ["fallback"] }));
    }

    this.trace.startStage("Context Ranking");
    const ranker = new RuntimeContextRanker();
    let rankedKnowledge = [];
    let rankedMemories = [];
    try {
      rankedKnowledge = ranker.rank(validatedKnowledge, knowledgePriorities);
      rankedMemories = ranker.rank(validatedMemories, memoryPriorities);
      this.trace.completeStage("Context Ranking");
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.trace.failStage("Context Ranking", error);
      rankedKnowledge = validatedKnowledge;
      rankedMemories = validatedMemories;
    }

    this.trace.startStage("Context Compression");
    const compressor = new RuntimeContextCompressor();
    let finalKnowledge = [];
    let finalMemories = [];
    let removedCount = 0;
    let duplicateCount = 0;
    try {
      const kbCompress = compressor.compress(rankedKnowledge);
      const memCompress = compressor.compress(rankedMemories);
      finalKnowledge = kbCompress.filtered;
      finalMemories = memCompress.filtered;
      removedCount = kbCompress.removedIds.length + memCompress.removedIds.length;
      duplicateCount = (rankedKnowledge.length - kbCompress.filtered.length) + (rankedMemories.length - memCompress.filtered.length);
      this.trace.completeStage("Context Compression", {
        removedCount,
        duplicateCount,
        outputCount: finalKnowledge.length + finalMemories.length
      });
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.trace.failStage("Context Compression", error);
      finalKnowledge = rankedKnowledge;
      finalMemories = rankedMemories;
    }

    // Prepare final RuntimeCognitiveContext
    const cognitiveMetadata = new CognitiveContextMetadata(
      new Date(),
      "1.0.0",
      {
        prioritizationTimeMs: 0,
        rankingTimeMs: 0,
        compressionTimeMs: 0,
        correlationId: this.context.correlationId
      }
    );
    this.cognitiveContext = new RuntimeCognitiveContext(
      identityResult.identity,
      businessResult.business,
      finalKnowledge,
      finalMemories,
      identityResult.identity?.permissions || ["executive:execute"],
      result.context.workspace,
      cognitiveMetadata,
      {
        inputCount: validatedKnowledge.length + validatedMemories.length,
        outputCount: finalKnowledge.length + finalMemories.length,
        removedCount,
        duplicateCount
      }
    );

    // 9. Build RuntimeTaskContext from RuntimeCognitiveContext
    const taskContextBuilder = new RuntimeTaskContextBuilder();
    
    // Resolve Goals Stage
    this.trace.startStage("Goal Resolution");
    this.trace.completeStage("Goal Resolution");

    // Resolve Constraints Stage
    this.trace.startStage("Constraint Resolution");
    this.trace.completeStage("Constraint Resolution");

    // Discover Capabilities Stage
    this.trace.startStage("Capability Resolution");
    this.trace.completeStage("Capability Resolution");

    // Resolve Mode Stage
    this.trace.startStage("Execution Mode Resolution");
    this.trace.completeStage("Execution Mode Resolution");

    this.trace.startStage("Task Context Build");
    try {
      this.taskContext = taskContextBuilder.build(rawRequest, this.cognitiveContext);
      this.trace.completeStage("Task Context Build", {
        goal: this.taskContext.currentGoal,
        constraintsCount: this.taskContext.constraints.length,
        capabilitiesCount: this.taskContext.capabilities.length,
        executionMode: this.taskContext.executionMode
      });
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.trace.failStage("Task Context Build", error);
      // Fallback: return minimal task context
      const fallbackMetadata = new TaskContextMetadata(new Date(), "1.0.0", { error: error.message });
      this.taskContext = new RuntimeTaskContext(
        this.cognitiveContext.identity,
        this.cognitiveContext.businessContext,
        this.cognitiveContext.workspace,
        "Unknown",
        [],
        ["MINIMAL_CAPABILITIES"],
        "ReadOnly",
        this.cognitiveContext.permissions,
        fallbackMetadata
      );
    }

    // 10. Finalize Runtime State with ExecutiveRuntimeSnapshot
    this.trace.startStage("Snapshot Build");
    const stateBuilder = new RuntimeStateBuilder();
    try {
      if (this.context && this.cognitiveContext && this.taskContext) {
        this.snapshot = stateBuilder.build(
          this.context.traceId,
          this.context.correlationId,
          this.cognitiveContext,
          this.taskContext,
          this.trace,
          this.errors
        );
        this.trace.completeStage("Snapshot Build", {
          snapshotId: this.snapshot.snapshotId,
          health: this.snapshot.health,
          readiness: this.snapshot.readiness,
          confidence: this.snapshot.confidence.score
        });
      } else {
        throw new Error("Missing required contexts to finalize state snapshot.");
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.trace.failStage("Snapshot Build", error);
      this.lifecycle.fail(error, "Snapshot finalization failed");
      return this.context;
    }

    this.trace.completeStage("BUILDING_CONTEXT");
    this.lifecycle.setReady();

    return this.context;
  }

  /**
   * Finalizes context and sets runtime to ready.
   */
  public setReady(enrichedContext: RuntimeContext): void {
    this.context = enrichedContext;
    this.lifecycle.setReady();
  }


  /**
   * Executes the entry run (Prompt 1 Dry-Run placeholder, no executive services are wired yet).
   */
  public async execute(objective: string): Promise<RuntimeExecutionResult> {
    if (!this.context) {
      throw new Error("Runtime cannot be executed before initialization.");
    }

    this.lifecycle.start();
    this.trace.startStage("RUNNING", { objective });

    try {
      // Future wiring integration hooks go here.
      // For Prompt 1 infrastructure, we simply run a dry-run check.
      this.trace.addWarning("RUNNING", "Dry-run execution: No executive services are active yet.");
      
      this.trace.completeStage("RUNNING");
      this.lifecycle.complete();
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.errors.push(error);
      this.trace.failStage("RUNNING", error);
      this.lifecycle.fail(error);
    }

    return new RuntimeExecutionResult(
      this.lifecycle.getState(),
      this.context,
      this.trace,
      { totalTimeMs: Date.now() },
      this.errors,
      null
    );
  }

  /**
   * Recovers from failures.
   */
  public recover(): void {
    this.lifecycle.recover();
    this.trace.startStage("RECOVERING");
    this.trace.completeStage("RECOVERING");
    this.lifecycle.setReady();
  }

  /**
   * Operator abort or cancellation hook.
   */
  public cancel(): void {
    this.lifecycle.cancel();
    this.trace.addWarning("RUNNING", "Operator cancelled execution.");
  }

  /**
   * Disposes of the context.
   */
  public dispose(): void {
    this.lifecycle.dispose();
    this.context = null;
    this.errors = [];
  }
}
