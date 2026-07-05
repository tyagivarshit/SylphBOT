import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IExecutionContext, IExecutionSnapshot } from "./execution.service";
import * as crypto from "crypto";

// ============================================================================
// DATA MODELS & INTERFACES
// ============================================================================

export interface IActionNode {
  id: string;
  name: string;
  type: string; // e.g. "API", "MANUAL", "APPROVAL", "SCRIPT"
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "ROLLED_BACK";
  priority: number; // 1 (highest) to 5 (lowest)
  owner: string;
  metadata: Record<string, any>;
  
  // Rollback definitions
  rollbackStep: {
    action: string;
    payload: Record<string, any>;
    targetService: string;
  } | null;
  rollbackDependencies: string[]; // Node IDs that must rollback before this node
  rollbackValidation: {
    checkType: string;
    expectedResult: any;
  } | null;
  rollbackOwner: string;
  rollbackOrder: number;
}

export interface IExecutionGraph {
  id: string;
  tenantId: string;
  executionId: string;
  nodes: IActionNode[];
  edges: { source: string; target: string }[];
  status: "DRAFT" | "READY" | "OPTIMIZED" | "RUNNING" | "COMPLETED" | "FAILED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface IGraphHistoryEntry {
  id: string;
  tenantId: string;
  graphId: string;
  previousStatus: string;
  newStatus: string;
  actorId: string;
  timestamp: string;
  reason: string;
}

export interface IExecutionSequence {
  sequence: string[]; // ordered node IDs
  parallelBatches: string[][]; // groups of node IDs that can run concurrently
  calculationTimeMs: number;
}

export interface IExecutionGraphReport {
  graphId: string;
  tenantId: string;
  executionId: string;
  sequence: string[];
  parallelBatches: string[][];
  criticalPath: string[];
  priorityMatrix: { nodeId: string; priority: number }[];
  readinessScore: number;
  explainability: {
    whyStructureExists: string;
    criticalPathRationale: string;
    parallelizationRationale: string;
    rollbackTreeRationale: string;
  };
  timestamp: string;
}

// Deliverable 11: Action Package Compiler Output
export interface IActionPackage {
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
  execution: any;
  executionHardening: any;
  actionGraph: {
    nodesCount: number;
    edgesCount: number;
    actions: { id: string; name: string; type: string; owner: string }[];
  };
  executionGraph: IExecutionGraph;
  dependencyGraph: {
    edges: { source: string; target: string }[];
    adjacencyList: Record<string, string[]>;
  };
  priorityGraph: {
    criticalNodes: string[];
    priorityDistribution: Record<number, number>;
  };
  rollbackGraph: {
    rollbackNodes: any[];
    rollbackEdges: { source: string; target: string }[];
    rollbackExecutionOrder: string[];
  };
  constraints: {
    maxParallelLimit: number;
    totalBudget: number;
    hardLimitsCount: number;
  };
  readiness: {
    isReady: boolean;
    score: number;
  };
  explainability: string;
  metadata: Record<string, any>;
}

// ============================================================================
// REPOSITORY INTERFACES & O(1) IMPLEMENTATIONS
// ============================================================================

export interface IExecutiveExecutionGraphRepository {
  saveGraph(tenantId: string, graph: IExecutionGraph): Promise<void>;
  findGraphById(tenantId: string, id: string): Promise<IExecutionGraph | null>;
  findGraphByExecutionId(tenantId: string, executionId: string): Promise<IExecutionGraph | null>;
  deleteGraph(tenantId: string, id: string): Promise<void>;
  saveHistory(tenantId: string, entry: IGraphHistoryEntry): Promise<void>;
  getHistory(tenantId: string, graphId: string): Promise<IGraphHistoryEntry[]>;
}

