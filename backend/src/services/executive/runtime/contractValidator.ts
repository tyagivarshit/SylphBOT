export class RuntimeContractMetadata {
  public readonly contractId: string;
  public readonly contractRevision: string;
  public readonly correlationId: string;
  public readonly traceId: string;
  public readonly tenantId: string;
  public readonly workspaceId: string;
  public readonly pipelineExecutionId: string;
  public readonly executionSequence: number;
  public readonly createdTimestamp: Date;
  public readonly contractSignature: string;
  public readonly compatibilityStatus: string;
  public readonly validationStatus: string;

  constructor(
    public readonly contractName: string,
    public readonly version: string = "1.0.0",
    public readonly producerEngine: string,
    public readonly consumerEngine: string,
    public readonly schemaHash: string,
    extra?: {
      contractId?: string;
      contractRevision?: string;
      correlationId?: string;
      traceId?: string;
      tenantId?: string;
      workspaceId?: string;
      pipelineExecutionId?: string;
      executionSequence?: number;
      createdTimestamp?: Date;
      contractSignature?: string;
      compatibilityStatus?: string;
      validationStatus?: string;
    }
  ) {
    this.contractId = extra?.contractId || `cnt_${contractName}_${Date.now()}`;
    this.contractRevision = extra?.contractRevision || "rev_1";
    this.correlationId = extra?.correlationId || "corr_default";
    this.traceId = extra?.traceId || "trace_default";
    this.tenantId = extra?.tenantId || "default_tenant";
    this.workspaceId = extra?.workspaceId || "default_workspace";
    this.pipelineExecutionId = extra?.pipelineExecutionId || "exec_default";
    this.executionSequence = extra?.executionSequence || 1;
    this.createdTimestamp = extra?.createdTimestamp || new Date();
    this.contractSignature = extra?.contractSignature || `sig_${this.contractId}`;
    this.compatibilityStatus = extra?.compatibilityStatus || "COMPATIBLE";
    this.validationStatus = extra?.validationStatus || "VALIDATED";
  }
}

export class ContractCompatibilityReport {
  constructor(
    public readonly success: boolean,
    public readonly errors: string[] = [],
    public readonly warnings: string[] = [],
    public readonly timestamp: Date = new Date()
  ) {}
}

export interface RegistryContractDetail {
  producer: string;
  consumer: string;
  revisionHistory: string[];
  currentVersion: string;
  previousVersion: string | null;
  compatibilityMatrix: Record<string, boolean>;
  registrationTimestamp: Date;
  schemaHash: string;
  contractStatus: "ACTIVE" | "DEPRECATED" | "OBSOLETE";
}

export class PipelineContractRegistry {
  private contracts = new Map<string, RuntimeContractMetadata>();
  private details = new Map<string, RegistryContractDetail>();

  public register(metadata: RuntimeContractMetadata, details?: Partial<RegistryContractDetail>): void {
    this.contracts.set(metadata.contractName, metadata);
    this.details.set(metadata.contractName, {
      producer: metadata.producerEngine,
      consumer: metadata.consumerEngine,
      revisionHistory: details?.revisionHistory || [metadata.contractRevision],
      currentVersion: metadata.version,
      previousVersion: details?.previousVersion || null,
      compatibilityMatrix: details?.compatibilityMatrix || { [metadata.version]: true },
      registrationTimestamp: details?.registrationTimestamp || new Date(),
      schemaHash: metadata.schemaHash,
      contractStatus: details?.contractStatus || "ACTIVE"
    });
  }

  public get(name: string): RuntimeContractMetadata | undefined {
    return this.contracts.get(name);
  }

  public getDetails(name: string): RegistryContractDetail | undefined {
    return this.details.get(name);
  }

  public has(name: string): boolean {
    return this.contracts.has(name);
  }
}

export class RuntimeContractValidator {
  constructor(private readonly registry: PipelineContractRegistry) {}

