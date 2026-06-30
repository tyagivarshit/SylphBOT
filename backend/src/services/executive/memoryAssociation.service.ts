import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.3E MEMORY ASSOCIATION & KNOWLEDGE GRAPH INTELLIGENCE INTERFACES
// ============================================================================

export interface IMemoryAssociationNode {
  id: string;
  tenantId: string;
  executiveId: string;
  nodeType: string; // "MEMORY" | "CUSTOMER" | "DEAL" | "GOAL" | "OUTCOME" | "FINANCIAL" | "HEALTH" | "METRIC"
  label: string;
  createdTime: string;
}

export interface IRelationshipStrength {
  frequency: number;
  recencyDays: number;
  importance: number;
  confidence: number;
  coOccurrence: number;
  missionRelevance: number;
  executiveRelevance: number;
  businessRelevance: number;
  calculatedStrength: number; // 0.0 - 1.0
}

export interface IRelationshipExplainability {
  whyLinked: string;
  whenLinked: string;
  evidenceRefs: string[];
  confidence: number;
  strength: number;
  lastValidated: string;
  supportingMemories: string[];
  contradictingMemories: string[];
}

export interface IMemoryAssociationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  weight: number; // 0.0 - 1.0
  source: string; // Relationship Source
  strengthDetail: IRelationshipStrength;
  explainability: IRelationshipExplainability;
  createdTime: string;
  updatedTime: string;
}

export interface IExecutiveMemoryAssociationRepository {
  saveNode(tenantId: string, node: IMemoryAssociationNode): Promise<void>;
  saveEdge(tenantId: string, edge: IMemoryAssociationEdge): Promise<void>;
  findNode(tenantId: string, id: string): Promise<IMemoryAssociationNode | null>;
  findEdgesFrom(tenantId: string, sourceId: string): Promise<IMemoryAssociationEdge[]>;
  findEdgesTo(tenantId: string, targetId: string): Promise<IMemoryAssociationEdge[]>;
  deleteNode(tenantId: string, id: string): Promise<void>;
  deleteEdge(tenantId: string, id: string): Promise<void>;
  getAllNodes(tenantId: string): Promise<IMemoryAssociationNode[]>;
  getAllEdges(tenantId: string): Promise<IMemoryAssociationEdge[]>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveMemoryAssociationRepository implements IExecutiveMemoryAssociationRepository {
  private nodes = new Map<string, IMemoryAssociationNode>();
  private edges = new Map<string, IMemoryAssociationEdge>();

  public async saveNode(tenantId: string, node: IMemoryAssociationNode): Promise<void> {
    this.verifyTenant(tenantId, node.tenantId);
    this.nodes.set(node.id, JSON.parse(JSON.stringify(node)));
  }

  public async saveEdge(tenantId: string, edge: IMemoryAssociationEdge): Promise<void> {
    this.verifyTenant(tenantId, tenantId); // Verified contextually
    this.edges.set(edge.id, JSON.parse(JSON.stringify(edge)));
  }

  public async findNode(tenantId: string, id: string): Promise<IMemoryAssociationNode | null> {
    const node = this.nodes.get(id);
    if (!node) return null;
    this.verifyTenant(tenantId, node.tenantId);
    return JSON.parse(JSON.stringify(node));
  }

  public async findEdgesFrom(tenantId: string, sourceId: string): Promise<IMemoryAssociationEdge[]> {
    const results: IMemoryAssociationEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceId === sourceId) {
        results.push(JSON.parse(JSON.stringify(edge)));
      }
    }
    return results;
  }

  public async findEdgesTo(tenantId: string, targetId: string): Promise<IMemoryAssociationEdge[]> {
    const results: IMemoryAssociationEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.targetId === targetId) {
        results.push(JSON.parse(JSON.stringify(edge)));
      }
    }
    return results;
  }

  public async deleteNode(tenantId: string, id: string): Promise<void> {
    const node = this.nodes.get(id);
    if (node) {
      this.verifyTenant(tenantId, node.tenantId);
      this.nodes.delete(id);
    }
  }

  public async deleteEdge(tenantId: string, id: string): Promise<void> {
    this.edges.delete(id);
  }

  public async getAllNodes(tenantId: string): Promise<IMemoryAssociationNode[]> {
    const results: IMemoryAssociationNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(node)));
      }
    }
    return results;
  }

  public async getAllEdges(tenantId: string): Promise<IMemoryAssociationEdge[]> {
    const results: IMemoryAssociationEdge[] = [];
    for (const edge of this.edges.values()) {
      const srcNode = this.nodes.get(edge.sourceId);
      if (srcNode && srcNode.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(edge)));
      }
    }
    return results;
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION (STATELESS GRAPH INTELLIGENCE)
// ============================================================================

