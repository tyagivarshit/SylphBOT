import { ISemanticResolutionLayer } from "./interfaces";
import { IOrganizationIntelligenceGraph, OigSecurityContext } from "../oig/interfaces";

export class SemanticResolutionLayer implements ISemanticResolutionLayer {
  private graph: IOrganizationIntelligenceGraph;

  constructor(graph: IOrganizationIntelligenceGraph) {
    this.graph = graph;
  }

  // ==========================================
  // SEMANTIC RESOLUTION LAYER (Phase 6)
  // ==========================================

  public resolveAlias(tenantId: string, aliasId: string): string {
    const start = Date.now();
    try {
      const securityContext: OigSecurityContext = { tenantId, actorId: "semantic_resolver" };
      const aliasNode = this.graph.getNode(aliasId);
      
      if (aliasNode) {
        // If the node type is Alias, find where it points to via RESOLVES_TO or ALIASED_TO
        if (aliasNode.type === "Alias" || aliasNode.type === "alias") {
          const neighbors = this.graph.getNeighbors(aliasId);
          const resolvesTo = neighbors.find(
            n => n.edge.predicate === "RESOLVES_TO" || n.edge.predicate === "ALIASED_TO"
          );
          if (resolvesTo) {
            return resolvesTo.node.id;
          }
        }
      }

      // Check if any other node has this aliasId in its properties
      const match = this.graph.query({
        properties: { aliases: aliasId }
      });
      if (match.length > 0) {
        return match[0].id;
      }

      return aliasId;
    } finally {
      this.recordSemanticResolution(Date.now() - start);
    }
  }

  public resolveEquivalentEntities(tenantId: string, entityId: string): string[] {
    const start = Date.now();
    try {
      const securityContext: OigSecurityContext = { tenantId, actorId: "semantic_resolver" };
      const equivalentIds = new Set<string>([entityId]);
      
      // BFS to find all connected nodes via EQUIVALENT_TO or SAME_AS predicate
      const queue: string[] = [entityId];
      
      while (queue.length > 0) {
        const currId = queue.shift()!;
        const neighbors = this.graph.getNeighbors(currId);
        
        for (const n of neighbors) {
          if (n.edge.predicate === "EQUIVALENT_TO" || n.edge.predicate === "SAME_AS") {
            if (!equivalentIds.has(n.node.id)) {
              equivalentIds.add(n.node.id);
              queue.push(n.node.id);
            }
          }
        }
      }

      return Array.from(equivalentIds);
    } finally {
      this.recordSemanticResolution(Date.now() - start);
    }
  }

  public resolveRelationshipExpansion(tenantId: string, nodeId: string, predicate: string): string[] {
    const start = Date.now();
    try {
      const expandedIds = new Set<string>();
      const queue: string[] = [nodeId];
      
      // Recursively traverse relationships of type "predicate" or inheritance links (INHERITS_FROM, SUBCLASS_OF)
      while (queue.length > 0) {
        const currId = queue.shift()!;
        const neighbors = this.graph.getNeighbors(currId);
        
        for (const n of neighbors) {
          // Direct match
          if (n.edge.predicate === predicate && n.edge.sourceId === currId) {
            if (!expandedIds.has(n.node.id)) {
              expandedIds.add(n.node.id);
              queue.push(n.node.id);
            }
          }
          // Transitive subclass inheritance match
          if ((n.edge.predicate === "INHERITS_FROM" || n.edge.predicate === "SUBCLASS_OF") && n.edge.sourceId === currId) {
            if (!expandedIds.has(n.node.id)) {
              expandedIds.add(n.node.id);
              queue.push(n.node.id);
            }
          }
        }
      }

      return Array.from(expandedIds);
    } finally {
      this.recordSemanticResolution(Date.now() - start);
    }
  }

  public resolveTypeResolution(tenantId: string, nodeId: string): string {
    const start = Date.now();
    try {
      const node = this.graph.getNode(nodeId);
      if (!node) return "Unknown";
      
      // If node is instance of a class, trace subclasses
      const neighbors = this.graph.getNeighbors(nodeId);
      const instanceOf = neighbors.find(n => n.edge.predicate === "INSTANCE_OF" && n.edge.sourceId === nodeId);
      
      if (instanceOf) {
        return instanceOf.node.id; // Returns class name/id
      }
      
      return node.type;
    } finally {
      this.recordSemanticResolution(Date.now() - start);
    }
  }

  public resolveOntologyRelation(tenantId: string, sourceId: string, targetId: string, predicate: string): boolean {
    const start = Date.now();
    try {
      // Direct edge check
      const neighbors = this.graph.getNeighbors(sourceId);
      const direct = neighbors.some(
        n => n.edge.predicate === predicate && n.edge.sourceId === sourceId && n.node.id === targetId
      );
      if (direct) return true;

      // Expanded transitive path check
      const expansion = this.resolveRelationshipExpansion(tenantId, sourceId, predicate);
      return expansion.includes(targetId);
    } finally {
      this.recordSemanticResolution(Date.now() - start);
    }
  }

  public enrichMetadata(tenantId: string, nodeId: string, metadata: Record<string, any>): void {
    const ctx: OigSecurityContext = { tenantId, actorId: "semantic_resolver", scopes: ["oig:write"] };
    const node = this.graph.getNode(nodeId);
    if (node) {
      const enrichedProperties = { ...node.properties, ...metadata, enrichedAt: new Date() };
      this.graph.addSecureNode({
        id: nodeId,
        type: node.type,
        properties: enrichedProperties,
        tenantId
      }, ctx);
    }
  }

  private recordSemanticResolution(durationMs: number): void {
    if (typeof (this.graph as any).recordTelemetryMetric === "function") {
      (this.graph as any).recordTelemetryMetric("semanticResolutionLatencyAvgMs", durationMs);
    }
  }
}
