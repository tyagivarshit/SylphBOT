export interface IUniversalResource {
  id: string;
  type: string; // e.g. "money", "inventory", "gpu_time", "energy"
  ownerId: string;
  quantity: number;
  unit: string; // e.g. "USD", "units", "hours", "kWh"
  state: string; // e.g. "available", "reserved", "consumed", "expired"
  metadata: Record<string, any>;
  version: number;
  updatedAt: Date;
}

export interface IUniversalEntity {
  id: string;
  type: string; // e.g. "customer", "lead", "patient", "citizen", "drone"
  name: string;
  tenantId: string;
  relationships: Array<{ targetId: string; predicate: string }>;
  metadata: Record<string, any>;
  status: string;
}

export interface IUniversalInteraction {
  id: string;
  type: string; // e.g. "conversation", "meeting", "call", "broadcast"
  participants: string[]; // entity IDs
  channel: string;
  state: string; // e.g. "active", "paused", "completed"
  metadata: Record<string, any>;
  startedAt: Date;
}

export interface IValueFlowEvent {
  id: string;
  tenantId: string;
  resourceId: string;
  flowType:
    | "Created"
    | "Reserved"
    | "Allocated"
    | "Transferred"
    | "Consumed"
    | "Released"
    | "Adjusted"
    | "Merged"
    | "Split"
    | "Expired"
    | "Archived";
  amount: number;
  sourceOwnerId?: string;
  targetOwnerId?: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface IStateProjection {
  resourceId: string;
  currentState: string;
  totalAllocated: number;
  totalConsumed: number;
  balance: number;
  lastUpdated: Date;
  history: IValueFlowEvent[];
}

export interface IStateProjectionEngine {
  project(events: IValueFlowEvent[]): IStateProjection;
  projectIncremental(current: IStateProjection, event: IValueFlowEvent): IStateProjection;
}

export interface IDomainPlugin {
  id: string;
  name: string;
  version: string;
  supportedDomains: string[];
  capabilities: string[];
  onRegister(container: any): Promise<void>;
  onUnregister(container: any): Promise<void>;
}

export interface IPluginRegistry {
  registerPlugin(plugin: IDomainPlugin): Promise<void>;
  unregisterPlugin(id: string): Promise<void>;
  getPlugin(id: string): IDomainPlugin | null;
  listPlugins(): IDomainPlugin[];
}

export interface IGraphNode {
  id: string;
  type: "Entity" | "Resource" | "Interaction" | "Knowledge" | "Workflow" | "Tool" | "Policy" | "Event" | "Capability" | "Organization";
  properties: Record<string, any>;
}

export interface IGraphEdge {
  sourceId: string;
  targetId: string;
  predicate: string;
  properties: Record<string, any>;
}

export interface IOrganizationGraph {
  addNode(node: IGraphNode): void;
  getNode(id: string): IGraphNode | null;
  addEdge(edge: IGraphEdge): void;
  getNeighbors(nodeId: string): Array<{ node: IGraphNode; edge: IGraphEdge }>;
  query(criteria: Partial<IGraphNode>): IGraphNode[];
}
