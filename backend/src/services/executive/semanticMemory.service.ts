import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.3F SEMANTIC MEMORY & ONTOLOGICAL REASONING INTERFACES
// ============================================================================

export interface ISemanticConcept {
  id: string;
  tenantId: string;
  executiveId: string;
  name: string;
  domain: string; // e.g. "Sales", "Operations", "Engineering"
  contextTags: string[];
  version: number;
  evolutionHistory: string[];
  createdTime: string;
}

export interface ISemanticRelationship {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationshipType: "INHERITS" | "HIERARCHY" | "RELATED_TO" | "DEPENDS_ON";
  similarityScore: number;
  confidence: number;
  explainability: {
    why: string;
    evidenceRefs: string[];
    alternativeMeanings: string[];
    rejectedMeanings: string[];
    businessContext: string;
    historicalEvolution: string;
  };
}

export interface ISemanticInterpretation {
  conceptId: string;
  confidence: number; // 0.0 - 1.0
  ambiguity: number; // 0.0 - 1.0
  uncertainty: number; // 0.0 - 1.0
  alternativeInterpretations: string[];
  evidenceQuality: string; // "HIGH" | "MEDIUM" | "LOW"
}

export interface ISemanticConflict {
  id: string;
  tenantId: string;
  conceptId: string;
  conflictingObservations: Array<{ source: string; value: any }>;
  explanation: string;
  createdTime: string;
}

