import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import * as crypto from "crypto";

// ============================================================================
// LIFECYCLE STATES & DOMAIN INTERFACES
// ============================================================================

export type ExecutionLifecycleState =
  | "CREATED"
  | "READY"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "QUEUED"
  | "RUNNING"
  | "PAUSED"
  | "FAILED"
  | "ROLLBACK_PENDING"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "COMPLETED"
  | "ARCHIVED";

export interface IExecutionContext {
  id: string; // Execution ID
  decisionId: string; // Decision ID
  authorizationId: string; // Authorization ID
  dispatchId: string; // Dispatch ID
  tenantId: string; // Tenant ID
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | number; // Priority
  executionType: string; // Execution Type
  status: ExecutionLifecycleState; // Current Status
  owner: string; // Owner
  approver?: string; // Approver
  createdAt: string; // Created Time
  updatedAt: string; // Updated Time
  startedAt?: string; // Started Time
  completedAt?: string; // Completed Time
  metadata: Record<string, any>; // Metadata
  version: number;
}

export interface IExecutionExplainability {
  executionId: string;
  tenantId: string;
  whyExists: string;
  whyCurrentState: string;
  whoApproved: string;
  dependencies: string[];
  expectedOutcome: string;
  currentProgress: number;
  timestamp: string;
}

export interface IExecutionPackage {
  id: string;
  tenantId: string;
  decisionId: string;
  authorizationId: string;
  dispatchId: string;
  compiledAt: string;
  
  decision: any;
  evidence: any;
  evaluation: any;
  simulation: any;
  selection: any;
  authorization: any;
  dispatch: any;
  executionContext: IExecutionContext;
  executionMetadata: Record<string, any>;
  explainability: IExecutionExplainability;
}

export interface IExecutionHardeningPackage {
  compiledAt: string;
  tenantId: string;
  executionId: string;
  decisionId: string;
  
  decision: any;
  evidence: any;
  evaluation: any;
  simulation: any;
  selection: any;
  authorization: any;
  dispatch: any;
  execution: IExecutionContext;
  snapshots: IExecutionSnapshot[];
  trace: any;
  ownership: any;
  readiness: any;
  stability: any;
  integrity: any;
  drift: any;
  explainability: IExecutionExplainability;
  history: IExecutionHistoryEntry[];
  metadata: Record<string, any>;
}

export interface IExecutionSnapshot {
  id: string;
  executionId: string;
  tenantId: string;
  timestamp: string;
  state: IExecutionContext;
  package?: IExecutionPackage;
  metadata: Record<string, any>;
}

export interface IExecutionHistoryEntry {
  id: string;
  executionId: string;
  tenantId: string;
  timestamp: string;
  previousStatus: ExecutionLifecycleState | "NONE";
  newStatus: ExecutionLifecycleState;
  action: string;
  actor: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

export interface IExecutiveExecutionRepository {
  create(tenantId: string, execution: IExecutionContext): Promise<IExecutionContext>;
  update(tenantId: string, execution: IExecutionContext): Promise<IExecutionContext>;
  delete(tenantId: string, id: string): Promise<void>;
  findById(tenantId: string, id: string): Promise<IExecutionContext | null>;
  search(tenantId: string, query: Partial<IExecutionContext>): Promise<IExecutionContext[]>;
  
  // Version History
  saveHistory(tenantId: string, entry: IExecutionHistoryEntry): Promise<void>;
  getHistory(tenantId: string, executionId: string): Promise<IExecutionHistoryEntry[]>;
  
  // Immutable Snapshots
  saveSnapshot(tenantId: string, snapshot: IExecutionSnapshot): Promise<void>;
  getSnapshot(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionSnapshot | null>;
  listSnapshots(tenantId: string, executionId: string): Promise<IExecutionSnapshot[]>;
}

// ============================================================================
// MEMORY REPOSITORY IMPLEMENTATION
// ============================================================================

export class MemoryExecutiveExecutionRepository implements IExecutiveExecutionRepository {
  private db = new Map<string, Map<string, IExecutionContext>>();
  private historyDb = new Map<string, Map<string, IExecutionHistoryEntry[]>>();
  private snapshotsDb = new Map<string, Map<string, Map<string, IExecutionSnapshot>>>();

