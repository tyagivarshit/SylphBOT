import { ExecutiveRuntimeSnapshot } from "./stateFinalizer";

// ============================================================================
// IMMUTABLE ENGINE HANDOFF RESULTS
// ============================================================================

export class ThinkingResult {
  constructor(
    public readonly snapshot: ExecutiveRuntimeSnapshot,
    public readonly thinkingData: string,
    public readonly success: boolean
  ) {}
}

export class PlanningResult {
  constructor(
    public readonly thinkingResult: ThinkingResult,
    public readonly planningData: string,
    public readonly success: boolean
  ) {}
}

export class DecisionResult {
  constructor(
    public readonly planningResult: PlanningResult,
    public readonly decisionData: string,
    public readonly success: boolean
  ) {}
}

export class ExecutionResult {
  constructor(
    public readonly decisionResult: DecisionResult,
    public readonly executionData: string,
    public readonly success: boolean
  ) {}
}

export class MonitoringResult {
  constructor(
    public readonly executionResult: ExecutionResult,
    public readonly monitoringData: string,
    public readonly success: boolean
  ) {}
}

export class LearningResult {
  constructor(
    public readonly monitoringResult: MonitoringResult,
    public readonly learningData: string,
    public readonly success: boolean
  ) {}
}

// ============================================================================
// DIAGNOSTICS TRACKER
// ============================================================================

export class PipelineDiagnostics {
  public currentEngine: string = "";
  public readonly completedEngines: string[] = [];
  public readonly remainingEngines: string[] = ["Thinking", "Planning", "Decision", "Execution", "Monitoring", "Learning"];
  public pipelineStartTime?: Date;
  public pipelineEndTime?: Date;
  public executionDurationMs: number = 0;
  public readonly warnings: string[] = [];
  public readonly failures: string[] = [];
  public readonly skippedEngines: string[] = [];
  public readonly recoveryEvents: string[] = [];
  
  constructor(public readonly correlationId: string) {}
}

// ============================================================================
// CONTEXT AND INTERFACES
// ============================================================================

export class EngineExecutionContext {
  public thinkingResult?: ThinkingResult;
  public planningResult?: PlanningResult;
  public decisionResult?: DecisionResult;
  public executionResult?: ExecutionResult;
  public monitoringResult?: MonitoringResult;
  public learningResult?: LearningResult;
  
  public readonly pipelineDiagnostics: PipelineDiagnostics;

  constructor(
    public readonly snapshot: ExecutiveRuntimeSnapshot,
    public readonly tenantId: string,
    public readonly traceId: string,
    public readonly variables: Record<string, any> = {},
    public readonly diagnostics: Record<string, any> = {}
  ) {
    this.pipelineDiagnostics = new PipelineDiagnostics(snapshot.metadata.correlationId);
  }
}

export interface IRuntimeEngine {
  readonly name: string;
  execute(context: EngineExecutionContext): Promise<void>;
}

// ============================================================================
// REGISTRY AND DISPATCHER
// ============================================================================

export class RuntimeEngineRegistry {
  private engines = new Map<string, IRuntimeEngine>();

  public register(engine: IRuntimeEngine): void {
    this.engines.set(engine.name, engine);
  }

  public get(name: string): IRuntimeEngine | undefined {
    return this.engines.get(name);
  }

  public has(name: string): boolean {
    return this.engines.has(name);
  }

  public list(): string[] {
    return Array.from(this.engines.keys());
  }
}

export class RuntimeEngineDispatcher {
  constructor(private readonly registry: RuntimeEngineRegistry) {}

  public async dispatch(engineName: string, context: EngineExecutionContext): Promise<void> {
    const engine = this.registry.get(engineName);
    if (!engine) {
      throw new Error(`Dispatcher Error: Engine [${engineName}] is not registered.`);
    }

    // Tenant Isolation Check
    if (context.snapshot.identity.workspaceId !== context.tenantId) {
      throw new Error(`Security Violation: Cross-tenant engine dispatch blocked. Scope tenant: [${context.tenantId}], Snapshot tenant: [${context.snapshot.identity.workspaceId}].`);
    }

    try {
      await engine.execute(context);
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      context.diagnostics[`${engineName}_error`] = error.message;
      throw error;
    }
  }
}

// ============================================================================
// PIPELINE ORCHESTRATOR
// ============================================================================

export class ExecutiveRuntimePipeline {
  constructor(
    private readonly registry: RuntimeEngineRegistry,
    private readonly dispatcher: RuntimeEngineDispatcher
  ) {}

