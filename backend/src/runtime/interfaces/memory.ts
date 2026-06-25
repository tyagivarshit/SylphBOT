export interface MemoryFact {
  key: string;
  value: string;
  confidence: number;
  lastObservedAt: Date;
}

export interface IMemoryEngine {
  extractFacts(leadId: string, message: string): Promise<MemoryFact[]>;
  loadMemoryContext(leadId: string): Promise<{
    facts: MemoryFact[];
    summary: string;
  }>;
  getStoredMemoryFacts(leadId: string): Promise<any[]>;
  createMemoryFact(leadId: string, key: string, value: string, confidence: number, source: string): Promise<any>;
  updateMemoryFact(id: string, value: string, confidence: number, source: string): Promise<any>;
}

export interface TimelineMessage {
  id: string;
  sender: "USER" | "AI" | "SYSTEM";
  content: string;
  timestamp: Date;
}

export interface ITimelineMemory {
  appendMessage(leadId: string, message: Omit<TimelineMessage, "id" | "timestamp">): Promise<TimelineMessage>;
  getRecentMessages(leadId: string, limit?: number): Promise<TimelineMessage[]>;
  clearTimeline(leadId: string): Promise<void>;
}

export interface MemoryEntity {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface MemoryRelation {
  sourceId: string;
  targetId: string;
  predicate: string;
}

export interface IGraphMemory {
  upsertEntity(entity: MemoryEntity): Promise<void>;
  linkEntities(relation: MemoryRelation): Promise<void>;
  queryNeighbors(entityId: string): Promise<MemoryEntity[]>;
}