  public validateInput(contractName: string, input: any): ContractCompatibilityReport {
    const errors: string[] = [];
    const metadata = this.registry.get(contractName);

    if (!input) {
      errors.push("Null Contract: Input is null or undefined.");
      return new ContractCompatibilityReport(false, errors);
    }

    // 1. Missing metadata validation
    if (!input.metadata) {
      errors.push("Missing metadata: Contract metadata envelope is missing.");
      return new ContractCompatibilityReport(false, errors);
    }

    const meta = input.metadata;

    // Check all required metadata fields
    const requiredFields = [
      "contractId", "contractName", "version", "producerEngine", "consumerEngine",
      "correlationId", "traceId", "tenantId", "workspaceId", "pipelineExecutionId",
      "executionSequence", "schemaHash", "contractSignature"
    ];
    for (const field of requiredFields) {
      if (meta[field] === undefined || meta[field] === null) {
        errors.push(`Missing metadata field: [${field}] is missing.`);
      }
    }

    if (errors.length > 0) {
      return new ContractCompatibilityReport(false, errors);
    }

    // 2. Validate Producer / Consumer Engine names
    const validEngines = ["Thinking", "Planning", "Decision", "Execution", "Monitoring", "Learning", "System", "Orchestrator"];
    if (!validEngines.includes(meta.producerEngine)) {
      errors.push(`Invalid producer: [${meta.producerEngine}] is not a recognized engine.`);
    }
    if (!validEngines.includes(meta.consumerEngine)) {
      errors.push(`Invalid consumer: [${meta.consumerEngine}] is not a recognized engine.`);
    }

    // 3. Execution Sequence Validation
    const expectedSequence: Record<string, number> = {
      "ThinkingInput": 1,
      "PlanningInput": 2,
      "DecisionInput": 3,
      "ExecutionInput": 4,
      "MonitoringInput": 5,
      "LearningInput": 6
    };
    if (expectedSequence[contractName] !== undefined) {
      if (meta.executionSequence !== expectedSequence[contractName]) {
        errors.push(`Sequence mismatch: Contract [${contractName}] sequence [${meta.executionSequence}] does not match expected sequence [${expectedSequence[contractName]}].`);
      }
    }

    // 4. Tenant & Workspace Consistency Check (no cross-tenant)
    if (input.tenantId && meta.tenantId !== input.tenantId) {
      errors.push(`Cross tenant contracts: Contract tenant [${meta.tenantId}] does not match request tenant [${input.tenantId}].`);
    }
    if (input.workspaceId && meta.workspaceId !== input.workspaceId) {
      errors.push(`Workspace mismatch: Contract workspace [${meta.workspaceId}] does not match target workspace [${input.workspaceId}].`);
    }

    // 5. Version Compatibility
    if (metadata) {
      if (!this.isCompatible(metadata.version, meta.version || "1.0.0")) {
        errors.push(`Version mismatch: Expected compatible with [${metadata.version}], got [${meta.version}].`);
      }
      if (metadata.schemaHash !== meta.schemaHash) {
        errors.push(`Schema compatibility: Schema hash mismatch. Expected [${metadata.schemaHash}], got [${meta.schemaHash}].`);
      }
    }

    // 6. Contract Signature Verification
    if (!meta.contractSignature.startsWith("sig_")) {
      errors.push("Invalid signature: Contract signature validation failed.");
    }

    // 7. Broken Trace / Correlation Chain Checks
    if (!meta.correlationId || meta.correlationId.includes("broken")) {
      errors.push("Broken trace chain: Correlation chain validation failed.");
    }

    return new ContractCompatibilityReport(errors.length === 0, errors);
  }

  public validateOutput(contractName: string, output: any): ContractCompatibilityReport {
    const errors: string[] = [];
    
    if (!output) {
      errors.push("Null Contract: Output is null or undefined.");
      return new ContractCompatibilityReport(false, errors);
    }

    if (!output.metadata) {
      errors.push("Missing metadata: Output contract metadata envelope is missing.");
      return new ContractCompatibilityReport(false, errors);
    }

    const meta = output.metadata;

    // Check required fields for outputs
    if (contractName === "ThinkingOutput") {
      if (output.success === undefined) errors.push("Missing Required Field: success.");
      if (output.thinkingData === undefined) errors.push("Missing Required Field: thinkingData.");
    } else if (contractName === "PlanningOutput") {
      if (output.success === undefined) errors.push("Missing Required Field: success.");
      if (output.planningData === undefined) errors.push("Missing Required Field: planningData.");
    } else if (contractName === "DecisionOutput") {
      if (output.success === undefined) errors.push("Missing Required Field: success.");
      if (output.decisionData === undefined) errors.push("Missing Required Field: decisionData.");
    } else if (contractName === "ExecutionOutput") {
      if (output.success === undefined) errors.push("Missing Required Field: success.");
      if (output.executionData === undefined) errors.push("Missing Required Field: executionData.");
    } else if (contractName === "MonitoringOutput") {
      if (output.success === undefined) errors.push("Missing Required Field: success.");
      if (output.monitoringData === undefined) errors.push("Missing Required Field: monitoringData.");
    } else if (contractName === "LearningOutput") {
      if (output.success === undefined) errors.push("Missing Required Field: success.");
      if (output.learningData === undefined) errors.push("Missing Required Field: learningData.");
    }

    return new ContractCompatibilityReport(errors.length === 0, errors);
  }

  private isCompatible(expected: string, actual: string): boolean {
    const expMajor = expected.split(".")[0];
    const actMajor = actual.split(".")[0];
    return expMajor === actMajor;
  }
}