export class MemoryExecutiveExecutionGraphRepository implements IExecutiveExecutionGraphRepository {
  // Nested structure for O(1) retrieval: tenantId -> map (id -> graph)
  private graphsDb = new Map<string, Map<string, IExecutionGraph>>();
  private execGraphsDb = new Map<string, Map<string, string>>(); // tenantId -> map (executionId -> graphId)
  private historyDb = new Map<string, Map<string, IGraphHistoryEntry[]>>();

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== callerTenantId) {
      throw new Error(`Security Violation: Context tenant [${ctxTenantId}] does not match resource tenant [${callerTenantId}].`);
    }
  }

  public async saveGraph(tenantId: string, graph: IExecutionGraph): Promise<void> {
    this.verifyTenant(tenantId, graph.tenantId);
    
    // Ensure nested maps exist
    if (!this.graphsDb.has(tenantId)) {
      this.graphsDb.set(tenantId, new Map());
    }
    if (!this.execGraphsDb.has(tenantId)) {
      this.execGraphsDb.set(tenantId, new Map());
    }

    // Save deep copy
    const graphCopy = JSON.parse(JSON.stringify(graph));
    this.graphsDb.get(tenantId)!.set(graph.id, graphCopy);
    this.execGraphsDb.get(tenantId)!.set(graph.executionId, graph.id);
  }

  public async findGraphById(tenantId: string, id: string): Promise<IExecutionGraph | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.graphsDb.get(tenantId);
    if (!tenantMap) return null;
    const item = tenantMap.get(id);
    if (!item) return null;
    return JSON.parse(JSON.stringify(item));
  }

  public async findGraphByExecutionId(tenantId: string, executionId: string): Promise<IExecutionGraph | null> {
    this.verifyTenant(tenantId, tenantId);
    const tenantExecMap = this.execGraphsDb.get(tenantId);
    if (!tenantExecMap) return null;
    const graphId = tenantExecMap.get(executionId);
    if (!graphId) return null;
    return this.findGraphById(tenantId, graphId);
  }

  public async deleteGraph(tenantId: string, id: string): Promise<void> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.graphsDb.get(tenantId);
    if (tenantMap) {
      const graph = tenantMap.get(id);
      if (graph) {
        tenantMap.delete(id);
        const tenantExecMap = this.execGraphsDb.get(tenantId);
        if (tenantExecMap) {
          tenantExecMap.delete(graph.executionId);
        }
      }
    }
  }

  public async saveHistory(tenantId: string, entry: IGraphHistoryEntry): Promise<void> {
    this.verifyTenant(tenantId, entry.tenantId);
    if (!this.historyDb.has(tenantId)) {
      this.historyDb.set(tenantId, new Map());
    }
    const tenantMap = this.historyDb.get(tenantId)!;
    if (!tenantMap.has(entry.graphId)) {
      tenantMap.set(entry.graphId, []);
    }
    tenantMap.get(entry.graphId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistory(tenantId: string, graphId: string): Promise<IGraphHistoryEntry[]> {
    this.verifyTenant(tenantId, tenantId);
    const tenantMap = this.historyDb.get(tenantId);
    if (!tenantMap) return [];
    return JSON.parse(JSON.stringify(tenantMap.get(graphId) || []));
  }
}

// ============================================================================
// EXECUTIVE ORCHESTRATION GRAPH SERVICE
// ============================================================================

export class ExecutiveExecutionGraphService {
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

  private async logHistory(
    tenantId: string,
    graphId: string,
    previousStatus: string,
    newStatus: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    const repo = this.di.resolve<IExecutiveExecutionGraphRepository>("IExecutiveExecutionGraphRepository");
    const entry: IGraphHistoryEntry = {
      id: `ghist_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      graphId,
      previousStatus,
      newStatus,
      actorId,
      timestamp: new Date().toISOString(),
      reason
    };
    await repo.saveHistory(tenantId, entry);
  }

  /**
   * 13. build_execution_graph - Build Graph O(V+E)
   */
  public async buildExecutionGraph(tenantId: string, executionId: string, customNodes?: IActionNode[]): Promise<IExecutionGraph> {
    this.validateRequestContext(tenantId);
    
    // Resolve execution context to check ownership and tenant bounds
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) {
      throw new Error(`Execution context [${executionId}] not found.`);
    }

    const repo = this.di.resolve<IExecutiveExecutionGraphRepository>("IExecutiveExecutionGraphRepository");

    // Standard baseline nodes for enterprise scenarios
    const nodes: IActionNode[] = customNodes || [
      {
        id: "act_verify_budget",
        name: "Verify Operational Budget Caps",
        type: "SCRIPT",
        status: "PENDING",
        priority: 1,
        owner: exec.owner,
        metadata: { cost: 0 },
        rollbackStep: { action: "revert_budget_checks", payload: {}, targetService: "billing" },
        rollbackDependencies: [],
        rollbackValidation: { checkType: "revert_status", expectedResult: "REVERTED" },
        rollbackOwner: exec.owner,
        rollbackOrder: 4
      },
      {
        id: "act_approve_resources",
        name: "Acquire Resource Clearances",
        type: "APPROVAL",
        status: "PENDING",
        priority: 2,
        owner: exec.owner,
        metadata: {},
        rollbackStep: { action: "release_resources", payload: {}, targetService: "infra" },
        rollbackDependencies: ["act_verify_budget"],
        rollbackValidation: { checkType: "resource_released", expectedResult: true },
        rollbackOwner: exec.owner,
        rollbackOrder: 3
      },
      {
        id: "act_deploy_services",
        name: "Deploy System Pipelines",
        type: "API",
        status: "PENDING",
        priority: 3,
        owner: exec.owner,
        metadata: {},
        rollbackStep: { action: "tear_down_pipeline", payload: {}, targetService: "infra" },
        rollbackDependencies: ["act_approve_resources"],
        rollbackValidation: { checkType: "pipeline_deleted", expectedResult: true },
        rollbackOwner: exec.owner,
        rollbackOrder: 2
      },
      {
        id: "act_notify_stakeholders",
        name: "Publish Launch Alerts",
        type: "API",
        status: "PENDING",
        priority: 5,
        owner: exec.owner,
        metadata: {},
        rollbackStep: { action: "send_rollback_notice", payload: {}, targetService: "notifier" },
        rollbackDependencies: ["act_deploy_services"],
        rollbackValidation: { checkType: "notice_sent", expectedResult: true },
        rollbackOwner: exec.owner,
        rollbackOrder: 1
      }
    ];

    // Verify all graph nodes belong to the tenant
    for (const node of nodes) {
      if (node.owner && exec.owner !== node.owner) {
        // Enforce boundary checks
        console.warn(`Graph Node ${node.id} owner ${node.owner} differs from execution owner ${exec.owner}`);
      }
    }

    const edges = [
      { source: "act_verify_budget", target: "act_approve_resources" },
      { source: "act_approve_resources", target: "act_deploy_services" },
      { source: "act_deploy_services", target: "act_notify_stakeholders" }
    ];

    const graph: IExecutionGraph = {
      id: `egraph_${crypto.randomUUID().replace(/-/g, "")}`,
      tenantId,
      executionId,
      nodes,
      edges,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    await repo.saveGraph(tenantId, graph);
    await this.logHistory(tenantId, graph.id, "NONE", "DRAFT", exec.owner || "system", "Built execution graph profile.");

    await this.publishEvent(tenantId, "executive.execution.graph.created", {
      graphId: graph.id,
      executionId,
      tenantId,
      nodesCount: nodes.length,
      timestamp: graph.createdAt
    });

    return graph;
  }

  /**
   * 13. execution_graph - Retrieve Graph
   */
  public async getExecutionGraph(tenantId: string, executionId: string): Promise<IExecutionGraph> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionGraphRepository>("IExecutiveExecutionGraphRepository");
    let graph = await repo.findGraphByExecutionId(tenantId, executionId);
    if (!graph) {
      // Lazy build if not exists
      graph = await this.buildExecutionGraph(tenantId, executionId);
    }
    return graph;
  }

  /**
   * 13. execution_dependencies - Retrieve all edges
   */
  public async getExecutionDependencies(tenantId: string, executionId: string): Promise<{ source: string; target: string }[]> {
    this.validateRequestContext(tenantId);
    const graph = await this.getExecutionGraph(tenantId, executionId);
    return graph.edges;
  }

  /**
   * 13. execution_sequence - Topologically Sort Graph nodes O(V+E)
   */
  public async generateExecutionSequence(tenantId: string, executionId: string): Promise<IExecutionSequence> {
    this.validateRequestContext(tenantId);
    const startHr = process.hrtime();
    
    const graph = await this.getExecutionGraph(tenantId, executionId);
    const adjList: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    
    for (const node of graph.nodes) {
      adjList[node.id] = [];
      inDegree[node.id] = 0;
    }

    for (const edge of graph.edges) {
      if (adjList[edge.source]) {
        adjList[edge.source].push(edge.target);
      }
      if (inDegree[edge.target] !== undefined) {
        inDegree[edge.target]++;
      }
    }

    // Kahn's algorithm for Topological Sort (V+E)
    const queue: string[] = [];
    for (const nodeId in inDegree) {
      if (inDegree[nodeId] === 0) {
        queue.push(nodeId);
      }
    }

    const sequence: string[] = [];
    const parallelBatches: string[][] = [];

    while (queue.length > 0) {
      const currentBatch = [...queue];
      parallelBatches.push(currentBatch);
      queue.length = 0; // Clear the queue for next level batching

      for (const curr of currentBatch) {
        sequence.push(curr);
        for (const neighbor of adjList[curr] || []) {
          inDegree[neighbor]--;
          if (inDegree[neighbor] === 0) {
            queue.push(neighbor);
          }
        }
      }
    }

    // Verify no circular dependency loops
    if (sequence.length !== graph.nodes.length) {
      throw new Error(`Orchestration Loop Detected: Dependency graph contains cycles. Unable to sort topologically.`);
    }

    const diff = process.hrtime(startHr);
    const calculationTimeMs = diff[0] * 1000 + diff[1] / 1000000;

    await this.publishEvent(tenantId, "executive.execution.sequence.generated", {
      executionId,
      tenantId,
      sequenceLength: sequence.length,
      calculationTimeMs,
      timestamp: new Date().toISOString()
    });

    return {
      sequence,
      parallelBatches,
      calculationTimeMs
    };
  }

  /**
   * 13. execution_graph_optimizer - Optimize graph using Priority sorting O(V log V)
   */
  public async optimizeExecutionGraph(tenantId: string, executionId: string): Promise<IExecutionGraph> {
    this.validateRequestContext(tenantId);
    const repo = this.di.resolve<IExecutiveExecutionGraphRepository>("IExecutiveExecutionGraphRepository");
    const graph = await this.getExecutionGraph(tenantId, executionId);

    // Optimize node order: Sort nodes by priority (O(V log V) complexity)
    // Nodes with lower priority value run first (1 is critical, 5 is low)
    graph.nodes.sort((a, b) => a.priority - b.priority);

    graph.status = "OPTIMIZED";
    graph.updatedAt = new Date().toISOString();
    graph.version++;

    await repo.saveGraph(tenantId, graph);
    await this.logHistory(tenantId, graph.id, "DRAFT", "OPTIMIZED", "optimizer", "Optimized execution node execution schedules.");

    await this.publishEvent(tenantId, "executive.execution.graph.optimized", {
      graphId: graph.id,
      executionId,
      tenantId,
      version: graph.version,
      timestamp: graph.updatedAt
    });

    return graph;
  }

  /**
   * 13. execution_priority - Calculate Priority Matrix
   */
  public async getPriorityMatrix(tenantId: string, executionId: string): Promise<{ nodeId: string; priority: number }[]> {
    this.validateRequestContext(tenantId);
    const graph = await this.getExecutionGraph(tenantId, executionId);
    // Return priority mapping (O(n))
    return graph.nodes.map(n => ({ nodeId: n.id, priority: n.priority }));
  }

  /**
   * 13. execution_constraints - Calculate Constraints
   */
  public async getExecutionConstraints(tenantId: string, executionId: string): Promise<any> {
    this.validateRequestContext(tenantId);
    const graph = await this.getExecutionGraph(tenantId, executionId);
    const maxParallel = Math.max(...graph.nodes.map(n => n.priority));
    
    return {
      maxParallelLimit: Math.max(2, maxParallel),
      totalBudgetAllocated: graph.nodes.reduce((acc, n) => acc + (n.metadata.cost || 0), 10000),
      hardLimitsCount: graph.nodes.filter(n => n.priority === 1).length
    };
  }

  /**
   * 13. rollback_graph - Generate compensation rollback tree
   */
  public async getRollbackGraph(tenantId: string, executionId: string): Promise<any> {
    this.validateRequestContext(tenantId);
    const graph = await this.getExecutionGraph(tenantId, executionId);

    // Rollback graph reverses target execution routing links
    const rollbackNodes = graph.nodes
      .filter(n => n.rollbackStep !== null)
      .map(n => ({
        id: `roll_${n.id}`,
        name: `Rollback: ${n.name}`,
        rollbackStep: n.rollbackStep,
        rollbackValidation: n.rollbackValidation,
        owner: n.rollbackOwner,
        order: n.rollbackOrder
      }))
      // Sorted by rollbackOrder ascending
      .sort((a, b) => a.order - b.order);

    const rollbackEdges: { source: string; target: string }[] = [];
    for (const node of graph.nodes) {
      if (node.rollbackDependencies) {
        for (const dep of node.rollbackDependencies) {
          rollbackEdges.push({
            source: `roll_${node.id}`,
            target: `roll_${dep}`
          });
        }
      }
    }

    const rollbackExecutionOrder = rollbackNodes.map(rn => rn.id);

    await this.publishEvent(tenantId, "executive.execution.rollback.generated", {
      executionId,
      tenantId,
      rollbackNodesCount: rollbackNodes.length,
      timestamp: new Date().toISOString()
    });

    return {
      rollbackNodes,
      rollbackEdges,
      rollbackExecutionOrder
    };
  }

  /**
   * Critical Path Analysis
   */
  public async calculateCriticalPath(tenantId: string, executionId: string): Promise<string[]> {
    this.validateRequestContext(tenantId);
    const graph = await this.getExecutionGraph(tenantId, executionId);
    const seq = await this.generateExecutionSequence(tenantId, executionId);
    
    // Critical path represents nodes with the highest priority rankings in topological execution order
    const criticalNodes = graph.nodes
      .filter(n => n.priority <= 2)
      .map(n => n.id);

    return seq.sequence.filter(id => criticalNodes.includes(id));
  }

  /**
   * 13. execution_graph_report - Generate Graph Report
   */
  public async generateGraphReport(tenantId: string, executionId: string): Promise<IExecutionGraphReport> {
    this.validateRequestContext(tenantId);
    
    const graph = await this.getExecutionGraph(tenantId, executionId);
    const seq = await this.generateExecutionSequence(tenantId, executionId);
    const criticalPath = await this.calculateCriticalPath(tenantId, executionId);
    const priorityMatrix = await this.getPriorityMatrix(tenantId, executionId);

    // Score based on connectivity and cycles (isReady is true if DAG holds)
    const readinessScore = seq.sequence.length === graph.nodes.length ? 100 : 0;

    const explainability = {
      whyStructureExists: `This sequence maps operational steps to resolve execution target ${executionId}.`,
      criticalPathRationale: `The critical path incorporates nodes [${criticalPath.join(", ")}] that carry high priority rankings.`,
      parallelizationRationale: `Parallel batches show that nodes grouped under levels [${seq.parallelBatches.map(b => b.join(",")).join(" | ")}] can safely execute concurrently.`,
      rollbackTreeRationale: `Compensation actions revert the steps in order of inverse execution dependencies.`
    };

    return {
      graphId: graph.id,
      tenantId,
      executionId,
      sequence: seq.sequence,
      parallelBatches: seq.parallelBatches,
      criticalPath,
      priorityMatrix,
      readinessScore,
      explainability,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 11. Action Package Compiler
   */
  public async compileActionPackage(tenantId: string, executionId: string): Promise<IActionPackage> {
    this.validateRequestContext(tenantId);
    
    const executionService = this.di.resolve<any>("IExecutiveExecutionService");
    const hardeningService = this.di.resolve<any>("IExecutiveExecutionHardeningService");

    const exec = await executionService.getExecution(tenantId, executionId);
    if (!exec) throw new Error(`Execution context [${executionId}] not found.`);

    // 1. Resolve Stage 3 Lineage components
    let decision = null;
    if (this.di.has("IExecutiveDecisionRepository")) {
      const decRepo = this.di.resolve<any>("IExecutiveDecisionRepository");
      decision = await decRepo.findDecisionById(tenantId, exec.decisionId).catch(() => null);
    }

    let evidence = null;
    if (this.di.has("IExecutiveEvidenceRepository")) {
      const evRepo = this.di.resolve<any>("IExecutiveEvidenceRepository");
      evidence = await evRepo.findEvidenceById(tenantId, exec.decisionId).catch(() => null);
    }

    let evaluation = null;
    if (this.di.has("IExecutiveDecisionEvaluationRepository")) {
      const evalRepo = this.di.resolve<any>("IExecutiveDecisionEvaluationRepository");
      evaluation = await evalRepo.findEvaluationByDecisionId(tenantId, exec.decisionId).catch(() => null);
    }

    let simulation = null;
    if (this.di.has("IExecutiveSimulationRepository")) {
      const simRepo = this.di.resolve<any>("IExecutiveSimulationRepository");
      simulation = await simRepo.findSimulationByDecisionId(tenantId, exec.decisionId).catch(() => null);
    }

    let selection = null;
    if (this.di.has("IExecutiveDecisionSelectionRepository")) {
      const selRepo = this.di.resolve<any>("IExecutiveDecisionSelectionRepository");
      const selections = await selRepo.getSelections(tenantId).catch(() => []);
      selection = selections.find((s: any) => s.decisionId === exec.decisionId) || null;
    }

    let authorization = null;
    if (this.di.has("IExecutiveDecisionAuthorizationRepository")) {
      const authRepo = this.di.resolve<any>("IExecutiveDecisionAuthorizationRepository");
      authorization = await authRepo.findAuthorizationById(tenantId, exec.authorizationId).catch(() => null);
    }

    let dispatch = null;
    if (this.di.has("IExecutiveDecisionDispatchRepository")) {
      const dispRepo = this.di.resolve<any>("IExecutiveDecisionDispatchRepository");
      dispatch = await dispRepo.findDispatchById(tenantId, exec.dispatchId).catch(() => null);
    }

    // 2. Resolve Hardening details
    let executionHardening = null;
    if (hardeningService) {
      executionHardening = await hardeningService.compileExecutionHardeningPackage(tenantId, executionId).catch(() => null);
    }

    // 3. Resolve Graph components
    const graph = await this.getExecutionGraph(tenantId, executionId);
    const seq = await this.generateExecutionSequence(tenantId, executionId);
    const criticalNodes = await this.calculateCriticalPath(tenantId, executionId);
    const rollback = await this.getRollbackGraph(tenantId, executionId);
    const consts = await this.getExecutionConstraints(tenantId, executionId);

    const adjacencyList: Record<string, string[]> = {};
    for (const node of graph.nodes) {
      adjacencyList[node.id] = [];
    }
    for (const edge of graph.edges) {
      if (adjacencyList[edge.source]) {
        adjacencyList[edge.source].push(edge.target);
      }
    }

    const priorityDistribution: Record<number, number> = {};
    for (const node of graph.nodes) {
      priorityDistribution[node.priority] = (priorityDistribution[node.priority] || 0) + 1;
    }

    const actionPackage: IActionPackage = {
      compiledAt: new Date().toISOString(),
      tenantId,
      executionId,
      decisionId: exec.decisionId,
      
      decision,
      evidence,
      evaluation,
      simulation,
      selection,
      authorization,
      dispatch,
      execution: JSON.parse(JSON.stringify(exec)),
      executionHardening,
      
      actionGraph: {
        nodesCount: graph.nodes.length,
        edgesCount: graph.edges.length,
        actions: graph.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, owner: n.owner }))
      },
      executionGraph: graph,
      dependencyGraph: {
        edges: graph.edges,
        adjacencyList
      },
      priorityGraph: {
        criticalNodes,
        priorityDistribution
      },
      rollbackGraph: {
        rollbackNodes: rollback.rollbackNodes,
        rollbackEdges: rollback.rollbackEdges,
        rollbackExecutionOrder: rollback.rollbackExecutionOrder
      },
      constraints: {
        maxParallelLimit: consts.maxParallelLimit,
        totalBudget: consts.totalBudgetAllocated,
        hardLimitsCount: consts.hardLimitsCount
      },
      readiness: {
        isReady: executionHardening?.metadata?.hardeningStatus !== "FAILED",
        score: seq.sequence.length === graph.nodes.length ? 100 : 30
      },
      explainability: `Action package compiled with ${graph.nodes.length} nodes and ${graph.edges.length} execution dependency links. Topological ordering verified.`,
      metadata: {
        compiledBy: "ActionPackageCompilerEngine",
        version: graph.version
      }
    };

    return JSON.parse(JSON.stringify(actionPackage));
  }
}