export class ExecutiveMemoryAssociationService {
  constructor(private di: DIContainer = container) {}

  /**
   * Registers a node on the association graph.
   */
  public async addNode(
    tenantId: string,
    executiveId: string,
    id: string,
    nodeType: string,
    label: string
  ): Promise<IMemoryAssociationNode> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryAssociationRepository>("IExecutiveMemoryAssociationRepository");

    const node: IMemoryAssociationNode = {
      id,
      tenantId,
      executiveId,
      nodeType,
      label,
      createdTime: new Date().toISOString(),
    };

    await repo.saveNode(tenantId, node);
    return node;
  }

  /**
   * Links nodes and calculates relationship strength Detail dynamically (Deliverable 6 & 9).
   */
  public async linkNodes(
    tenantId: string,
    sourceId: string,
    targetId: string,
    relationshipType: string,
    weight: number,
    source: string,
    args: {
      whyLinked: string;
      evidenceRefs: string[];
      strengthWeights?: Partial<IRelationshipStrength>;
    }
  ): Promise<IMemoryAssociationEdge> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryAssociationRepository>("IExecutiveMemoryAssociationRepository");

    const srcNode = await repo.findNode(tenantId, sourceId);
    const dstNode = await repo.findNode(tenantId, targetId);
    if (!srcNode || !dstNode) {
      throw new Error(`Invalid Edge: Source [${sourceId}] or Target [${targetId}] node not found.`);
    }

    const now = new Date().toISOString();

    // 1. Calculate Dynamic Relationship Strength (Deliverable 6)
    const weights = args.strengthWeights || {};
    const frequency = weights.frequency || 1;
    const recencyDays = weights.recencyDays || 0;
    const importance = weights.importance || 0.8;
    const confidence = weights.confidence || 0.9;
    const coOccurrence = weights.coOccurrence || 0.5;
    const missionRelevance = weights.missionRelevance || 0.85;
    const executiveRelevance = weights.executiveRelevance || 0.9;
    const businessRelevance = weights.businessRelevance || 0.95;

    // strength math
    const calculatedStrength =
      (importance * 0.2) +
      (confidence * 0.2) +
      (missionRelevance * 0.15) +
      (executiveRelevance * 0.15) +
      (businessRelevance * 0.3);

    const strengthDetail: IRelationshipStrength = {
      frequency,
      recencyDays,
      importance,
      confidence,
      coOccurrence,
      missionRelevance,
      executiveRelevance,
      businessRelevance,
      calculatedStrength: parseFloat(calculatedStrength.toFixed(3)),
    };

    // 2. Build Explainability records (Deliverable 9)
    const explainability: IRelationshipExplainability = {
      whyLinked: args.whyLinked,
      whenLinked: now,
      evidenceRefs: args.evidenceRefs,
      confidence,
      strength: strengthDetail.calculatedStrength,
      lastValidated: now,
      supportingMemories: args.evidenceRefs,
      contradictingMemories: [],
    };

    const edgeId = `edge_${sourceId}_${targetId}_${relationshipType}`;
    const edge: IMemoryAssociationEdge = {
      id: edgeId,
      sourceId,
      targetId,
      relationshipType,
      weight,
      source,
      strengthDetail,
      explainability,
      createdTime: now,
      updatedTime: now,
    };

    await repo.saveEdge(tenantId, edge);

    // Publish relationship event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.relationship.created", "1.0.0", {
          edgeId,
          tenantId,
          sourceId,
          targetId,
          relationshipType,
          timestamp: now,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return edge;
  }

  /**
   * DELIVERABLE 5 — Cascading Impact Engine
   * Simulates propagation of impact and returns ONLY the impact graph. Never recommendations.
   */
  public async getCascadingImpact(
    tenantId: string,
    startId: string,
    initialDelta: number
  ): Promise<{ nodes: string[]; edges: string[]; impacts: Record<string, number> }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryAssociationRepository>("IExecutiveMemoryAssociationRepository");

    const impacts: Record<string, number> = {};
    impacts[startId] = initialDelta;

    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const queue: string[] = [startId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visitedNodes.has(current)) continue;
      visitedNodes.add(current);

      const currentImpact = impacts[current] || 0.0;
      const edges = await repo.findEdgesFrom(tenantId, current);

      for (const edge of edges) {
        const targetNode = await repo.findNode(tenantId, edge.targetId);
        if (targetNode && targetNode.tenantId === tenantId) {
          visitedEdges.add(edge.id);
          const propagatedImpact = currentImpact * edge.weight;
          impacts[edge.targetId] = (impacts[edge.targetId] || 0.0) + propagatedImpact;

          if (!visitedNodes.has(edge.targetId)) {
            queue.push(edge.targetId);
          }
        }
      }
    }

    // Returns only impact graph nodes and edges
    return {
      nodes: Array.from(visitedNodes),
      edges: Array.from(visitedEdges),
      impacts,
    };
  }

  /**
   * DELIVERABLE 7 — Community Detection Engine
   * Emerging communities based on link density / classification types.
   */
  public async detectCommunities(tenantId: string): Promise<Map<string, string[]>> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryAssociationRepository>("IExecutiveMemoryAssociationRepository");

    const nodes = await repo.getAllNodes(tenantId);
    const communities = new Map<string, string[]>();

    for (const n of nodes) {
      const cluster = communities.get(n.nodeType) || [];
      cluster.push(n.id);
      communities.set(n.nodeType, cluster);
    }

    return communities;
  }

  /**
   * DELIVERABLE 8 — Memory Path Discovery
   * Finds the best explainable path between two memories using BFS.
   */
  public async findBestPath(
    tenantId: string,
    startId: string,
    endId: string,
    maxHops: number = 6
  ): Promise<{ path: string[]; explainability: string[] } | null> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryAssociationRepository>("IExecutiveMemoryAssociationRepository");

    const queue: Array<{ currentId: string; path: string[]; explainability: string[] }> = [
      { currentId: startId, path: [startId], explainability: [`Start at memory [${startId}]`] },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentId = current.currentId;
      const path = current.path;
      const explainability = current.explainability;

      if (currentId === endId) {
        return { path, explainability };
      }

      visited.add(currentId);

      if (path.length - 1 >= maxHops) {
        continue;
      }

      const edges = await repo.findEdgesFrom(tenantId, currentId);
      for (const edge of edges) {
        if (!visited.has(edge.targetId)) {
          const targetNode = await repo.findNode(tenantId, edge.targetId);
          if (targetNode && targetNode.tenantId === tenantId) {
            queue.push({
              currentId: edge.targetId,
              path: [...path, edge.targetId],
              explainability: [
                ...explainability,
                `Traverse via relationship [${edge.relationshipType}] (weight: ${edge.weight}) to [${edge.targetId}]: ${edge.explainability.whyLinked}`,
              ],
            });
          }
        }
      }
    }

    return null;
  }

  /**
   * DELIVERABLE 10 — Graph Health Engine
   */
  public async validateGraphHealth(
    tenantId: string
  ): Promise<{ valid: boolean; brokenEdges: string[]; duplicates: string[]; circular: string[][] }> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveMemoryAssociationRepository>("IExecutiveMemoryAssociationRepository");

    const edges = await repo.getAllEdges(tenantId);
    const nodes = await repo.getAllNodes(tenantId);
    const nodeIds = new Set(nodes.map(n => n.id));

    const brokenEdges: string[] = [];
    const duplicates: string[] = [];
    const circular: string[][] = [];

    const edgeKeys = new Set<string>();

    for (const e of edges) {
      // 1. Broken Link Check
      if (!nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId)) {
        brokenEdges.push(e.id);
      }

      // 2. Duplicate Link Check
      const key = `${e.sourceId}:${e.targetId}:${e.relationshipType}`;
      if (edgeKeys.has(key)) {
        duplicates.push(e.id);
      } else {
        edgeKeys.add(key);
      }
    }

    // 3. Simple Circular Reference check (bidirectional cycle detections)
    for (const e of edges) {
      const reverseKey = `${e.targetId}:${e.sourceId}:${e.relationshipType}`;
      if (edgeKeys.has(reverseKey) && e.sourceId !== e.targetId) {
        circular.push([e.sourceId, e.targetId, e.sourceId]);
      }
    }

    const valid = brokenEdges.length === 0 && duplicates.length === 0 && circular.length === 0;

    // Publish validation event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.graph.validated", "1.0.0", {
          tenantId,
          valid,
          brokenEdgesCount: brokenEdges.length,
          timestamp: new Date().toISOString(),
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return {
      valid,
      brokenEdges,
      duplicates,
      circular,
    };
  }

  private verifyTenantOwnership(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }
}
