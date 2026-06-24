import { ILearningRegistry, OptimizationEntry } from "../interfaces/intelligence";
import { LearningEntry } from "./types";

export class LearningRegistry implements ILearningRegistry {
  private learnings = new Map<string, LearningEntry>();
  private optimizations = new Map<string, OptimizationEntry[]>();

  constructor() {}

  // ==========================================
  // ILearningRegistry Interface Compatibility
  // ==========================================

  public async registerOptimization(entry: OptimizationEntry): Promise<void> {
    const key = `${entry.businessId}:${entry.promptTemplateId}`;
    const list = this.optimizations.get(key) || [];
    
    // Check if variant already exists and update metrics, or add new
    const existingIndex = list.findIndex(opt => opt.variantKey === entry.variantKey);
    if (existingIndex > -1) {
      list[existingIndex] = entry;
    } else {
      list.push(entry);
    }
    
    this.optimizations.set(key, list);
  }

  public async getOptimizedVariant(businessId: string, promptTemplateId: string): Promise<string | null> {
    const key = `${businessId}:${promptTemplateId}`;
    const list = this.optimizations.get(key);
    if (!list || list.length === 0) return null;

    // Pick variant with the highest score
    // Score calculation: clicks + responses * 2 + revenue * 0.01
    let bestVariant: string | null = null;
    let maxScore = -1;

    for (const opt of list) {
      const score = 
        opt.conversionMetrics.clicks + 
        opt.conversionMetrics.responses * 2 + 
        opt.conversionMetrics.revenue * 0.01;
        
      if (score > maxScore) {
        maxScore = score;
        bestVariant = opt.variantKey;
      }
    }

    return bestVariant;
  }

  // ==========================================
  // Cognitive Learning Infrastructure
  // ==========================================

  /**
   * Register a new learning pattern or guideline.
   * Starts in "pending" status. Needs human validation.
   */
  public async registerLearning(
    tenantId: string,
    pattern: string,
    bestPractice: string,
    fewShotExamples: Array<{ input: string; output: string }>,
    evalMetadata?: Record<string, any>
  ): Promise<LearningEntry> {
    const id = `learn_${tenantId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const learning: LearningEntry = {
      id,
      tenantId,
      pattern,
      bestPractice,
      fewShotExamples,
      status: "pending",
      evaluationMetadata: {
        accuracy: evalMetadata?.accuracy ?? 1.0,
        latencyMs: evalMetadata?.latencyMs ?? 0,
        feedbackScore: evalMetadata?.feedbackScore ?? 5,
        usageCount: 0
      }
    };

    this.learnings.set(id, learning);
    return learning;
  }

  /**
   * Action: Approve a learning with a manual validator ID
   */
  public async approveLearning(id: string, validatorId: string): Promise<LearningEntry> {
    const learning = this.learnings.get(id);
    if (!learning) {
      throw new Error(`Learning record with ID [${id}] not found.`);
    }

    learning.status = "approved";
    learning.validatorId = validatorId;
    learning.validatedAt = new Date();
    
    this.learnings.set(id, learning);
    return learning;
  }

  /**
   * Action: Reject a learning with a manual validator ID
   */
  public async rejectLearning(id: string, validatorId: string): Promise<LearningEntry> {
    const learning = this.learnings.get(id);
    if (!learning) {
      throw new Error(`Learning record with ID [${id}] not found.`);
    }

    learning.status = "rejected";
    learning.validatorId = validatorId;
    learning.validatedAt = new Date();
    
    this.learnings.set(id, learning);
    return learning;
  }

  /**
   * Retrieves all approved learnings for a tenant
   */
  public async getApprovedLearnings(tenantId: string): Promise<LearningEntry[]> {
    const results: LearningEntry[] = [];
    for (const item of this.learnings.values()) {
      if (item.tenantId === tenantId && item.status === "approved") {
        results.push(item);
      }
    }
    return results;
  }

  /**
   * Retrieves all approved best practices for a tenant
   */
  public async getBestPractices(tenantId: string): Promise<string[]> {
    const approved = await this.getApprovedLearnings(tenantId);
    return approved.map(item => item.bestPractice).filter(Boolean);
  }

  /**
   * Finds matching few shot examples matching a pattern
   */
  public async getFewShots(
    tenantId: string,
    patternQuery: string
  ): Promise<Array<{ input: string; output: string }>> {
    const approved = await this.getApprovedLearnings(tenantId);
    const examples: Array<{ input: string; output: string }> = [];
    
    const cleanQuery = patternQuery.toLowerCase();
    for (const item of approved) {
      if (item.pattern.toLowerCase().includes(cleanQuery)) {
        examples.push(...item.fewShotExamples);
      }
    }
    
    return examples;
  }
}
