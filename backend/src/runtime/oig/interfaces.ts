import { IOrganizationGraph, IGraphNode, IGraphEdge } from "../interfaces/universal";

export interface OigMetadata {
  evidenceReferences?: string[];
  sourceReferences?: string[];
  policyReferences?: string[];
  capabilityReferences?: string[];
  workflowReferences?: string[];
  confidenceScore?: number;
  executionTrace?: string[];
  validationResults?: any;
  approvalReferences?: string[];
  auditMetadata?: Record<string, any>;
}

export interface OigNode extends IGraphNode, OigMetadata {
  id: string;
  type: string;
  properties: Record<string, any>;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OigEdgeHistoryEntry {
  version: number;
  timestamp: Date;
  action: "create" | "update" | "archive" | "unarchive" | "merge";
  properties: Record<string, any>;
  reason?: string;
  metadata?: OigMetadata;
}

export interface OigEdge extends IGraphEdge, OigMetadata {
  sourceId: string;
  targetId: string;
  predicate: string;
  properties: Record<string, any>;
  tenantId: string;
  version: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  history: OigEdgeHistoryEntry[];
}

export type OigGraphEventType =
  | "NODE_CREATED"
  | "NODE_UPDATED"
  | "NODE_MERGED"
  | "NODE_DELETED"
  | "EDGE_CREATED"
  | "EDGE_UPDATED"
  | "EDGE_ARCHIVED"
  | "EDGE_MERGED"
  | "GRAPH_RESET";

export interface OigGraphEvent {
  id: string;
  timestamp: Date;
  tenantId: string;
  type: OigGraphEventType;
  payload: any;
  metadata?: Record<string, any>;
}

export interface OigGraphSnapshot {
  snapshotId: string;
  timestamp: Date;
  tenantId: string;
  nodes: OigNode[];
  edges: OigEdge[];
}

export interface OigSecurityContext {
  tenantId: string;
  actorId: string;
  roles?: string[];
  scopes?: string[];
}

export interface OigQueryOptions {
  securityContext?: OigSecurityContext; // Now optional to support automatic context propagation
  includeArchived?: boolean;
  maxDepth?: number;
}

export interface OigTraversalResult {
  nodes: OigNode[];
  edges: OigEdge[];
  paths: string[][];
}

export interface OigValidationRule {
  validateNode?: (node: OigNode) => { valid: boolean; error?: string };
  validateEdge?: (edge: OigEdge, source: OigNode, target: OigNode) => { valid: boolean; error?: string };
}

export interface OigPluginRegistration {
  pluginId: string;
  nodeTypes: string[];
  relationshipTypes: string[];
  validationRules?: OigValidationRule;
  eventHandlers?: Record<string, (event: any, graph: IOrganizationIntelligenceGraph) => Promise<void> | void>;
}

export interface OigMetrics {
  nodeCount: number;
  edgeCount: number;
  growthRate: number;
  traversalLatencyAvgMs: number;
  projectionLatencyAvgMs: number;
  relationshipUpdatesCount: number;
  synchronizationFailuresCount: number;
  graphRebuildDurationMs: number;
  
  // Phase 9 - Context & Decision Telemetry
  contextPropagationLatencyAvgMs: number;
  intentResolutionLatencyAvgMs: number;
  capabilityLookupLatencyAvgMs: number;
  pluginLifecycleTransitionsCount: number;
  semanticResolutionLatencyAvgMs: number;
  governancePolicyExecutionsCount: number;
  decisionMetadataCreationCount: number;
  runtimeGovernanceViolationsCount: number;
}

export interface IOrganizationIntelligenceGraph extends IOrganizationGraph {
  // Graph Core (Phase 1)
  getEventLog(): OigGraphEvent[];
  appendEvent(event: Omit<OigGraphEvent, "id" | "timestamp">): OigGraphEvent;
  
  // Relationship Engine (Phase 4)
  archiveEdge(sourceId: string, targetId: string, predicate: string, securityContext?: OigSecurityContext, reason?: string): void;
  updateEdgeProperties(sourceId: string, targetId: string, predicate: string, properties: Record<string, any>, securityContext?: OigSecurityContext): void;
  mergeEdges(sourceId: string, targetId: string, predicate: string, otherPredicate: string, securityContext?: OigSecurityContext): void;
  getEdgeHistory(sourceId: string, targetId: string, predicate: string, securityContext?: OigSecurityContext): OigEdgeHistoryEntry[];
  
  // Graph Projection (Phase 5)
  generateSnapshot(tenantId: string): OigGraphSnapshot;
  restoreFromSnapshot(snapshot: OigGraphSnapshot): void;
  reconstructAt(tenantId: string, timestamp: Date): { nodes: OigNode[]; edges: OigEdge[] };
  
  // Graph Query Engine (Phase 6)
  traverse(startNodeId: string, options?: OigQueryOptions): OigTraversalResult;
  findPaths(startNodeId: string, endNodeId: string, options?: OigQueryOptions): string[][];
  getDependencyTree(nodeId: string, options?: OigQueryOptions): OigTraversalResult;
  getImpactAnalysis(nodeId: string, options?: OigQueryOptions): OigTraversalResult;
  
  // Observability (Phase 8 & 9)
  getMetrics(): OigMetrics;
  recordTelemetryMetric(metricName: keyof OigMetrics, durationMsOrCount: number): void;
  
  // Plugin Registration (Phase 10)
  registerPluginConfig(config: OigPluginRegistration): void;
  unregisterPluginConfig(pluginId: string): void;
  
  // Security-aware node/edge additions
  addSecureNode(node: Omit<OigNode, "createdAt" | "updatedAt">, securityContext?: OigSecurityContext): void;
  addSecureEdge(edge: Omit<OigEdge, "createdAt" | "updatedAt" | "version" | "archived" | "history">, securityContext?: OigSecurityContext): void;
}