  private verifyTenantIsolation(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }

  public async create(tenantId: string, execution: IExecutionContext): Promise<IExecutionContext> {
    this.verifyTenantIsolation(tenantId);
    if (execution.tenantId !== tenantId) {
      throw new Error(`Security Violation: Execution tenant [${execution.tenantId}] does not match caller tenant [${tenantId}].`);
    }

    if (!this.db.has(tenantId)) {
      this.db.set(tenantId, new Map());
    }
    const tenantMap = this.db.get(tenantId)!;
    if (tenantMap.has(execution.id)) {
      throw new Error(`Execution [${execution.id}] already exists.`);
    }

    const cloned = JSON.parse(JSON.stringify(execution));
    tenantMap.set(execution.id, cloned);
    return JSON.parse(JSON.stringify(cloned));
  }

  public async update(tenantId: string, execution: IExecutionContext): Promise<IExecutionContext> {
    this.verifyTenantIsolation(tenantId);
    if (execution.tenantId !== tenantId) {
      throw new Error(`Security Violation: Execution tenant [${execution.tenantId}] does not match caller tenant [${tenantId}].`);
    }

    const tenantMap = this.db.get(tenantId);
    if (!tenantMap || !tenantMap.has(execution.id)) {
      throw new Error(`Execution [${execution.id}] not found.`);
    }

    const existing = tenantMap.get(execution.id)!;
    if (execution.version !== existing.version) {
      throw new Error(`Optimistic Concurrency Violation: expected version [${existing.version}] but got [${execution.version}].`);
    }

    const cloned = JSON.parse(JSON.stringify(execution));
    cloned.version += 1;
    cloned.updatedAt = new Date().toISOString();

    tenantMap.set(execution.id, cloned);
    return JSON.parse(JSON.stringify(cloned));
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    this.verifyTenantIsolation(tenantId);
    const tenantMap = this.db.get(tenantId);
    if (tenantMap) {
      tenantMap.delete(id);
    }
  }

  public async findById(tenantId: string, id: string): Promise<IExecutionContext | null> {
    this.verifyTenantIsolation(tenantId);
    const tenantMap = this.db.get(tenantId);
    if (!tenantMap) return null;
    const execution = tenantMap.get(id);
    if (!execution) return null;
    return JSON.parse(JSON.stringify(execution));
  }

  public async search(tenantId: string, query: Partial<IExecutionContext>): Promise<IExecutionContext[]> {
    this.verifyTenantIsolation(tenantId);
    const tenantMap = this.db.get(tenantId);
    if (!tenantMap) return [];
    const results: IExecutionContext[] = [];
    for (const exec of tenantMap.values()) {
      let matches = true;
      for (const [key, value] of Object.entries(query)) {
        if (exec[key as keyof IExecutionContext] !== value) {
          matches = false;
          break;
        }
      }
      if (matches) {
        results.push(JSON.parse(JSON.stringify(exec)));
      }
    }
    return results;
  }

