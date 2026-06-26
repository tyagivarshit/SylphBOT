import {
  IUniversalResource,
  IUniversalEntity,
  IUniversalInteraction,
  IValueFlowEvent,
  IStateProjection,
  IStateProjectionEngine,
  IDomainPlugin,
  IPluginRegistry,
  IGraphNode,
  IGraphEdge,
  IOrganizationGraph
} from "../interfaces/universal";

export class StateProjectionEngine implements IStateProjectionEngine {
  public project(events: IValueFlowEvent[]): IStateProjection {
    if (events.length === 0) {
      throw new Error("No events provided for projection.");
    }
    
    // Sort events by timestamp
    const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const resourceId = sorted[0].resourceId;

    let currentState = "Created";
    let totalAllocated = 0;
    let totalConsumed = 0;
    let balance = 0;

    for (const event of sorted) {
      currentState = event.flowType;
      
      switch (event.flowType) {
        case "Created":
        case "Released":
        case "Adjusted":
          balance += event.amount;
          break;
        case "Reserved":
        case "Allocated":
          totalAllocated += event.amount;
          break;
        case "Consumed":
          totalConsumed += event.amount;
          balance -= event.amount;
          break;
        case "Transferred":
          balance -= event.amount;
          break;
        case "Expired":
        case "Archived":
          balance = 0;
          break;
        default:
          break;
      }
    }

    return {
      resourceId,
      currentState,
      totalAllocated,
      totalConsumed,
      balance,
      lastUpdated: sorted[sorted.length - 1].timestamp,
      history: sorted
    };
  }

  public projectIncremental(current: IStateProjection, event: IValueFlowEvent): IStateProjection {
    if (current.resourceId !== event.resourceId) {
      throw new Error(`Resource ID mismatch: current [${current.resourceId}] vs event [${event.resourceId}]`);
    }

    const updatedHistory = [...current.history, event].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    let balance = current.balance;
    let totalAllocated = current.totalAllocated;
    let totalConsumed = current.totalConsumed;

    switch (event.flowType) {
      case "Created":
      case "Released":
      case "Adjusted":
        balance += event.amount;
        break;
      case "Reserved":
      case "Allocated":
        totalAllocated += event.amount;
        break;
      case "Consumed":
        totalConsumed += event.amount;
        balance -= event.amount;
        break;
      case "Transferred":
        balance -= event.amount;
        break;
      case "Expired":
      case "Archived":
        balance = 0;
        break;
      default:
        break;
    }

    return {
      resourceId: current.resourceId,
      currentState: event.flowType,
      totalAllocated,
      totalConsumed,
      balance,
      lastUpdated: event.timestamp,
      history: updatedHistory
    };
  }
}

export class PluginRegistry implements IPluginRegistry {
  private plugins = new Map<string, IDomainPlugin>();
  private containerRef: any;

  constructor(containerRef: any) {
    this.containerRef = containerRef;
  }

  public async registerPlugin(plugin: IDomainPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin [${plugin.name}] ID [${plugin.id}] is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
    await plugin.onRegister(this.containerRef);
    console.log(`[Plugin Registry] Registered plugin [${plugin.name}] v[${plugin.version}]`);
  }

  public async unregisterPlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin with ID [${id}] is not registered.`);
    }
    await plugin.onUnregister(this.containerRef);
    this.plugins.delete(id);
    console.log(`[Plugin Registry] Unregistered plugin [${plugin.name}]`);
  }

  public getPlugin(id: string): IDomainPlugin | null {
    return this.plugins.get(id) || null;
  }

  public listPlugins(): IDomainPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export class OrganizationGraph implements IOrganizationGraph {
  private nodes = new Map<string, IGraphNode>();
  private edges: IGraphEdge[] = [];

  public addNode(node: IGraphNode): void {
    this.nodes.set(node.id, { ...node });
  }

  public getNode(id: string): IGraphNode | null {
    return this.nodes.get(id) || null;
  }

  public addEdge(edge: IGraphEdge): void {
    if (!this.nodes.has(edge.sourceId) || !this.nodes.has(edge.targetId)) {
      throw new Error(`Edge source [${edge.sourceId}] or target [${edge.targetId}] does not exist in graph.`);
    }
    this.edges.push({ ...edge });
  }

  public getNeighbors(nodeId: string): Array<{ node: IGraphNode; edge: IGraphEdge }> {
    const neighbors: Array<{ node: IGraphNode; edge: IGraphEdge }> = [];
    for (const edge of this.edges) {
      if (edge.sourceId === nodeId) {
        const target = this.nodes.get(edge.targetId);
        if (target) {
          neighbors.push({ node: target, edge });
        }
      } else if (edge.targetId === nodeId) {
        const source = this.nodes.get(edge.sourceId);
        if (source) {
          neighbors.push({ node: source, edge });
        }
      }
    }
    return neighbors;
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
          if (node.properties[key] !== val) {
            matches = false;
            break;
          }
        }
      }
      if (matches) {
        results.push({ ...node });
      }
    }
    return results;
  }
}