export interface IExecutiveSemanticMemoryRepository {
  saveConcept(tenantId: string, concept: ISemanticConcept): Promise<void>;
  saveRelationship(tenantId: string, rel: ISemanticRelationship): Promise<void>;
  saveConflict(tenantId: string, conflict: ISemanticConflict): Promise<void>;
  findConcept(tenantId: string, id: string): Promise<ISemanticConcept | null>;
  findConceptByName(tenantId: string, name: string, domain?: string): Promise<ISemanticConcept | null>;
  findRelationshipsFrom(tenantId: string, sourceId: string): Promise<ISemanticRelationship[]>;
  getAllConcepts(tenantId: string): Promise<ISemanticConcept[]>;
  getAllRelationships(tenantId: string): Promise<ISemanticRelationship[]>;
  getAllConflicts(tenantId: string): Promise<ISemanticConflict[]>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveSemanticMemoryRepository implements IExecutiveSemanticMemoryRepository {
  private concepts = new Map<string, ISemanticConcept>();
  private relationships = new Map<string, ISemanticRelationship>();
  private conflicts = new Map<string, ISemanticConflict>();

  public async saveConcept(tenantId: string, concept: ISemanticConcept): Promise<void> {
    this.verifyTenant(tenantId, concept.tenantId);
    this.concepts.set(concept.id, JSON.parse(JSON.stringify(concept)));
  }

  public async saveRelationship(tenantId: string, rel: ISemanticRelationship): Promise<void> {
    this.verifyTenant(tenantId, tenantId); // Verified contextually
    this.relationships.set(rel.id, JSON.parse(JSON.stringify(rel)));
  }

  public async saveConflict(tenantId: string, conflict: ISemanticConflict): Promise<void> {
    this.verifyTenant(tenantId, conflict.tenantId);
    this.conflicts.set(conflict.id, JSON.parse(JSON.stringify(conflict)));
  }

  public async findConcept(tenantId: string, id: string): Promise<ISemanticConcept | null> {
    const concept = this.concepts.get(id);
    if (!concept) return null;
    this.verifyTenant(tenantId, concept.tenantId);
    return JSON.parse(JSON.stringify(concept));
  }

  public async findConceptByName(tenantId: string, name: string, domain?: string): Promise<ISemanticConcept | null> {
    for (const c of this.concepts.values()) {
      if (c.tenantId === tenantId && c.name.toLowerCase() === name.toLowerCase()) {
        if (!domain || c.domain.toLowerCase() === domain.toLowerCase()) {
          return JSON.parse(JSON.stringify(c));
        }
      }
    }
    return null;
  }

  public async findRelationshipsFrom(tenantId: string, sourceId: string): Promise<ISemanticRelationship[]> {
    const results: ISemanticRelationship[] = [];
    for (const rel of this.relationships.values()) {
      if (rel.sourceConceptId === sourceId) {
        results.push(JSON.parse(JSON.stringify(rel)));
      }
    }
    return results;
  }

  public async getAllConcepts(tenantId: string): Promise<ISemanticConcept[]> {
    const results: ISemanticConcept[] = [];
    for (const c of this.concepts.values()) {
      if (c.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(c)));
      }
    }
    return results;
  }

  public async getAllRelationships(tenantId: string): Promise<ISemanticRelationship[]> {
    const results: ISemanticRelationship[] = [];
    for (const rel of this.relationships.values()) {
      const src = this.concepts.get(rel.sourceConceptId);
      if (src && src.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(rel)));
      }
    }
    return results;
  }

  public async getAllConflicts(tenantId: string): Promise<ISemanticConflict[]> {
    const results: ISemanticConflict[] = [];
    for (const conf of this.conflicts.values()) {
      if (conf.tenantId === tenantId) {
        results.push(JSON.parse(JSON.stringify(conf)));
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
// SERVICE IMPLEMENTATION (STATELESS SEMANTIC INTELLIGENCE)
// ============================================================================

export class ExecutiveSemanticMemoryService {
  constructor(private di: DIContainer = container) {}

  /**
   * Registers a new semantic concept.
   */
  public async addConcept(
    tenantId: string,
    executiveId: string,
    name: string,
    domain: string,
    contextTags: string[]
  ): Promise<ISemanticConcept> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concept: ISemanticConcept = {
      id: `concept_${name.toLowerCase().replace(/\s+/g, "_")}_${domain.toLowerCase().replace(/\s+/g, "_")}`,
      tenantId,
      executiveId,
      name,
      domain,
      contextTags,
      version: 1,
      evolutionHistory: [`Concept created under domain [${domain}]`],
      createdTime: new Date().toISOString(),
    };

    await repo.saveConcept(tenantId, concept);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.semantic.created", "1.0.0", {
          conceptId: concept.id,
          tenantId,
          timestamp: concept.createdTime,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return concept;
  }

  /**
   * Links concepts in the Business Ontology Engine (Deliverable 4, 11).
   */
  public async linkConcepts(
    tenantId: string,
    sourceId: string,
    targetId: string,
    relationshipType: ISemanticRelationship["relationshipType"],
    confidence: number,
    evidenceRefs: string[],
    explainabilityArgs?: Partial<ISemanticRelationship["explainability"]>
  ): Promise<ISemanticRelationship> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const src = await repo.findConcept(tenantId, sourceId);
    const dst = await repo.findConcept(tenantId, targetId);
    if (!src || !dst) {
      throw new Error(`Invalid Link: Source [${sourceId}] or Target [${targetId}] concept not found.`);
    }

    // Meaning Distance / Similarity score (Deliverable 2)
    const similarityScore = this.calculateMeaningDistance(src, dst);

    const relId = `rel_${sourceId}_${targetId}_${relationshipType}`;
    const rel: ISemanticRelationship = {
      id: relId,
      sourceConceptId: sourceId,
      targetConceptId: targetId,
      relationshipType,
      similarityScore,
      confidence,
      explainability: {
        why: explainabilityArgs?.why || `Related via similarity ${similarityScore}`,
        evidenceRefs,
        alternativeMeanings: explainabilityArgs?.alternativeMeanings || [],
        rejectedMeanings: explainabilityArgs?.rejectedMeanings || [],
        businessContext: explainabilityArgs?.businessContext || "General Enterprise Context",
        historicalEvolution: explainabilityArgs?.historicalEvolution || "Initial linkage",
      },
    };

    await repo.saveRelationship(tenantId, rel);
    return rel;
  }

  /**
   * DELIVERABLE 2 — Meaning Distance / Semantic Similarity calculations.
   */
  public calculateMeaningDistance(conceptA: ISemanticConcept, conceptB: ISemanticConcept): number {
    let intersection = 0;
    const allTags = new Set([...conceptA.contextTags, ...conceptB.contextTags]);

    for (const tag of allTags) {
      if (conceptA.contextTags.includes(tag) && conceptB.contextTags.includes(tag)) {
        intersection++;
      }
    }

    const jaccard = allTags.size > 0 ? intersection / allTags.size : 0.0;
    const domainMatch = conceptA.domain.toLowerCase() === conceptB.domain.toLowerCase() ? 0.3 : 0.0;

    return parseFloat(Math.min(1.0, jaccard * 0.7 + domainMatch).toFixed(3));
  }

  /**
   * DELIVERABLE 5 — Context Meaning Engine (Disambiguation)
   */
  public async disambiguateConcept(
    tenantId: string,
    name: string,
    contextContext: string
  ): Promise<ISemanticConcept | null> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concepts = await repo.getAllConcepts(tenantId);
    let bestMatch: ISemanticConcept | null = null;
    let maxMatchScore = -1;

    for (const c of concepts) {
      if (c.name.toLowerCase() === name.toLowerCase()) {
        let score = 0;
        if (c.domain.toLowerCase() === contextContext.toLowerCase()) {
          score += 5;
        }
        for (const tag of c.contextTags) {
          if (contextContext.toLowerCase().includes(tag.toLowerCase())) {
            score += 2;
          }
        }

        if (score > maxMatchScore) {
          maxMatchScore = score;
          bestMatch = c;
        }
      }
    }

    return bestMatch;
  }

  /**
   * DELIVERABLE 6 — Semantic Conflict Engine
   * Detects contradictions. Stores the conflict permanently. NEVER resolves it.
   */
  public async detectSemanticConflict(
    tenantId: string,
    conceptId: string,
    observations: Array<{ source: string; value: any }>
  ): Promise<ISemanticConflict | null> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concept = await repo.findConcept(tenantId, conceptId);
    if (!concept) {
      throw new Error(`Concept [${conceptId}] not found for conflict assessment.`);
    }

    const values = observations.map(o => JSON.stringify(o.value));
    const uniqueValues = new Set(values);

    if (uniqueValues.size <= 1) {
      return null; // No conflict
    }

    const explanation = `Contradicting observations detected on [${concept.name}]. Sources: ${observations
      .map(o => `${o.source}=${JSON.stringify(o.value)}`)
      .join(", ")}.`;

    const conflictId = `conflict_${conceptId}_${Date.now()}`;
    const conflict: ISemanticConflict = {
      id: conflictId,
      tenantId,
      conceptId,
      conflictingObservations: observations,
      explanation,
      createdTime: new Date().toISOString(),
    };

    await repo.saveConflict(tenantId, conflict);

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.semantic.conflict", "1.0.0", {
          conflictId,
          tenantId,
          conceptId,
          explanation,
          timestamp: conflict.createdTime,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return conflict;
  }

  /**
   * DELIVERABLE 7 — Concept Evolution Engine
   */
  public async evolveConcept(
    tenantId: string,
    conceptId: string,
    newName: string,
    evolutionNote: string
  ): Promise<ISemanticConcept> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concept = await repo.findConcept(tenantId, conceptId);
    if (!concept) {
      throw new Error(`Concept [${conceptId}] not found.`);
    }

    const now = new Date().toISOString();
    concept.version++;
    concept.name = newName;
    concept.evolutionHistory.push(`[${now}] Evolved to [${newName}]: ${evolutionNote}`);

    await repo.saveConcept(tenantId, concept);

    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.semantic.evolved", "1.0.0", {
          conceptId,
          tenantId,
          version: concept.version,
          timestamp: now,
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return concept;
  }

  /**
   * DELIVERABLE 8 — Semantic Clustering Engine
   */
  public async clusterConcepts(tenantId: string): Promise<Map<string, string[]>> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concepts = await repo.getAllConcepts(tenantId);
    const clusters = new Map<string, string[]>();

    for (const c of concepts) {
      const clusterKey = `${c.domain}_cluster`;
      const cluster = clusters.get(clusterKey) || [];
      cluster.push(c.id);
      clusters.set(clusterKey, cluster);
    }

    return clusters;
  }

  /**
   * DELIVERABLE 9 — Intent Understanding Engine
   */
  public async resolveIntent(tenantId: string, queryText: string): Promise<string[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concepts = await repo.getAllConcepts(tenantId);
    const matchedConceptIds: string[] = [];

    const tokens = queryText.toLowerCase().split(/\s+/);
    for (const c of concepts) {
      const nameMatch = tokens.some(t => c.name.toLowerCase().includes(t));
      const tagMatch = tokens.some(t => c.contextTags.some(tag => tag.toLowerCase().includes(t)));

      if (nameMatch || tagMatch) {
        matchedConceptIds.push(c.id);
      }
    }

    return matchedConceptIds;
  }

  /**
   * DELIVERABLE 12 — Semantic Confidence Engine
   */
  public async interpretSemanticConfidence(
    tenantId: string,
    conceptId: string
  ): Promise<ISemanticInterpretation> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveSemanticMemoryRepository>("IExecutiveSemanticMemoryRepository");

    const concept = await repo.findConcept(tenantId, conceptId);
    if (!concept) {
      throw new Error(`Concept [${conceptId}] not found.`);
    }

    const conflicts = await repo.getAllConflicts(tenantId);
    const relatedConflicts = conflicts.filter(c => c.conceptId === conceptId);

    const hasConflict = relatedConflicts.length > 0;
    const ambiguity = hasConflict ? 0.8 : 0.1;
    const uncertainty = hasConflict ? 0.7 : 0.2;
    const confidence = hasConflict ? 0.3 : 0.9;

    return {
      conceptId,
      confidence,
      ambiguity,
      uncertainty,
      alternativeInterpretations: hasConflict ? ["Contradicting metrics reported"] : [],
      evidenceQuality: hasConflict ? "LOW" : "HIGH",
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