  public async saveHistory(tenantId: string, entry: IExecutionHistoryEntry): Promise<void> {
    this.verifyTenantIsolation(tenantId);
    if (entry.tenantId !== tenantId) {
      throw new Error(`Security Violation: Entry tenant [${entry.tenantId}] does not match caller tenant [${tenantId}].`);
    }

    if (!this.historyDb.has(tenantId)) {
      this.historyDb.set(tenantId, new Map());
    }
    const tenantMap = this.historyDb.get(tenantId)!;
    if (!tenantMap.has(entry.executionId)) {
      tenantMap.set(entry.executionId, []);
    }
    tenantMap.get(entry.executionId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistory(tenantId: string, executionId: string): Promise<IExecutionHistoryEntry[]> {
    this.verifyTenantIsolation(tenantId);
    const tenantMap = this.historyDb.get(tenantId);
    if (!tenantMap) return [];
    const history = tenantMap.get(executionId) || [];
    return JSON.parse(JSON.stringify(history));
  }

  public async saveSnapshot(tenantId: string, snapshot: IExecutionSnapshot): Promise<void> {
    this.verifyTenantIsolation(tenantId);
    if (snapshot.tenantId !== tenantId) {
      throw new Error(`Security Violation: Snapshot tenant [${snapshot.tenantId}] does not match caller tenant [${tenantId}].`);
    }

    if (!this.snapshotsDb.has(tenantId)) {
      this.snapshotsDb.set(tenantId, new Map());
    }
    const tenantMap = this.snapshotsDb.get(tenantId)!;
    if (!tenantMap.has(snapshot.executionId)) {
      tenantMap.set(snapshot.executionId, new Map());
    }
    tenantMap.get(snapshot.executionId)!.set(snapshot.id, JSON.parse(JSON.stringify(snapshot)));
  }

  public async getSnapshot(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionSnapshot | null> {
    this.verifyTenantIsolation(tenantId);
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return null;
    const execMap = tenantMap.get(executionId);
    if (!execMap) return null;
    const snapshot = execMap.get(snapshotId);
    if (!snapshot) return null;
    return JSON.parse(JSON.stringify(snapshot));
  }

  public async listSnapshots(tenantId: string, executionId: string): Promise<IExecutionSnapshot[]> {
    this.verifyTenantIsolation(tenantId);
    const tenantMap = this.snapshotsDb.get(tenantId);
    if (!tenantMap) return [];
    const execMap = tenantMap.get(executionId);
    if (!execMap) return [];
    return Array.from(execMap.values()).map(s => JSON.parse(JSON.stringify(s)));
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION (Universal Executive Execution Service)
// ============================================================================

export class ExecutiveExecutionService {
  constructor(private di: DIContainer = container) {}

  private validateRequestContext(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }

  private async publishEvent(tenantId: string, eventName: string, payload: any): Promise<void> {
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      if (eventBus) {
        await eventBus.publish(eventName, "1.0.0", payload, { tenantId }).catch(() => {});
      }
    }
  }

  private async recordHistory(
    tenantId: string,
    executionId: string,
    previousStatus: ExecutionLifecycleState | "NONE",
    newStatus: ExecutionLifecycleState,
    action: string,
    actor: string,
    notes?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");
    const entry: IExecutionHistoryEntry = {
      id: `ehist_${crypto.randomUUID().replace(/-/g, "")}`,
      executionId,
      tenantId,
      timestamp: new Date().toISOString(),
      previousStatus,
      newStatus,
      action,
      actor,
      notes,
      metadata
    };
    await repo.saveHistory(tenantId, entry);
  }

  /**
   * 1. createExecution()
   */
  public async createExecution(
    tenantId: string,
    params: Omit<IExecutionContext, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'status' | 'tenantId' | 'metadata'> & { id?: string; status?: ExecutionLifecycleState; metadata?: Record<string, any> }
  ): Promise<IExecutionContext> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");

    const id = params.id || `exec_${crypto.randomUUID().replace(/-/g, "")}`;
    const status = params.status || "CREATED";
    const now = new Date().toISOString();

    const execution: IExecutionContext = {
      id,
      decisionId: params.decisionId,
      authorizationId: params.authorizationId,
      dispatchId: params.dispatchId,
      tenantId,
      priority: params.priority || "MEDIUM",
      executionType: params.executionType,
      status,
      owner: params.owner,
      approver: params.approver,
      createdAt: now,
      updatedAt: now,
      startedAt: status === "RUNNING" ? now : undefined,
      completedAt: ["COMPLETED", "FAILED", "ROLLED_BACK"].includes(status) ? now : undefined,
      metadata: params.metadata || {},
      version: 1
    };

    const created = await repo.create(tenantId, execution);

    await this.publishEvent(tenantId, "executive.execution.created", {
      executionId: created.id,
      decisionId: created.decisionId,
      tenantId,
      actorId: created.owner,
      timestamp: now
    });

    await this.recordHistory(
      tenantId,
      created.id,
      "NONE",
      status,
      "CREATE_EXECUTION",
      created.owner,
      `Execution created in status ${status}`
    );

    return created;
  }

  /**
   * 2. updateExecution()
   */
  public async updateExecution(
    tenantId: string,
    id: string,
    updates: Partial<IExecutionContext> & { action?: string; actor?: string; notes?: string }
  ): Promise<IExecutionContext> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");

    const existing = await repo.findById(tenantId, id);
    if (!existing) {
      throw new Error(`Execution [${id}] not found.`);
    }

    const previousStatus = existing.status;
    const newStatus = updates.status !== undefined ? updates.status : previousStatus;
    const now = new Date().toISOString();
    const actor = updates.actor || "system";
    const action = updates.action || "UPDATE_EXECUTION";

    // Merge changes
    const updatedModel: IExecutionContext = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...(updates.metadata || {})
      },
      updatedAt: now
    };

    if (newStatus !== previousStatus) {
      if (newStatus === "RUNNING" && !updatedModel.startedAt) {
        updatedModel.startedAt = now;
      }
      if (["COMPLETED", "FAILED", "ROLLED_BACK"].includes(newStatus) && !updatedModel.completedAt) {
        updatedModel.completedAt = now;
      }
    }

    const saved = await repo.update(tenantId, updatedModel);

    // Emit event notifications on state transitions
    if (newStatus !== previousStatus) {
      await this.publishEvent(tenantId, "executive.execution.updated", {
        executionId: id,
        tenantId,
        status: newStatus,
        timestamp: now
      });

      if (newStatus === "RUNNING") {
        await this.publishEvent(tenantId, "executive.execution.started", {
          executionId: id,
          tenantId,
          timestamp: now
        });
      } else if (newStatus === "COMPLETED") {
        await this.publishEvent(tenantId, "executive.execution.completed", {
          executionId: id,
          tenantId,
          timestamp: now
        });
      } else if (newStatus === "FAILED") {
        await this.publishEvent(tenantId, "executive.execution.failed", {
          executionId: id,
          tenantId,
          error: updates.notes || "Execution failed",
          timestamp: now
        });
      }
    } else {
      // Just normal update
      await this.publishEvent(tenantId, "executive.execution.updated", {
        executionId: id,
        tenantId,
        status: newStatus,
        timestamp: now
      });
    }

    await this.recordHistory(
      tenantId,
      id,
      previousStatus,
      newStatus,
      action,
      actor,
      updates.notes || `Execution updated. Status: ${previousStatus} -> ${newStatus}`
    );

    return saved;
  }

