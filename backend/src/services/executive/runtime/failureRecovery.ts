export type RuntimeFailureCategory =
  | "Recoverable"
  | "NonRecoverable"
  | "Fatal"
  | "Transient"
  | "Permanent"
  | "ValidationFailure"
  | "SecurityFailure"
  | "DependencyFailure"
  | "TimeoutFailure"
  | "ConfigurationFailure"
  | "UnknownFailure";

export type RuntimeRecoveryStrategy =
  | "Retry"
  | "Skip Engine"
  | "Continue Pipeline"
  | "Abort Pipeline"
  | "Safe Termination"
  | "Fallback Result"
  | "No Recovery";

export class RuntimeFailureMetadata {
  constructor(
    public readonly failureId: string,
    public readonly failureType: RuntimeFailureCategory,
    public readonly failureSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    public readonly originEngine: string,
    public readonly timestamp: Date = new Date(),
    public readonly correlationId: string,
    public readonly pipelineExecutionId: string,
    public readonly recoveryDecision: RuntimeRecoveryStrategy,
    public readonly message: string
  ) {}
}

export class RuntimeRecoveryPolicy {
  constructor(
    public readonly retryCount: number = 0,
    public readonly maximumRetries: number = 3,
    public readonly retryDelayMetadata: Record<string, any> = { delayMs: 100 },
    public readonly retryReason: string = "",
    public readonly retryOutcome: string = ""
  ) {}
}

export class RuntimeTerminationReport {
  constructor(
    public readonly terminationReason: string,
    public readonly failedEngine: string,
    public readonly completedEngines: string[],
    public readonly remainingEngines: string[],
    public readonly correlationId: string,
    public readonly pipelineExecutionId: string,
    public readonly failureSummary: string,
    public readonly diagnostics: Record<string, any> = {}
  ) {}
}

export class RuntimeRecoveryDiagnostics {
  public failureCount: number = 0;
  public recoveryCount: number = 0;
  public recoveredPipelines: number = 0;
  public abortedPipelines: number = 0;
  public skippedEngines: number = 0;
  public retryAttempts: number = 0;
  public recoveryDurationMs: number = 0;
  public readonly failureCategories: Record<string, number> = {};
}

export class RuntimeFailureClassifier {
  public classify(error: Error, engineName: string): { type: RuntimeFailureCategory; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } {
    const msg = error.message;
    
    if (msg.includes("Security Violation") || msg.includes("Unauthorized") || msg.includes("Cross-tenant")) {
      return { type: "SecurityFailure", severity: "CRITICAL" };
    }
    if (msg.includes("Validation") || msg.includes("Schema") || msg.includes("sequence")) {
      return { type: "ValidationFailure", severity: "HIGH" };
    }
    if (msg.includes("Timeout")) {
      return { type: "TimeoutFailure", severity: "MEDIUM" };
    }
    if (msg.includes("Dependency") || msg.includes("Missing required input")) {
      return { type: "DependencyFailure", severity: "HIGH" };
    }
    if (msg.includes("Configuration")) {
      return { type: "ConfigurationFailure", severity: "MEDIUM" };
    }

    return { type: "UnknownFailure", severity: "MEDIUM" };
  }
}

export class RuntimeRecoveryCoordinator {
  public determineStrategy(category: RuntimeFailureCategory, severity: string): RuntimeRecoveryStrategy {
    if (category === "SecurityFailure" || severity === "CRITICAL") {
      return "Abort Pipeline";
    }
    if (category === "ValidationFailure") {
      return "Safe Termination";
    }
    if (category === "TimeoutFailure" || category === "DependencyFailure") {
      return "Retry";
    }
    return "Continue Pipeline";
  }
}

export class RuntimeFailureManager {
  private readonly classifier = new RuntimeFailureClassifier();
  private readonly coordinator = new RuntimeRecoveryCoordinator();
  public readonly diagnostics = new RuntimeRecoveryDiagnostics();

  public handleFailure(
    error: Error,
    engineName: string,
    correlationId: string,
    pipelineExecutionId: string,
    completedEngines: string[],
    remainingEngines: string[]
  ): { metadata: RuntimeFailureMetadata; strategy: RuntimeRecoveryStrategy; terminationReport?: RuntimeTerminationReport } {
    const start = Date.now();
    this.diagnostics.failureCount++;

    const classification = this.classifier.classify(error, engineName);
    const strategy = this.coordinator.determineStrategy(classification.type, classification.severity);

    this.diagnostics.failureCategories[classification.type] = (this.diagnostics.failureCategories[classification.type] || 0) + 1;
    if (strategy === "Abort Pipeline" || strategy === "Safe Termination") {
      this.diagnostics.abortedPipelines++;
    } else {
      this.diagnostics.recoveryCount++;
    }

    const failureId = `fail_${Date.now()}`;
    const metadata = new RuntimeFailureMetadata(
      failureId,
      classification.type,
      classification.severity,
      engineName,
      new Date(),
      correlationId,
      pipelineExecutionId,
      strategy,
      error.message
    );

    let terminationReport: RuntimeTerminationReport | undefined;
    if (strategy === "Abort Pipeline" || strategy === "Safe Termination") {
      terminationReport = new RuntimeTerminationReport(
        error.message,
        engineName,
        completedEngines,
        remainingEngines,
        correlationId,
        pipelineExecutionId,
        `Pipeline terminated due to engine ${engineName} error.`
      );
    }

    this.diagnostics.recoveryDurationMs += Date.now() - start;
    return { metadata, strategy, terminationReport };
  }
}
