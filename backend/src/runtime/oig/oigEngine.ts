import {
  IOrganizationIntelligenceGraph,
  OigNode,
  OigEdge,
  OigGraphEvent,
  OigGraphSnapshot,
  OigSecurityContext,
  OigQueryOptions,
  OigTraversalResult,
  OigPluginRegistration,
  OigMetrics,
  OigEdgeHistoryEntry,
  OigValidationRule,
  OigMetadata
} from "./interfaces";
import { IGraphNode, IGraphEdge } from "../interfaces/universal";
import { getRequestContext } from "../../observability/requestContext";

function redactPII(properties: Record<string, any>): Record<string, any> {
  if (!properties) return {};
  const redacted = { ...properties };
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Basic phone regex matching standard international/local structures
  const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === "string") {
      let temp = value;
      temp = temp.replace(EMAIL_REGEX, "[REDACTED_EMAIL]");
      temp = temp.replace(PHONE_REGEX, "[REDACTED_PHONE]");
      redacted[key] = temp;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redactPII(value);
    }
  }
  return redacted;
}

export class OrganizationIntelligenceGraph implements IOrganizationIntelligenceGraph {
  private nodes = new Map<string, OigNode>();
  private edges: OigEdge[] = [];
  private eventLog: OigGraphEvent[] = [];
  private plugins = new Map<string, OigPluginRegistration>();

  // Observability metrics (Phase 8 & 9)
  private relationshipUpdatesCount = 0;
  private synchronizationFailuresCount = 0;
  private lastRebuildDurationMs = 0;
  private totalTraversalLatencyMs = 0;
  private totalTraversalCount = 0;
  private totalProjectionLatencyMs = 0;
  private totalProjectionCount = 0;

  // Context & Decision Telemetry (Phase 9)
  private totalContextPropagationLatencyMs = 0;
  private totalContextPropagationCount = 0;
  private totalIntentResolutionLatencyMs = 0;
  private totalIntentResolutionCount = 0;
  private totalCapabilityLookupLatencyMs = 0;
  private totalCapabilityLookupCount = 0;
  private pluginLifecycleTransitionsCount = 0;
  private totalSemanticResolutionLatencyMs = 0;
  private totalSemanticResolutionCount = 0;
  private governancePolicyExecutionsCount = 0;
  private decisionMetadataCreationCount = 0;
  private runtimeGovernanceViolationsCount = 0;

  constructor() {}

  // ==========================================
  // CONTEXT PROPAGATION ENGINE (Phase 8)
  // ==========================================

  private getOrPropagateContext(customContext?: OigSecurityContext): OigSecurityContext {
    const start = Date.now();
    try {
      if (customContext) {
        return customContext;
      }
      
      const reqCtx = getRequestContext();
      if (!reqCtx) {
        throw new Error("[Context Propagation Error] No active request context was found in AsyncLocalStorage context store.");
      }

      const tenantId = reqCtx.tenantId || reqCtx.businessId;
      if (!tenantId) {
        throw new Error("[Context Propagation Error] TenantId or BusinessId could not be resolved from propagated request context.");
      }

      return {
        tenantId,
        actorId: reqCtx.userId || "system_propagated",
        roles: ["SERVICE"],
        scopes: ["oig:read", "oig:write"]
      };
    } finally {
      const duration = Date.now() - start;
      this.totalContextPropagationLatencyMs += duration;
      this.totalContextPropagationCount++;
    }
  }

  // ==========================================
  // BACKWARD COMPATIBILITY APIs (IOrganizationGraph)
  // ==========================================

  public addNode(node: IGraphNode): void {
    const tenantId = node.properties?.tenantId || node.properties?.businessId || "default_tenant";
    const secureNode: Omit<OigNode, "createdAt" | "updatedAt"> = {
      id: node.id,
      type: node.type,
      properties: { ...node.properties },
      tenantId
    };
    
    // Add default privacy redaction
    secureNode.properties = redactPII(secureNode.properties);
    this.addNodeInternal(secureNode);
  }