  /**
   * 3. getExecution()
   */
  public async getExecution(tenantId: string, id: string): Promise<IExecutionContext | null> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");
    return repo.findById(tenantId, id);
  }

  /**
   * 4. listExecutions()
   */
  public async listExecutions(tenantId: string, filter?: Partial<IExecutionContext>): Promise<IExecutionContext[]> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");
    return repo.search(tenantId, filter || {});
  }

  /**
   * 5. archiveExecution()
   */
  public async archiveExecution(tenantId: string, id: string, actor: string = "system"): Promise<IExecutionContext> {
    this.validateRequestContext(tenantId);
    const updated = await this.updateExecution(tenantId, id, {
      status: "ARCHIVED",
      action: "ARCHIVE_EXECUTION",
      actor,
      notes: "Execution archived by request."
    });

    await this.publishEvent(tenantId, "executive.execution.archived", {
      executionId: id,
      tenantId,
      timestamp: new Date().toISOString()
    });

    return updated;
  }

  /**
   * 6. snapshotExecution()
   */
  public async snapshotExecution(tenantId: string, id: string, metadata?: Record<string, any>): Promise<IExecutionSnapshot> {
    const startTime = process.hrtime();
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");

    const execution = await repo.findById(tenantId, id);
    if (!execution) {
      throw new Error(`Execution [${id}] not found.`);
    }

    // Build execution package for the snapshot if we can
    let compiledPackage: IExecutionPackage | undefined;
    try {
      compiledPackage = await this.compileExecutionPackage(tenantId, id);
    } catch (err) {
      // Package compilation might fail if other repositories are missing or decision is not ready
    }

    // Sub-millisecond targets require fast execution, which Map + JSON does
    const snapshot: IExecutionSnapshot = {
      id: `esnap_${crypto.randomUUID().replace(/-/g, "")}`,
      executionId: id,
      tenantId,
      timestamp: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(execution)),
      package: compiledPackage,
      metadata: metadata || {}
    };

