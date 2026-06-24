import { MemoryFact, TimelineMessage, MemoryEntity, MemoryRelation } from "../interfaces/memory";

export interface ContextItem {
  id: string;
  source: "constitution" | "memory" | "knowledge" | "learning" | "tool" | "history";
  content: string;
  priority: number; // 1 (highest) to 10 (lowest)
  relevanceScore: number; // 0.0 to 1.0
  tokenLength: number;
  metadata?: Record<string, any>;
}

export type MemoryType =
  | "business"
  | "customer"
  | "department"
  | "executive"
  | "timeline"
  | "learning"
  | "future_graph";

export interface MemoryRecord {
  id: string;
  tenantId: string;
  type: MemoryType;
  key: string;
  value: string;
  confidence: number;
  version: number;
  createdAt: Date;
  lastObservedAt: Date;
  metadata?: Record<string, any>;
  accessRules?: string[]; // e.g. ["role:admin", "department:ops"]
}

export interface GraphNode {
  id: string;
  tenantId: string;
  type: string;
  name: string;
  properties: Record<string, any>;
  version: number;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  predicate: string;
  weight: number;
  tenantId: string;
}

export interface KnowledgeItem {
  id: string;
  tenantId: string;
  category: string;
  tags: string[];
  content: string;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface LearningEntry {
  id: string;
  tenantId: string;
  pattern: string;
  bestPractice: string;
  fewShotExamples: Array<{ input: string; output: string }>;
  status: "pending" | "approved" | "rejected";
  validatorId?: string;
  validatedAt?: Date;
  evaluationMetadata?: {
    accuracy?: number;
    latencyMs?: number;
    feedbackScore?: number;
    usageCount?: number;
  };
}

export interface AIConstitution {
  version: string;
  corePrinciples: string[];
  permissionRules: string[];
  policies: string[];
  escalationRules: string[];
  hallucinationPolicies: string[];
}

export interface PromptTemplate {
  id: string;
  version: string;
  systemTemplate: string;
  userTemplate: string;
  requiredPlaceholders: string[];
  metadata?: Record<string, any>;
}

export interface ReasoningStep {
  step: "intent" | "knowledge" | "memory" | "policies" | "tools" | "decision" | "action";
  timestamp: Date;
  input: any;
  output: any;
  confidence: number;
  explanation: string;
}

export interface ReasoningTrace {
  id: string;
  tenantId: string;
  intent: string;
  steps: ReasoningStep[];
  finalDecision: string;
  finalAction: string;
  overallConfidence: number;
  explanation: string;
}

export interface ContextBudget {
  maxTokens: number;
  allocations: {
    constitution: number;
    memory: number;
    knowledge: number;
    learning: number;
    tools: number;
    history: number;
  };
}