  public async run(snapshot: ExecutiveRuntimeSnapshot, tenantId: string, traceId: string): Promise<EngineExecutionContext> {
    const context = new EngineExecutionContext(snapshot, tenantId, traceId);
    context.pipelineDiagnostics.pipelineStartTime = new Date();
    
    // Explicit sequential order
    const engineSequence = ["Thinking", "Planning", "Decision", "Execution", "Monitoring", "Learning"];
    
    for (const engineName of engineSequence) {
      context.pipelineDiagnostics.currentEngine = engineName;
      
      const idx = context.pipelineDiagnostics.remainingEngines.indexOf(engineName);
      if (idx > -1) {
        context.pipelineDiagnostics.remainingEngines.splice(idx, 1);
      }

      if (this.registry.has(engineName)) {
        try {
          context.diagnostics[`${engineName}_status`] = "RUNNING";
          context.diagnostics[`${engineName}_startTime`] = new Date().toISOString();
          
          const start = Date.now();
          await this.dispatcher.dispatch(engineName, context);
          
          const end = Date.now();
          context.diagnostics[`${engineName}_endTime`] = new Date().toISOString();
          context.diagnostics[`${engineName}_durationMs`] = end - start;
          context.diagnostics[`${engineName}_status`] = "SUCCESS";
          
          context.pipelineDiagnostics.completedEngines.push(engineName);
        } catch (err: any) {
          const error = err instanceof Error ? err : new Error(String(err));
          context.diagnostics[`${engineName}_status`] = "FAILED";
          context.pipelineDiagnostics.failures.push(`${engineName} failed: ${error.message}`);
          
          const isFatal = this.checkIfFatal(engineName, error);
          if (isFatal) {
            context.diagnostics.pipeline_status = "FAILED_FATAL";
            context.pipelineDiagnostics.pipelineEndTime = new Date();
            context.pipelineDiagnostics.executionDurationMs = Date.now() - context.pipelineDiagnostics.pipelineStartTime.getTime();
            throw new Error(`Pipeline execution terminated: Engine [${engineName}] failed with fatal error: ${error.message}`);
          } else {
            context.pipelineDiagnostics.recoveryEvents.push(`Recovered from ${engineName} failure.`);
            context.pipelineDiagnostics.warnings.push(`Recovered error in ${engineName}: ${error.message}`);
            context.pipelineDiagnostics.completedEngines.push(engineName);
          }
        }
      } else {
        context.diagnostics[`${engineName}_status`] = "SKIPPED";
        context.pipelineDiagnostics.skippedEngines.push(engineName);
      }
    }

    context.pipelineDiagnostics.pipelineEndTime = new Date();
    context.pipelineDiagnostics.executionDurationMs = Date.now() - context.pipelineDiagnostics.pipelineStartTime.getTime();
    context.diagnostics.pipeline_status = "SUCCESS";
    
    return context;
  }

  private checkIfFatal(engineName: string, error: Error): boolean {
    if (error.message.includes("Security Violation") || error.message.includes("Unauthorized")) {
      return true;
    }
    return false;
  }
}

// ============================================================================
// ENGINE ADAPTERS
// ============================================================================

export class ThinkingEngineAdapter implements IRuntimeEngine {
  public readonly name = "Thinking";
  constructor(private readonly di: any) {}

  public async execute(context: EngineExecutionContext): Promise<void> {
    const goal = context.snapshot.taskContext.currentGoal;
    context.thinkingResult = new ThinkingResult(context.snapshot, `Thinking analysis for: ${goal}`, true);
  }
}

export class PlanningEngineAdapter implements IRuntimeEngine {
  public readonly name = "Planning";
  constructor(private readonly di: any) {}

  public async execute(context: EngineExecutionContext): Promise<void> {
    if (!context.thinkingResult) {
      throw new Error("Missing required input: thinkingResult.");
    }
    context.planningResult = new PlanningResult(context.thinkingResult, `Planning mapping based on thinking data.`, true);
  }
}

export class DecisionEngineAdapter implements IRuntimeEngine {
  public readonly name = "Decision";
  constructor(private readonly di: any) {}

  public async execute(context: EngineExecutionContext): Promise<void> {
    if (!context.planningResult) {
      throw new Error("Missing required input: planningResult.");
    }
    context.decisionResult = new DecisionResult(context.planningResult, `Decision resolved dynamically.`, true);
  }
}

export class ExecutionEngineAdapter implements IRuntimeEngine {
  public readonly name = "Execution";
  constructor(private readonly di: any) {}

  public async execute(context: EngineExecutionContext): Promise<void> {
    if (!context.decisionResult) {
      throw new Error("Missing required input: decisionResult.");
    }
    context.executionResult = new ExecutionResult(context.decisionResult, `Execution completed.`, true);
  }
}

export class MonitoringEngineAdapter implements IRuntimeEngine {
  public readonly name = "Monitoring";
  constructor(private readonly di: any) {}

  public async execute(context: EngineExecutionContext): Promise<void> {
    if (!context.executionResult) {
      throw new Error("Missing required input: executionResult.");
    }
    context.monitoringResult = new MonitoringResult(context.executionResult, `Monitoring state registers updated.`, true);
  }
}

export class LearningEngineAdapter implements IRuntimeEngine {
  public readonly name = "Learning";
  constructor(private readonly di: any) {}

  public async execute(context: EngineExecutionContext): Promise<void> {
    if (!context.monitoringResult) {
      throw new Error("Missing required input: monitoringResult.");
    }
    context.learningResult = new LearningResult(context.monitoringResult, `Learning consolidation successful.`, true);
  }
}