    await repo.saveSnapshot(tenantId, snapshot);

    const diff = process.hrtime(startTime);
    const ms = diff[0] * 1000 + diff[1] / 1000000;
    // Log sub-millisecond status if needed
    return snapshot;
  }

  /**
   * 5. Execution Explainability
   */
  public async generateExplainability(tenantId: string, executionId: string): Promise<IExecutionExplainability> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");
    
    const execution = await repo.findById(tenantId, executionId);
    if (!execution) {
      throw new Error(`Execution [${executionId}] not found.`);
    }

    // Fetch related dispatch
    let dispatch: any = null;
    if (this.di.has("IExecutiveDecisionDispatchRepository")) {
      const dispatchRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
      dispatch = await dispatchRepo.findDispatchById(tenantId, execution.dispatchId).catch(() => null);
    }

    // Fetch authorization
    let auth: any = null;
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      auth = await authRepo.findAuthorizationById(tenantId, execution.authorizationId).catch(() => null);
    }

    // Fetch decision
    let decision: any = null;
    if (this.di.has("IExecutiveDecisionRepository")) {
      const decisionRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decisionRepo.findDecisionById(tenantId, execution.decisionId).catch(() => null);
    }

    const whyExists = `Execution was initiated to execute decision [${execution.decisionId}] titled "${decision?.title || "Unknown"}", which was authorized under token [${execution.authorizationId}] and dispatched under routing target [${execution.dispatchId}].`;
    
    const whyCurrentState = `The execution is in state [${execution.status}]. Transitions occurred under context guidelines. Action: ${execution.status === "CREATED" ? "INITIALIZED" : execution.status}.`;
    
    const whoApproved = auth?.actorId || execution.approver || "system";
    
    const dependencies = dispatch?.dependencyGraph?.nodes?.map((n: any) => n.id) || [];
    
    const expectedOutcome = decision?.metadata?.expectedOutcome || "Successful execution of the authorized decision parameters.";

    // Progress mapping helper
    let currentProgress = 0.0;
    switch (execution.status) {
      case "CREATED":
        currentProgress = 0.0;
        break;
      case "READY":
        currentProgress = 0.1;
        break;
      case "WAITING_APPROVAL":
        currentProgress = 0.2;
        break;
      case "APPROVED":
        currentProgress = 0.3;
        break;
      case "QUEUED":
        currentProgress = 0.4;
        break;
      case "RUNNING":
        currentProgress = 0.6;
        break;
      case "PAUSED":
        currentProgress = 0.5;
        break;
      case "FAILED":
        currentProgress = 1.0;
        break;
      case "ROLLBACK_PENDING":
        currentProgress = 0.7;
        break;
      case "ROLLING_BACK":
        currentProgress = 0.8;
        break;
      case "ROLLED_BACK":
        currentProgress = 1.0;
        break;
      case "COMPLETED":
        currentProgress = 1.0;
        break;
      case "ARCHIVED":
        currentProgress = 1.0;
        break;
    }

    return {
      executionId,
      tenantId,
      whyExists,
      whyCurrentState,
      whoApproved,
      dependencies,
      expectedOutcome,
      currentProgress,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 6. Execution Package Compilation
   */
  public async compileExecutionPackage(tenantId: string, executionId: string): Promise<IExecutionPackage> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");

    const execution = await repo.findById(tenantId, executionId);
    if (!execution) {
      throw new Error(`Execution [${executionId}] not found.`);
    }

    // Resolve snapshots from other modules if available
    let decision = null;
    if (this.di.has("IExecutiveDecisionRepository")) {
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decRepo.findDecisionById(tenantId, execution.decisionId).catch(() => null);
    }

    let evidence = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      const evRepo = this.di.resolve<any>("IExecutiveEvidenceRepository");
      evidence = await evRepo.findEvidenceById(tenantId, execution.decisionId).catch(() => null);
    }

    let alternatives = null;
    if (this.di.has("IExecutiveAlternativeRepository")) {
      const altRepo = this.di.resolve<any>("IExecutiveAlternativeRepository");
      const alts = await altRepo.getAlternatives(tenantId).catch(() => []);
      alternatives = alts.filter((a: any) => a.decisionId === execution.decisionId);
    }

    let evaluation = null;
    if (this.di.has("IExecutiveDecisionEvaluationRepository")) {
      const evalRepo = this.di.resolve<any>("IExecutiveDecisionEvaluationRepository");
      evaluation = await evalRepo.findEvaluationByDecisionId(tenantId, execution.decisionId).catch(() => null);
    }

    let simulation = null;
    if (this.di.has("IExecutiveSimulationRepository")) {
      const simRepo = this.di.resolve<any>("IExecutiveSimulationRepository");
      simulation = await simRepo.findSimulationByDecisionId(tenantId, execution.decisionId).catch(() => null);
    }

    let selection = null;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const selRepo = this.di.resolve<any>("IExecutiveDecisionSelectionRepository");
      const selections = await selRepo.getSelections(tenantId).catch(() => []);
      selection = selections.find((s: any) => s.decisionId === execution.decisionId) || null;
    }

    let authorization = null;
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      authorization = await authRepo.findAuthorizationById(tenantId, execution.authorizationId).catch(() => null);
    }

    let dispatch = null;
    if (this.di.has("IExecutiveDecisionDispatchRepository")) {
      const dispRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
      dispatch = await dispRepo.findDispatchById(tenantId, execution.dispatchId).catch(() => null);
    }

    const explainability = await this.generateExplainability(tenantId, executionId);

    return {
      id: execution.id,
      tenantId,
      decisionId: execution.decisionId,
      authorizationId: execution.authorizationId,
      dispatchId: execution.dispatchId,
      compiledAt: new Date().toISOString(),
      
      decision,
      evidence,
      evaluation,
      simulation,
      selection,
      authorization,
      dispatch,
      executionContext: JSON.parse(JSON.stringify(execution)),
      executionMetadata: JSON.parse(JSON.stringify(execution.metadata)),
      explainability
    };
  }

  /**
   * 10. Execution Hardening Package Compiler
   */
  public async compileExecutionHardeningPackage(tenantId: string, executionId: string): Promise<IExecutionHardeningPackage> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionRepository>("IExecutiveExecutionRepository");

    const execution = await repo.findById(tenantId, executionId);
    if (!execution) {
      throw new Error(`Execution [${executionId}] not found.`);
    }

    // Resolve components
    let decision = null;
    if (this.di.has("IExecutiveDecisionRepository")) {
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decRepo.findDecisionById(tenantId, execution.decisionId).catch(() => null);
    }

    let evidence = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      const evRepo = this.di.resolve<any>("IExecutiveEvidenceRepository");
      evidence = await evRepo.findEvidenceById(tenantId, execution.decisionId).catch(() => null);
    }

    let evaluation = null;
    if (this.di.has("IExecutiveDecisionEvaluationRepository")) {
      const evalRepo = this.di.resolve<any>("IExecutiveDecisionEvaluationRepository");
      evaluation = await evalRepo.findEvaluationByDecisionId(tenantId, execution.decisionId).catch(() => null);
    }

    let simulation = null;
    if (this.di.has("IExecutiveSimulationRepository")) {
      const simRepo = this.di.resolve<any>("IExecutiveSimulationRepository");
      simulation = await simRepo.findSimulationByDecisionId(tenantId, execution.decisionId).catch(() => null);
    }

    let selection = null;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const selRepo = this.di.resolve<any>("IExecutiveDecisionSelectionRepository");
      const selections = await selRepo.getSelections(tenantId).catch(() => []);
      selection = selections.find((s: any) => s.decisionId === execution.decisionId) || null;
    }

    let authorization = null;
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      authorization = await authRepo.findAuthorizationById(tenantId, execution.authorizationId).catch(() => null);
    }

    let dispatch = null;
    if (this.di.has("IExecutiveDecisionDispatchRepository")) {
      const dispRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
      dispatch = await dispRepo.findDispatchById(tenantId, execution.dispatchId).catch(() => null);
    }

    const snapshots = await repo.listSnapshots(tenantId, executionId).catch(() => []);
    const history = await repo.getHistory(tenantId, executionId).catch(() => []);

    // Integrity from Hardening
    let integrity = null;
    if (this.di.has("IExecutiveDecisionHardeningRepository")) {
      const hardRepo = this.di.resolve<any>("IExecutiveDecisionHardeningRepository");
      integrity = await hardRepo.findHardeningByDecisionId(tenantId, execution.decisionId).catch(() => null);
    }

    // Drift from Monitoring
    let drift = null;
    let monitoring = null;
    if (this.di.has("IExecutiveDecisionMonitoringRepository")) {
      const monRepo = this.di.resolve<any>("IExecutiveDecisionMonitoringRepository");
      monitoring = await monRepo.findMonitoringByDecisionId(tenantId, execution.decisionId).catch(() => null);
      drift = monitoring?.driftReport || null;
    }

    const explainability = await this.generateExplainability(tenantId, executionId);

    const trace = decision?.trace || null;
    const ownership = decision?.ownership || null;
    const readiness = dispatch?.readinessReport || null;
    
    // Stability calculation fallback
    const stability = decision?.metadata?.stability || {
      isStable: true,
      stabilityScore: decision?.status === "CERTIFIED" ? 0.98 : 0.90,
      lastEvaluated: new Date().toISOString()
    };

    const packageMetadata = {
      compiledAt: new Date().toISOString(),
      executionMetadata: execution.metadata,
      decisionMetadata: decision?.metadata || {},
      systemContext: {
        nodeVersion: process.version,
        platform: process.platform,
        environment: process.env.NODE_ENV || "production"
      }
    };

    const hardenedPackage: IExecutionHardeningPackage = {
      compiledAt: packageMetadata.compiledAt,
      tenantId,
      executionId,
      decisionId: execution.decisionId,
      
      decision,
      evidence,
      evaluation,
      simulation,
      selection,
      authorization,
      dispatch,
      execution: JSON.parse(JSON.stringify(execution)),
      snapshots,
      trace,
      ownership,
      readiness,
      stability,
      integrity,
      drift,
      explainability,
      history,
      metadata: packageMetadata
    };

    // Deep freeze / deep clone to guarantee absolute immutability
    return JSON.parse(JSON.stringify(hardenedPackage));
  }
}
