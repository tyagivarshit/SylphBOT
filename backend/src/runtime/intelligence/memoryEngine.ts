import { IMemoryEngine, MemoryFact, TimelineMessage, IGraphMemory, MemoryRelation } from "../interfaces/memory";
import { MemoryType, MemoryRecord, GraphNode, GraphEdge } from "./types";
import { RetirementEnforcer } from "../kernel/retirementEnforcer";
import prisma from "../../config/prisma";


export class MemoryEngine implements IMemoryEngine, IGraphMemory {
  // Key format for versioned records: `${tenantId}:${type}:${key}`
  private records = new Map<string, MemoryRecord[]>();
  
  // Timeline memory storage: key is leadId
  private timelines = new Map<string, TimelineMessage[]>();

  // Graph nodes: key is `nodeId`
  private graphNodes = new Map<string, GraphNode[]>();

  // Graph edges: key is `${sourceId}:${targetId}:${predicate}`
  private graphEdges = new Map<string, GraphEdge>();

  constructor() {}

  // ==========================================
  // Core Memory Infrastructure Operations
  // ==========================================

  /**
   * Writes a new version of a memory record.
   * If a previous record exists, its version is incremented.
   */
  public async writeMemory(
    tenantId: string,
    type: MemoryType,
    key: string,
    value: string,
    confidence = 0.5,
    accessRules?: string[],
    metadata?: Record<string, any>
  ): Promise<MemoryRecord> {
    RetirementEnforcer.enforce("Direct memory access");
    const storeKey = `${tenantId}:${type}:${key}`;
    const history = this.records.get(storeKey) || [];
    const currentVersion = history.length > 0 ? history[history.length - 1].version : 0;
    
    const record: MemoryRecord = {
      id: `${storeKey}:v${currentVersion + 1}`,
      tenantId,
      type,
      key,
      value,
      confidence,
      version: currentVersion + 1,
      createdAt: new Date(),
      lastObservedAt: new Date(),
      metadata,
      accessRules
    };

    history.push(record);
    this.records.set(storeKey, history);
    return record;
  }

  /**
   * Reads the latest version of a memory record.
   * Supports Access Control validation via userRoles.
   */
  public async readMemory(
    tenantId: string,
    type: MemoryType,
    key: string,
    userRoles: string[] = []
  ): Promise<MemoryRecord | null> {
    const storeKey = `${tenantId}:${type}:${key}`;
    const history = this.records.get(storeKey);
    if (!history || history.length === 0) return null;

    const latest = history[history.length - 1];

    // Access Rule Check: Allow reading if no rules exist, or if user roles overlap
    if (latest.accessRules && latest.accessRules.length > 0) {
      const hasAccess = latest.accessRules.some(rule => userRoles.includes(rule));
      if (!hasAccess) {
        throw new Error(`Access denied to memory record [${key}]. Required permissions not met.`);
      }
    }

    return latest;
  }

  /**
   * Returns all historical versions of a specific memory key.
   */
  public async getMemoryHistory(
    tenantId: string,
    type: MemoryType,
    key: string
  ): Promise<MemoryRecord[]> {
    const storeKey = `${tenantId}:${type}:${key}`;
    return this.records.get(storeKey) || [];
  }

  /**
   * Search for records based on matching key or value text
   */
  public async searchMemory(
    tenantId: string,
    type: MemoryType,
    query: string,
    userRoles: string[] = []
  ): Promise<MemoryRecord[]> {
    const results: MemoryRecord[] = [];
    const cleanQuery = query.toLowerCase();

    for (const [storeKey, history] of this.records.entries()) {
      if (history.length === 0) continue;
      const latest = history[history.length - 1];

      if (latest.tenantId !== tenantId || latest.type !== type) continue;

      // Access rules check
      if (latest.accessRules && latest.accessRules.length > 0) {
        const hasAccess = latest.accessRules.some(rule => userRoles.includes(rule));
        if (!hasAccess) continue;
      }

      if (
        latest.key.toLowerCase().includes(cleanQuery) ||
        latest.value.toLowerCase().includes(cleanQuery)
      ) {
        results.push(latest);
      }
    }

    return results;
  }

  /**
   * Cleans up memories below the confidence threshold or older than the specified retention date.
   */
  public async applyRetentionPolicy(
    tenantId: string,
    olderThan: Date,
    minConfidence: number
  ): Promise<number> {
    let deletedCount = 0;

    for (const [storeKey, history] of this.records.entries()) {
      if (history.length === 0) continue;
      
      const filteredHistory = history.filter(record => {
        if (record.tenantId !== tenantId) return true; // keep other tenants

        const isTooOld = record.lastObservedAt.getTime() < olderThan.getTime();
        const isLowConfidence = record.confidence < minConfidence;

        if (isTooOld || isLowConfidence) {
          deletedCount++;
          return false; // remove
        }
        return true;
      });

      if (filteredHistory.length === 0) {
        this.records.delete(storeKey);
      } else {
        this.records.set(storeKey, filteredHistory);
      }
    }

    return deletedCount;
  }

  // ==========================================
  // Timeline Memory Implementation
  // ==========================================

  public async appendMessage(
    leadId: string,
    message: Omit<TimelineMessage, "id" | "timestamp">
  ): Promise<TimelineMessage> {
    const messages = this.timelines.get(leadId) || [];
    const newMessage: TimelineMessage = {
      id: `msg_${leadId}_${Date.now()}_${messages.length}`,
      timestamp: new Date(),
      sender: message.sender,
      content: message.content
    };
    messages.push(newMessage);
    this.timelines.set(leadId, messages);
    return newMessage;
  }