  public getNode(id: string): IGraphNode | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    return {
      id: node.id,
      type: node.type,
      properties: { ...node.properties }
    };
  }

  public addEdge(edge: IGraphEdge): void {
    const sourceNode = this.nodes.get(edge.sourceId);
    const tenantId = sourceNode ? sourceNode.tenantId : "default_tenant";
    
    const secureEdge: Omit<OigEdge, "createdAt" | "updatedAt" | "version" | "archived" | "history"> = {
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      predicate: edge.predicate,
      properties: { ...edge.properties },
      tenantId
    };

    secureEdge.properties = redactPII(secureEdge.properties);
    this.addEdgeInternal(secureEdge);
  }

  public getNeighbors(nodeId: string): Array<{ node: IGraphNode; edge: IGraphEdge }> {
    const start = Date.now();
    try {
      const neighbors: Array<{ node: IGraphNode; edge: IGraphEdge }> = [];
      const node = this.nodes.get(nodeId);
      if (!node) return [];

      for (const edge of this.edges) {
        if (edge.archived) continue;
        if (edge.tenantId !== node.tenantId) continue;

        if (edge.sourceId === nodeId) {
          const target = this.nodes.get(edge.targetId);
          if (target && target.tenantId === node.tenantId) {
            neighbors.push({
              node: { id: target.id, type: target.type, properties: target.properties },
              edge: { sourceId: edge.sourceId, targetId: edge.targetId, predicate: edge.predicate, properties: edge.properties }
            });
          }
        } else if (edge.targetId === nodeId) {
          const source = this.nodes.get(edge.sourceId);
          if (source && source.tenantId === node.tenantId) {
            neighbors.push({
              node: { id: source.id, type: source.type, properties: source.properties },
              edge: { sourceId: edge.sourceId, targetId: edge.targetId, predicate: edge.predicate, properties: edge.properties }
            });
          }
        }
      }
      return neighbors;
    } finally {
      this.recordTraversalLatency(Date.now() - start);
    }
  }

  public query(criteria: Partial<IGraphNode>): IGraphNode[] {
    const results: IGraphNode[] = [];
    for (const node of this.nodes.values()) {
      let matches = true;
      if (criteria.type && node.type !== criteria.type) {
        matches = false;
      }
      if (criteria.properties) {
        for (const [key, val] of Object.entries(criteria.properties)) {
          const propVal = node.properties[key];
          if (Array.isArray(propVal)) {
            if (!propVal.includes(val)) {
              matches = false;
              break;
            }
          } else if (propVal !== val) {
            matches = false;
            break;
          }
        }
      }
      if (matches) {
        results.push({
          id: node.id,
          type: node.type,
          properties: { ...node.properties }
        });
      }
    }
    return results;
  }

  // ==========================================
  // GRAPH CORE & SECURITY (Phases 1, 9 & 10)
  // ==========================================

  public getEventLog(): OigGraphEvent[] {
    return [...this.eventLog];
  }

  public appendEvent(event: Omit<OigGraphEvent, "id" | "timestamp">): OigGraphEvent {
    // Redact payload to remain privacy-safe
    const sanitizedPayload = redactPII(event.payload);

    const newEvent: OigGraphEvent = {
      ...event,
      payload: sanitizedPayload,
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    this.eventLog.push(newEvent);
    return newEvent;
  }

  private verifySecurity(tenantId: string, securityContext: OigSecurityContext, action: string, requiredScope?: string): void {
    this.governancePolicyExecutionsCount++;
    
    if (!securityContext) {
      this.runtimeGovernanceViolationsCount++;
      throw new Error(`Security context is required for OIG action [${action}].`);
    }
    if (securityContext.tenantId !== tenantId) {
      this.runtimeGovernanceViolationsCount++;
      throw new Error(`Security Boundary Violation: Tenant mismatch in [${action}]. Caller tenant [${securityContext.tenantId}] does not match target tenant [${tenantId}]. Cross-tenant traversal is strictly prohibited.`);
    }
    if (!securityContext.actorId) {
      this.runtimeGovernanceViolationsCount++;
      throw new Error(`Security Validation Error: Caller identity (actorId) could not be verified.`);
    }

    // Verify scopes if specified
    if (requiredScope && securityContext.scopes) {
      if (!securityContext.scopes.includes(requiredScope) && !securityContext.scopes.includes("oig:admin")) {
        this.runtimeGovernanceViolationsCount++;
        throw new Error(`Security Scope Violation: Caller lacks required permission scope [${requiredScope}] for action [${action}].`);
      }
    }
  }

  public addSecureNode(node: Omit<OigNode, "createdAt" | "updatedAt">, securityContext?: OigSecurityContext): void {
    const ctx = this.getOrPropagateContext(securityContext);
    this.verifySecurity(node.tenantId, ctx, "addNode", "oig:write");

    const privacySafeProperties = redactPII(node.properties);

    const metadataFields: OigMetadata = {
      evidenceReferences: node.evidenceReferences,
      sourceReferences: node.sourceReferences,
      policyReferences: node.policyReferences,
      capabilityReferences: node.capabilityReferences,
      workflowReferences: node.workflowReferences,
      confidenceScore: node.confidenceScore,
      executionTrace: node.executionTrace,
      validationResults: node.validationResults,
      approvalReferences: node.approvalReferences,
      auditMetadata: node.auditMetadata
    };

    if (Object.values(metadataFields).some(v => v !== undefined)) {
      this.decisionMetadataCreationCount++;
    }

    this.addNodeInternal({
      ...node,
      properties: privacySafeProperties,
      ...metadataFields
    });
  }

  private addNodeInternal(node: Omit<OigNode, "createdAt" | "updatedAt">): void {
    const now = new Date();
    const existing = this.nodes.get(node.id);
    const isNew = !existing;

    const fullNode: OigNode = {
      ...node,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };

    this.validateNode(fullNode);
    this.nodes.set(node.id, fullNode);

    this.appendEvent({
      tenantId: node.tenantId,
      type: isNew ? "NODE_CREATED" : "NODE_UPDATED",
      payload: { id: node.id, type: node.type, properties: node.properties }
    });
  }

  public addSecureEdge(
    edge: Omit<OigEdge, "createdAt" | "updatedAt" | "version" | "archived" | "history">,
    securityContext?: OigSecurityContext
  ): void {
    const ctx = this.getOrPropagateContext(securityContext);
    this.verifySecurity(edge.tenantId, ctx, "addEdge", "oig:write");

    const privacySafeProperties = redactPII(edge.properties);

    const metadataFields: OigMetadata = {
      evidenceReferences: edge.evidenceReferences,
      sourceReferences: edge.sourceReferences,
      policyReferences: edge.policyReferences,
      capabilityReferences: edge.capabilityReferences,
      workflowReferences: edge.workflowReferences,
      confidenceScore: edge.confidenceScore,
      executionTrace: edge.executionTrace,
      validationResults: edge.validationResults,
      approvalReferences: edge.approvalReferences,
      auditMetadata: edge.auditMetadata
    };

    if (Object.values(metadataFields).some(v => v !== undefined)) {
      this.decisionMetadataCreationCount++;
    }

    this.addEdgeInternal({
      ...edge,
      properties: privacySafeProperties,
      ...metadataFields
    });
  }

  private addEdgeInternal(edge: Omit<OigEdge, "createdAt" | "updatedAt" | "version" | "archived" | "history">): void {
    const sourceNode = this.nodes.get(edge.sourceId);
    const targetNode = this.nodes.get(edge.targetId);

    if (!sourceNode) {
      throw new Error(`Orphan Relationship Constraint: Source node [${edge.sourceId}] does not exist in graph.`);
    }
    if (!targetNode) {
      throw new Error(`Orphan Relationship Constraint: Target node [${edge.targetId}] does not exist in graph.`);
    }

    if (sourceNode.tenantId !== edge.tenantId || targetNode.tenantId !== edge.tenantId) {
      throw new Error(`Security Constraint Violation: Source [${edge.sourceId}] or Target [${edge.targetId}] tenant mismatch with edge tenant [${edge.tenantId}].`);
    }

    const now = new Date();
    const existingIndex = this.edges.findIndex(
      e => e.sourceId === edge.sourceId && e.targetId === edge.targetId && e.predicate === edge.predicate
    );

    if (existingIndex >= 0) {
      const existing = this.edges[existingIndex];
      const newVersion = existing.version + 1;
      const historyEntry: OigEdgeHistoryEntry = {
        version: newVersion,
        timestamp: now,
        action: "update",
        properties: { ...edge.properties }
      };

      const updatedEdge: OigEdge = {
        ...existing,
        properties: { ...existing.properties, ...edge.properties },
        version: newVersion,
        updatedAt: now,
        history: [...existing.history, historyEntry],
        evidenceReferences: edge.evidenceReferences || existing.evidenceReferences,
        sourceReferences: edge.sourceReferences || existing.sourceReferences,
        policyReferences: edge.policyReferences || existing.policyReferences,
        capabilityReferences: edge.capabilityReferences || existing.capabilityReferences,
        workflowReferences: edge.workflowReferences || existing.workflowReferences,
        confidenceScore: edge.confidenceScore || existing.confidenceScore,
        executionTrace: edge.executionTrace || existing.executionTrace,
        validationResults: edge.validationResults || existing.validationResults,
        approvalReferences: edge.approvalReferences || existing.approvalReferences,
        auditMetadata: edge.auditMetadata || existing.auditMetadata
      };

      this.validateEdge(updatedEdge, sourceNode, targetNode);
      this.edges[existingIndex] = updatedEdge;
      this.relationshipUpdatesCount++;

      this.appendEvent({
        tenantId: edge.tenantId,
        type: "EDGE_UPDATED",
        payload: { sourceId: edge.sourceId, targetId: edge.targetId, predicate: edge.predicate, properties: edge.properties }
      });
    } else {
      const historyEntry: OigEdgeHistoryEntry = {
        version: 1,
        timestamp: now,
        action: "create",
        properties: { ...edge.properties }
      };

      const newEdge: OigEdge = {
        ...edge,
        version: 1,
        archived: false,
        createdAt: now,
        updatedAt: now,
        history: [historyEntry]
      };

      this.validateEdge(newEdge, sourceNode, targetNode);
      this.edges.push(newEdge);

      this.appendEvent({
        tenantId: edge.tenantId,
        type: "EDGE_CREATED",
        payload: { sourceId: edge.sourceId, targetId: edge.targetId, predicate: edge.predicate, properties: edge.properties }
      });
    }
  }

  // ==========================================
  // RELATIONSHIP ENGINE (Phase 4)
  // ==========================================

  public archiveEdge(
    sourceId: string,
    targetId: string,
    predicate: string,
    securityContext?: OigSecurityContext,
    reason?: string
  ): void {
    const ctx = this.getOrPropagateContext(securityContext);
    const index = this.edges.findIndex(
      e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === predicate
    );

    if (index === -1) {
      throw new Error(`Edge [${sourceId}] - [${predicate}] -> [${targetId}] not found.`);
    }

    const edge = this.edges[index];
    this.verifySecurity(edge.tenantId, ctx, "archiveEdge", "oig:write");

    const now = new Date();
    const newVersion = edge.version + 1;
    const historyEntry: OigEdgeHistoryEntry = {
      version: newVersion,
      timestamp: now,
      action: "archive",
      properties: {},
      reason
    };

    edge.archived = true;
    edge.version = newVersion;
    edge.updatedAt = now;
    edge.history.push(historyEntry);
    this.relationshipUpdatesCount++;

    this.appendEvent({
      tenantId: edge.tenantId,
      type: "EDGE_ARCHIVED",
      payload: { sourceId, targetId, predicate, reason }
    });
  }

  public updateEdgeProperties(
    sourceId: string,
    targetId: string,
    predicate: string,
    properties: Record<string, any>,
    securityContext?: OigSecurityContext
  ): void {
    const ctx = this.getOrPropagateContext(securityContext);
    const index = this.edges.findIndex(
      e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === predicate
    );

    if (index === -1) {
      throw new Error(`Edge [${sourceId}] - [${predicate}] -> [${targetId}] not found.`);
    }

    const edge = this.edges[index];
    this.verifySecurity(edge.tenantId, ctx, "updateEdgeProperties", "oig:write");

    const sourceNode = this.nodes.get(sourceId)!;
    const targetNode = this.nodes.get(targetId)!;

    const now = new Date();
    const newVersion = edge.version + 1;
    const historyEntry: OigEdgeHistoryEntry = {
      version: newVersion,
      timestamp: now,
      action: "update",
      properties: { ...properties }
    };

    const privacySafeProperties = redactPII({ ...edge.properties, ...properties });

    const updatedEdge: OigEdge = {
      ...edge,
      properties: privacySafeProperties,
      version: newVersion,
      updatedAt: now,
      history: [...edge.history, historyEntry]
    };

    this.validateEdge(updatedEdge, sourceNode, targetNode);
    this.edges[index] = updatedEdge;
    this.relationshipUpdatesCount++;

    this.appendEvent({
      tenantId: edge.tenantId,
      type: "EDGE_UPDATED",
      payload: { sourceId, targetId, predicate, properties }
    });
  }

  public mergeEdges(
    sourceId: string,
    targetId: string,
    predicate: string,
    otherPredicate: string,
    securityContext?: OigSecurityContext
  ): void {
    const ctx = this.getOrPropagateContext(securityContext);
    const index1 = this.edges.findIndex(
      e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === predicate
    );
    const index2 = this.edges.findIndex(
      e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === otherPredicate
    );

    if (index1 === -1 || index2 === -1) {
      throw new Error(`Cannot merge edges: one or both predicates do not exist.`);
    }

    const edge1 = this.edges[index1];
    const edge2 = this.edges[index2];

    this.verifySecurity(edge1.tenantId, ctx, "mergeEdges", "oig:write");
    this.verifySecurity(edge2.tenantId, ctx, "mergeEdges", "oig:write");

    const mergedProperties = redactPII({ ...edge2.properties, ...edge1.properties });
    const now = new Date();
    const newVersion = edge1.version + 1;
    
    const historyEntry: OigEdgeHistoryEntry = {
      version: newVersion,
      timestamp: now,
      action: "merge",
      properties: { ...mergedProperties },
      reason: `Merged with predicate [${otherPredicate}]`
    };

    edge1.properties = mergedProperties;
    edge1.version = newVersion;
    edge1.updatedAt = now;
    edge1.history.push(historyEntry);

    // Archive the other edge
    const newVersionOther = edge2.version + 1;
    edge2.archived = true;
    edge2.version = newVersionOther;
    edge2.updatedAt = now;
    edge2.history.push({
      version: newVersionOther,
      timestamp: now,
      action: "archive",
      properties: {},
      reason: `Merged into predicate [${predicate}]`
    });

    this.relationshipUpdatesCount += 2;

    this.appendEvent({
      tenantId: edge1.tenantId,
      type: "EDGE_MERGED",
      payload: { sourceId, targetId, keepPredicate: predicate, archivedPredicate: otherPredicate }
    });
  }

  public getEdgeHistory(
    sourceId: string,
    targetId: string,
    predicate: string,
    securityContext?: OigSecurityContext
  ): OigEdgeHistoryEntry[] {
    const ctx = this.getOrPropagateContext(securityContext);
    const edge = this.edges.find(
      e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === predicate
    );

    if (!edge) {
      throw new Error(`Edge [${sourceId}] - [${predicate}] -> [${targetId}] not found.`);
    }

    this.verifySecurity(edge.tenantId, ctx, "getEdgeHistory", "oig:read");
    return [...edge.history];
  }

  // ==========================================
  // GRAPH PROJECTION (Phase 5)
  // ==========================================

  public generateSnapshot(tenantId: string): OigGraphSnapshot {
    const start = Date.now();
    try {
      const nodesCopy = Array.from(this.nodes.values())
        .filter(n => n.tenantId === tenantId)
        .map(n => ({ ...n, properties: { ...n.properties } }));

      const edgesCopy = this.edges
        .filter(e => e.tenantId === tenantId)
        .map(e => ({ ...e, properties: { ...e.properties }, history: [...e.history] }));

      return {
        snapshotId: `snap_${Date.now()}`,
        timestamp: new Date(),
        tenantId,
        nodes: nodesCopy,
        edges: edgesCopy
      };
    } finally {
      this.recordProjectionLatency(Date.now() - start);
    }
  }

  public restoreFromSnapshot(snapshot: OigGraphSnapshot): void {
    const start = Date.now();
    try {
      const tenantId = snapshot.tenantId;

      for (const [id, node] of this.nodes.entries()) {
        if (node.tenantId === tenantId) {
          this.nodes.delete(id);
        }
      }

      this.edges = this.edges.filter(e => e.tenantId !== tenantId);

      for (const node of snapshot.nodes) {
        this.nodes.set(node.id, { ...node });
      }

      for (const edge of snapshot.edges) {
        this.edges.push({ ...edge });
      }

      this.appendEvent({
        tenantId,
        type: "GRAPH_RESET",
        payload: { snapshotId: snapshot.snapshotId, timestamp: snapshot.timestamp }
      });
    } finally {
      this.lastRebuildDurationMs = Date.now() - start;
    }
  }

  public reconstructAt(tenantId: string, timestamp: Date): { nodes: OigNode[]; edges: OigEdge[] } {
    const start = Date.now();
    try {
      const tempNodes = new Map<string, OigNode>();
      const tempEdges: OigEdge[] = [];

      const relevantEvents = this.eventLog.filter(
        evt => evt.tenantId === tenantId && evt.timestamp.getTime() <= timestamp.getTime()
      );

      for (const event of relevantEvents) {
        switch (event.type) {
          case "NODE_CREATED":
          case "NODE_UPDATED": {
            const { id, type, properties } = event.payload;
            const existing = tempNodes.get(id);
            tempNodes.set(id, {
              id,
              type,
              properties: { ...properties },
              tenantId,
              createdAt: existing ? existing.createdAt : event.timestamp,
              updatedAt: event.timestamp
            });
            break;
          }
          case "NODE_DELETED": {
            const { id } = event.payload;
            tempNodes.delete(id);
            break;
          }
          case "EDGE_CREATED": {
            const { sourceId, targetId, predicate, properties } = event.payload;
            const historyEntry: OigEdgeHistoryEntry = {
              version: 1,
              timestamp: event.timestamp,
              action: "create",
              properties: { ...properties }
            };
            tempEdges.push({
              sourceId,
              targetId,
              predicate,
              properties: { ...properties },
              tenantId,
              version: 1,
              archived: false,
              createdAt: event.timestamp,
              updatedAt: event.timestamp,
              history: [historyEntry]
            });
            break;
          }
          case "EDGE_UPDATED": {
            const { sourceId, targetId, predicate, properties } = event.payload;
            const idx = tempEdges.findIndex(
              e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === predicate
            );
            if (idx >= 0) {
              const existing = tempEdges[idx];
              const newVer = existing.version + 1;
              existing.properties = { ...existing.properties, ...properties };
              existing.version = newVer;
              existing.updatedAt = event.timestamp;
              existing.history.push({
                version: newVer,
                timestamp: event.timestamp,
                action: "update",
                properties: { ...properties }
              });
            }
            break;
          }
          case "EDGE_ARCHIVED": {
            const { sourceId, targetId, predicate, reason } = event.payload;
            const idx = tempEdges.findIndex(
              e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === predicate
            );
            if (idx >= 0) {
              const existing = tempEdges[idx];
              const newVer = existing.version + 1;
              existing.archived = true;
              existing.version = newVer;
              existing.updatedAt = event.timestamp;
              existing.history.push({
                version: newVer,
                timestamp: event.timestamp,
                action: "archive",
                properties: {},
                reason
              });
            }
            break;
          }
          case "EDGE_MERGED": {
            const { sourceId, targetId, keepPredicate, archivedPredicate } = event.payload;
            const idx1 = tempEdges.findIndex(
              e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === keepPredicate
            );
            const idx2 = tempEdges.findIndex(
              e => e.sourceId === sourceId && e.targetId === targetId && e.predicate === archivedPredicate
            );

            if (idx1 >= 0 && idx2 >= 0) {
              const edge1 = tempEdges[idx1];
              const edge2 = tempEdges[idx2];
              
              const mergedProps = { ...edge2.properties, ...edge1.properties };
              
              edge1.properties = mergedProps;
              edge1.version++;
              edge1.updatedAt = event.timestamp;
              edge1.history.push({
                version: edge1.version,
                timestamp: event.timestamp,
                action: "merge",
                properties: mergedProps,
                reason: `Merged with predicate [${archivedPredicate}]`
              });

              edge2.archived = true;
              edge2.version++;
              edge2.updatedAt = event.timestamp;
              edge2.history.push({
                version: edge2.version,
                timestamp: event.timestamp,
                action: "archive",
                properties: {},
                reason: `Merged into predicate [${keepPredicate}]`
              });
            }
            break;
          }
          case "GRAPH_RESET": {
            tempNodes.clear();
            tempEdges.length = 0;
            break;
          }
        }
      }

      return {
        nodes: Array.from(tempNodes.values()),
        edges: tempEdges
      };
    } finally {
      this.lastRebuildDurationMs = Date.now() - start;
    }
  }

  // ==========================================
  // GRAPH QUERY ENGINE (Phase 6)
  // ==========================================

  public traverse(startNodeId: string, options?: OigQueryOptions): OigTraversalResult {
    const start = Date.now();
    try {
      const startNode = this.nodes.get(startNodeId);
      if (!startNode) {
        throw new Error(`Start node [${startNodeId}] does not exist.`);
      }

      const opts = options || {};
      const ctx = this.getOrPropagateContext(opts.securityContext);
      this.verifySecurity(startNode.tenantId, ctx, "traverse", "oig:read");

      const visitedNodes = new Set<string>();
      const visitedEdges = new Set<string>();
      const resultNodes: OigNode[] = [];
      const resultEdges: OigEdge[] = [];
      const paths: string[][] = [];

      const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: startNodeId, path: [startNodeId] }];
      visitedNodes.add(startNodeId);
      resultNodes.push(startNode);

      const maxDepth = opts.maxDepth ?? 5;

      while (queue.length > 0) {
        const { nodeId, path } = queue.shift()!;
        if (path.length - 1 >= maxDepth) continue;

        for (const edge of this.edges) {
          if (!opts.includeArchived && edge.archived) continue;
          if (edge.tenantId !== startNode.tenantId) continue;

          let neighborId: string | null = null;
          let edgeKey = `${edge.sourceId}-${edge.predicate}-${edge.targetId}`;

          if (edge.sourceId === nodeId) {
            neighborId = edge.targetId;
          } else if (edge.targetId === nodeId) {
            neighborId = edge.sourceId;
          }

          if (neighborId) {
            if (!visitedEdges.has(edgeKey)) {
              visitedEdges.add(edgeKey);
              resultEdges.push(edge);
            }

            if (!visitedNodes.has(neighborId)) {
              visitedNodes.add(neighborId);
              const neighborNode = this.nodes.get(neighborId);
              if (neighborNode && neighborNode.tenantId === startNode.tenantId) {
                resultNodes.push(neighborNode);
                const newPath = [...path, neighborId];
                paths.push(newPath);
                queue.push({ nodeId: neighborId, path: newPath });
              }
            }
          }
        }
      }

      return { nodes: resultNodes, edges: resultEdges, paths };
    } finally {
      this.recordTraversalLatency(Date.now() - start);
    }
  }

  public findPaths(startNodeId: string, endNodeId: string, options?: OigQueryOptions): string[][] {
    const start = Date.now();
    try {
      const startNode = this.nodes.get(startNodeId);
      const endNode = this.nodes.get(endNodeId);
      if (!startNode || !endNode) return [];

      const opts = options || {};
      const ctx = this.getOrPropagateContext(opts.securityContext);
      this.verifySecurity(startNode.tenantId, ctx, "findPaths", "oig:read");
      this.verifySecurity(endNode.tenantId, ctx, "findPaths", "oig:read");

      const paths: string[][] = [];
      const maxDepth = opts.maxDepth ?? 5;

      const dfs = (currentNodeId: string, visited: Set<string>, currentPath: string[]) => {
        if (currentNodeId === endNodeId) {
          paths.push([...currentPath]);
          return;
        }
        if (currentPath.length - 1 >= maxDepth) return;

        for (const edge of this.edges) {
          if (!opts.includeArchived && edge.archived) continue;
          if (edge.tenantId !== startNode.tenantId) continue;

          let neighborId: string | null = null;
          if (edge.sourceId === currentNodeId) {
            neighborId = edge.targetId;
          }

          if (neighborId && !visited.has(neighborId)) {
            const neighborNode = this.nodes.get(neighborId);
            if (neighborNode && neighborNode.tenantId === startNode.tenantId) {
              visited.add(neighborId);
              currentPath.push(neighborId);
              dfs(neighborId, visited, currentPath);
              currentPath.pop();
              visited.delete(neighborId);
            }
          }
        }
      };

      const visitedSet = new Set<string>([startNodeId]);
      dfs(startNodeId, visitedSet, [startNodeId]);
      return paths;
    } finally {
      this.recordTraversalLatency(Date.now() - start);
    }
  }

  public getDependencyTree(nodeId: string, options?: OigQueryOptions): OigTraversalResult {
    const start = Date.now();
    try {
      const startNode = this.nodes.get(nodeId);
      if (!startNode) return { nodes: [], edges: [], paths: [] };

      const opts = options || {};
      const ctx = this.getOrPropagateContext(opts.securityContext);
      this.verifySecurity(startNode.tenantId, ctx, "getDependencyTree", "oig:read");

      const visitedNodes = new Set<string>();
      const visitedEdges = new Set<string>();
      const resultNodes: OigNode[] = [startNode];
      const resultEdges: OigEdge[] = [];
      const paths: string[][] = [];

      const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId, path: [nodeId] }];
      visitedNodes.add(nodeId);

      const maxDepth = opts.maxDepth ?? 10;

      while (queue.length > 0) {
        const { nodeId: currId, path } = queue.shift()!;
        if (path.length - 1 >= maxDepth) continue;

        for (const edge of this.edges) {
          if (!opts.includeArchived && edge.archived) continue;
          if (edge.tenantId !== startNode.tenantId) continue;

          if (edge.sourceId === currId && (edge.predicate === "DEPENDS_ON" || edge.predicate === "USES" || edge.predicate === "BELONGS_TO")) {
            const targetId = edge.targetId;
            let edgeKey = `${edge.sourceId}-${edge.predicate}-${edge.targetId}`;

            if (!visitedEdges.has(edgeKey)) {
              visitedEdges.add(edgeKey);
              resultEdges.push(edge);
            }

            if (!visitedNodes.has(targetId)) {
              visitedNodes.add(targetId);
              const targetNode = this.nodes.get(targetId);
              if (targetNode && targetNode.tenantId === startNode.tenantId) {
                resultNodes.push(targetNode);
                const newPath = [...path, targetId];
                paths.push(newPath);
                queue.push({ nodeId: targetId, path: newPath });
              }
            }
          }
        }
      }

      return { nodes: resultNodes, edges: resultEdges, paths };
    } finally {
      this.recordTraversalLatency(Date.now() - start);
    }
  }

  public getImpactAnalysis(nodeId: string, options?: OigQueryOptions): OigTraversalResult {
    const start = Date.now();
    try {
      const startNode = this.nodes.get(nodeId);
      if (!startNode) return { nodes: [], edges: [], paths: [] };

      const opts = options || {};
      const ctx = this.getOrPropagateContext(opts.securityContext);
      this.verifySecurity(startNode.tenantId, ctx, "getImpactAnalysis", "oig:read");

      const visitedNodes = new Set<string>();
      const visitedEdges = new Set<string>();
      const resultNodes: OigNode[] = [startNode];
      const resultEdges: OigEdge[] = [];
      const paths: string[][] = [];

      const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId, path: [nodeId] }];
      visitedNodes.add(nodeId);

      const maxDepth = opts.maxDepth ?? 10;

      while (queue.length > 0) {
        const { nodeId: currId, path } = queue.shift()!;
        if (path.length - 1 >= maxDepth) continue;

        for (const edge of this.edges) {
          if (!opts.includeArchived && edge.archived) continue;
          if (edge.tenantId !== startNode.tenantId) continue;

          if (edge.targetId === currId && (edge.predicate === "DEPENDS_ON" || edge.predicate === "USES" || edge.predicate === "BELONGS_TO")) {
            const sourceId = edge.sourceId;
            let edgeKey = `${edge.sourceId}-${edge.predicate}-${edge.targetId}`;

            if (!visitedEdges.has(edgeKey)) {
              visitedEdges.add(edgeKey);
              resultEdges.push(edge);
            }

            if (!visitedNodes.has(sourceId)) {
              visitedNodes.add(sourceId);
              const sourceNode = this.nodes.get(sourceId);
              if (sourceNode && sourceNode.tenantId === startNode.tenantId) {
                resultNodes.push(sourceNode);
                const newPath = [...path, sourceId];
                paths.push(newPath);
                queue.push({ nodeId: sourceId, path: newPath });
              }
            }
          }
        }
      }

      return { nodes: resultNodes, edges: resultEdges, paths };
    } finally {
      this.recordTraversalLatency(Date.now() - start);
    }
  }

  // ==========================================
  // METRICS & OBSERVABILITY (Phases 8 & 9)
  // ==========================================

  public getMetrics(): OigMetrics {
    const totalNodes = this.nodes.size;
    const activeEdges = this.edges.filter(e => !e.archived).length;
    
    return {
      nodeCount: totalNodes,
      edgeCount: activeEdges,
      growthRate: this.eventLog.length,
      traversalLatencyAvgMs: this.totalTraversalCount > 0 ? this.totalTraversalLatencyMs / this.totalTraversalCount : 0,
      projectionLatencyAvgMs: this.totalProjectionCount > 0 ? this.totalProjectionLatencyMs / this.totalProjectionCount : 0,
      relationshipUpdatesCount: this.relationshipUpdatesCount,
      synchronizationFailuresCount: this.synchronizationFailuresCount,
      graphRebuildDurationMs: this.lastRebuildDurationMs,
      
      // Phase 9 context metrics
      contextPropagationLatencyAvgMs: this.totalContextPropagationCount > 0 ? this.totalContextPropagationLatencyMs / this.totalContextPropagationCount : 0,
      intentResolutionLatencyAvgMs: this.totalIntentResolutionCount > 0 ? this.totalIntentResolutionLatencyMs / this.totalIntentResolutionCount : 0,
      capabilityLookupLatencyAvgMs: this.totalCapabilityLookupCount > 0 ? this.totalCapabilityLookupLatencyMs / this.totalCapabilityLookupCount : 0,
      pluginLifecycleTransitionsCount: this.pluginLifecycleTransitionsCount,
      semanticResolutionLatencyAvgMs: this.totalSemanticResolutionCount > 0 ? this.totalSemanticResolutionLatencyMs / this.totalSemanticResolutionCount : 0,
      governancePolicyExecutionsCount: this.governancePolicyExecutionsCount,
      decisionMetadataCreationCount: this.decisionMetadataCreationCount,
      runtimeGovernanceViolationsCount: this.runtimeGovernanceViolationsCount
    };
  }

  public recordTelemetryMetric(metricName: keyof OigMetrics, durationMsOrCount: number): void {
    switch (metricName) {
      case "intentResolutionLatencyAvgMs":
        this.totalIntentResolutionLatencyMs += durationMsOrCount;
        this.totalIntentResolutionCount++;
        break;
      case "capabilityLookupLatencyAvgMs":
        this.totalCapabilityLookupLatencyMs += durationMsOrCount;
        this.totalCapabilityLookupCount++;
        break;
      case "semanticResolutionLatencyAvgMs":
        this.totalSemanticResolutionLatencyMs += durationMsOrCount;
        this.totalSemanticResolutionCount++;
        break;
      case "governancePolicyExecutionsCount":
        this.governancePolicyExecutionsCount += durationMsOrCount;
        break;
      case "decisionMetadataCreationCount":
        this.decisionMetadataCreationCount += durationMsOrCount;
        break;
      case "runtimeGovernanceViolationsCount":
        this.runtimeGovernanceViolationsCount += durationMsOrCount;
        break;
      case "pluginLifecycleTransitionsCount":
        this.pluginLifecycleTransitionsCount += durationMsOrCount;
        break;
      default:
        break;
    }
  }

  private recordTraversalLatency(durationMs: number): void {
    this.totalTraversalLatencyMs += durationMs;
    this.totalTraversalCount++;
  }

  private recordProjectionLatency(durationMs: number): void {
    this.totalProjectionLatencyMs += durationMs;
    this.totalProjectionCount++;
  }

  public incrementSyncFailure(): void {
    this.synchronizationFailuresCount++;
  }

  // ==========================================
  // PLUGIN REGISTRATION & VALIDATION (Phase 10)
  // ==========================================

  public registerPluginConfig(config: OigPluginRegistration): void {
    if (this.plugins.has(config.pluginId)) {
      throw new Error(`Plugin configuration with ID [${config.pluginId}] already registered.`);
    }
    this.plugins.set(config.pluginId, config);
    this.pluginLifecycleTransitionsCount++;
  }

  public unregisterPluginConfig(pluginId: string): void {
    if (this.plugins.has(pluginId)) {
      this.plugins.delete(pluginId);
      this.pluginLifecycleTransitionsCount++;
    }
  }

  private validateNode(node: OigNode): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.validationRules?.validateNode) {
        const result = plugin.validationRules.validateNode(node);
        if (!result.valid) {
          this.runtimeGovernanceViolationsCount++;
          throw new Error(`Node Validation Error (Plugin: ${plugin.pluginId}): ${result.error}`);
        }
      }
    }
  }

  private validateEdge(edge: OigEdge, source: OigNode, target: OigNode): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.validationRules?.validateEdge) {
        const result = plugin.validationRules.validateEdge(edge, source, target);
        if (!result.valid) {
          this.runtimeGovernanceViolationsCount++;
          throw new Error(`Edge Validation Error (Plugin: ${plugin.pluginId}): ${result.error}`);
        }
      }
    }
  }
}
