import { RuntimeCognitiveContext } from "./cognitiveContext";

export class TaskContextMetadata {
  constructor(
    public readonly resolvedAt: Date = new Date(),
    public readonly builderVersion: string = "1.0.0",
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export class RuntimeTaskContext {
  constructor(
    public readonly identity: any,
    public readonly businessContext: any,
    public readonly workspace: any,
    public readonly currentGoal: string,
    public readonly constraints: string[],
    public readonly capabilities: string[],
    public readonly executionMode: string,
    public readonly permissions: string[],
    public readonly metadata: TaskContextMetadata,
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export class TaskGoalResolver {
  public resolve(rawRequest: any, cognitiveContext: RuntimeCognitiveContext): string {
    try {
      const goal = rawRequest.objective || cognitiveContext.diagnostics?.correlationId || "Unknown";
      return String(goal).trim() || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}

export class TaskConstraintResolver {
  public resolve(rawRequest: any, cognitiveContext: RuntimeCognitiveContext): string[] {
    try {
      const constraints: string[] = [];
      const planCode = cognitiveContext.businessContext?.tenantInformation?.planCode || "FREE";
      
      if (planCode === "FREE") {
        constraints.push("LIMIT_CONCURRENT_OPERATIONS");
        constraints.push("LIMIT_MONTHLY_CREDITS");
      }
      if (process.env.NODE_ENV === "production") {
        constraints.push("ENFORCE_TENANT_ISOLATION");
      }
      
      constraints.push("READ_ONLY_MODE");
      return constraints;
    } catch {
      return [];
    }
  }
}

export class TaskCapabilityResolver {
  public resolve(cognitiveContext: RuntimeCognitiveContext): string[] {
    try {
      const capabilities: string[] = [];
      
      if (cognitiveContext.topKnowledge && cognitiveContext.topKnowledge.length > 0) {
        capabilities.push("KNOWLEDGE_RETRIEVAL");
      }
      if (cognitiveContext.topMemory && cognitiveContext.topMemory.length > 0) {
        capabilities.push("MEMORY_RETRIEVAL");
      }
      if (cognitiveContext.businessContext) {
        capabilities.push("BUSINESS_PROFILE_AWARE");
      }
      if (cognitiveContext.permissions && cognitiveContext.permissions.length > 0) {
        capabilities.push("PERMISSION_EVALUATION");
      }
      
      return capabilities;
    } catch {
      return ["MINIMAL_CAPABILITIES"];
    }
  }
}

export class TaskExecutionModeResolver {
  public resolve(cognitiveContext: RuntimeCognitiveContext): string {
    try {
      return "Dry Run";
    } catch {
      return "ReadOnly";
    }
  }
}

export class RuntimeTaskContextBuilder {
  private readonly goalResolver = new TaskGoalResolver();
  private readonly constraintResolver = new TaskConstraintResolver();
  private readonly capabilityResolver = new TaskCapabilityResolver();
  private readonly modeResolver = new TaskExecutionModeResolver();

  public build(rawRequest: any, cognitiveContext: RuntimeCognitiveContext): RuntimeTaskContext {
    const resolvedAt = new Date();
    const diagnostics: Record<string, any> = {};

    // Goal Resolution
    const goalStart = Date.now();
    let goal = "Unknown";
    try {
      goal = this.goalResolver.resolve(rawRequest, cognitiveContext);
    } catch {
      goal = "Unknown";
    }
    diagnostics.goalResolutionTimeMs = Date.now() - goalStart;

    // Constraints Resolution
    const constraintStart = Date.now();
    let constraints: string[] = [];
    try {
      constraints = this.constraintResolver.resolve(rawRequest, cognitiveContext);
    } catch {
      constraints = [];
    }
    diagnostics.constraintResolutionTimeMs = Date.now() - constraintStart;

    // Capability Discovery
    const capabilityStart = Date.now();
    let capabilities: string[] = [];
    try {
      capabilities = this.capabilityResolver.resolve(cognitiveContext);
    } catch {
      capabilities = ["MINIMAL_CAPABILITIES"];
    }
    diagnostics.capabilityResolutionTimeMs = Date.now() - capabilityStart;

    // Mode Resolution
    const modeStart = Date.now();
    let executionMode = "ReadOnly";
    try {
      executionMode = this.modeResolver.resolve(cognitiveContext);
    } catch {
      executionMode = "ReadOnly";
    }
    diagnostics.executionModeResolutionTimeMs = Date.now() - modeStart;

    const metadata = new TaskContextMetadata(resolvedAt, "1.0.0", diagnostics);

    return new RuntimeTaskContext(
      cognitiveContext.identity,
      cognitiveContext.businessContext,
      cognitiveContext.workspace,
      goal,
      constraints,
      capabilities,
      executionMode,
      cognitiveContext.permissions,
      metadata,
      diagnostics
    );
  }
}