  public async getRecentMessages(leadId: string, limit = 50): Promise<TimelineMessage[]> {
    const messages = this.timelines.get(leadId) || [];
    return messages.slice(-limit);
  }

  public async clearTimeline(leadId: string): Promise<void> {
    this.timelines.delete(leadId);
  }

  // ==========================================
  // Future Graph Memory Implementation
  // ==========================================

  public async upsertEntity(entity: any): Promise<void> {
    // Support either MemoryEntity from interface or generic GraphNode
    const nodeId = entity.id;
    const history = this.graphNodes.get(nodeId) || [];
    const currentVersion = history.length > 0 ? history[history.length - 1].version : 0;

    const node: GraphNode = {
      id: nodeId,
      tenantId: entity.properties?.tenantId || "default_tenant",
      type: entity.type || "generic",
      name: entity.name || "",
      properties: entity.properties || {},
      version: currentVersion + 1
    };

    history.push(node);
    this.graphNodes.set(nodeId, history);
  }

  public async linkEntities(relation: MemoryRelation & { weight?: number; tenantId?: string }): Promise<void> {
    const storeKey = `${relation.sourceId}:${relation.targetId}:${relation.predicate}`;
    this.graphEdges.set(storeKey, {
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      predicate: relation.predicate,
      weight: relation.weight ?? 1.0,
      tenantId: relation.tenantId || "default_tenant"
    });
  }

  public async queryNeighbors(entityId: string): Promise<any[]> {
    const neighbors: GraphNode[] = [];
    
    for (const edge of this.graphEdges.values()) {
      let targetId: string | null = null;
      if (edge.sourceId === entityId) {
        targetId = edge.targetId;
      } else if (edge.targetId === entityId) {
        targetId = edge.sourceId;
      }

      if (targetId) {
        const history = this.graphNodes.get(targetId);
        if (history && history.length > 0) {
          neighbors.push(history[history.length - 1]);
        }
      }
    }
    
    return neighbors;
  }

  // ==========================================
  // IMemoryEngine Implementation
  // ==========================================

  /**
   * Extracts key-value facts from conversational text using regex heuristics.
   * Completely business-agnostic.
   */
  public async extractFacts(leadId: string, message: string): Promise<MemoryFact[]> {
    if (!message) return [];
    
    const facts: MemoryFact[] = [];
    
    // Heuristic patterns for fact extraction, e.g. "my budget is 5000", "i am located in Seattle"
    const patternBudget = /(?:budget is|budget of|budget:\s*)\$?(\d+)/i;
    const patternEmail = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const patternPhone = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i;
    const patternName = /(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;

    const budgetMatch = message.match(patternBudget);
    if (budgetMatch) {
      facts.push({
        key: "budget",
        value: budgetMatch[1],
        confidence: 0.9,
        lastObservedAt: new Date()
      });
      await this.writeMemory("default_tenant", "customer", `lead:${leadId}:budget`, budgetMatch[1], 0.9);
    }

    const emailMatch = message.match(patternEmail);
    if (emailMatch) {
      facts.push({
        key: "email",
        value: emailMatch[1],
        confidence: 0.95,
        lastObservedAt: new Date()
      });
      await this.writeMemory("default_tenant", "customer", `lead:${leadId}:email`, emailMatch[1], 0.95);
    }

    const phoneMatch = message.match(patternPhone);
    if (phoneMatch) {
      facts.push({
        key: "phone",
        value: phoneMatch[0],
        confidence: 0.95,
        lastObservedAt: new Date()
      });
      await this.writeMemory("default_tenant", "customer", `lead:${leadId}:phone`, phoneMatch[0], 0.95);
    }

    const nameMatch = message.match(patternName);
    if (nameMatch) {
      facts.push({
        key: "name",
        value: nameMatch[1],
        confidence: 0.85,
        lastObservedAt: new Date()
      });
      await this.writeMemory("default_tenant", "customer", `lead:${leadId}:name`, nameMatch[1], 0.85);
    }

    return facts;
  }

  /**
   * Loads all facts associated with a lead and compiles a summary.
   */
  public async loadMemoryContext(leadId: string): Promise<{ facts: MemoryFact[]; summary: string }> {
    const facts: MemoryFact[] = [];
    const summaryParts: string[] = [];

    // Retrieve from records
    for (const [storeKey, history] of this.records.entries()) {
      if (history.length === 0) continue;
      const latest = history[history.length - 1];

      if (latest.key.startsWith(`lead:${leadId}:`)) {
        const factKey = latest.key.replace(`lead:${leadId}:`, "");
        facts.push({
          key: factKey,
          value: latest.value,
          confidence: latest.confidence,
          lastObservedAt: latest.lastObservedAt
        });
        summaryParts.push(`${factKey}: ${latest.value}`);
      }
    }

    return {
      facts,
      summary: summaryParts.length > 0 
        ? `Lead Facts Summary:\n- ${summaryParts.join("\n- ")}` 
        : "No context memory captured yet."
    };
  }

  public async getStoredMemoryFacts(leadId: string): Promise<any[]> {
    return prisma.memory.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        key: true,
        value: true,
        confidence: true,
        source: true,
        lastObservedAt: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  public async createMemoryFact(
    leadId: string,
    key: string,
    value: string,
    confidence: number,
    source: string
  ): Promise<any> {
    return prisma.memory.create({
      data: {
        leadId,
        key,
        value,
        confidence,
        source,
        lastObservedAt: new Date(),
      },
    });
  }

  public async updateMemoryFact(
    id: string,
    value: string,
    confidence: number,
    source: string
  ): Promise<any> {
    return prisma.memory.update({
      where: { id },
      data: {
        value,
        confidence,
        source,
        lastObservedAt: new Date(),
      },
    });
  }
}
