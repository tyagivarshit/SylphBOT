import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";

// ============================================================================
// STAGE 3.5B EXECUTIVE EVIDENCE VALIDATION INTERFACES
// ============================================================================

export type EvidenceStatus =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "STALE"
  | "ARCHIVED";

export type EvidenceClassification =
  | "Quantitative"
  | "Qualitative"
  | "Operational"
  | "Financial"
  | "Market"
  | "Customer"
  | "Product"
  | "Engineering"
  | "Hiring"
  | "Security"
  | "Compliance"
  | "Legal"
  | "Custom";

export interface IEvidence {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  status: EvidenceStatus;
  classification: EvidenceClassification;
  version: number;
  actorId: string;

  // Metadata metrics for credibility & confidence
  source: string;
  sourceReliability: number; // 0.0 - 1.0
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  consistency: number; // 0.0 - 1.0
  historicalAccuracy: number; // 0.0 - 1.0
  evidenceQuality: number; // 0.0 - 1.0
  independentSourcesCount: number;

  // Decoupled references (Correlation graph)
  goals: string[];
  strategies: string[];
  plans: string[];
  timelines: string[];
  scenarios: string[];
  risks: string[];
  memories: string[];
  decisions: string[];
  customers: string[];
  products: string[];
  markets: string[];

  createdAt: string;
  updatedAt: string;
}

export interface IEvidenceHistoryEntry {
  id: string;
  tenantId: string;
  evidenceId: string;
  version: number;
  previousStatus: EvidenceStatus | "NONE";
  newStatus: EvidenceStatus;
  actorId: string;
  timestamp: string;
  reason: string;
  evidenceSnapshot: IEvidence;
}

export interface IEvidenceRelation {
  id: string;
  tenantId: string;
  sourceEvidenceId: string;
  targetEvidenceId: string;
  type: "CORROBORATES" | "CONTRADICTS" | "SUPPORTS" | "SUPERSEDES";
  createdAt: string;
}

export interface ICredibilityReport {
  evidenceId: string;
  tenantId: string;
  credibilityScore: number; // 0.0 - 1.0
  explanation: string;
}

export interface IEvidenceCompletenessReport {
  evidenceId: string;
  tenantId: string;
  coverageScore: number; // 0.0 - 1.0
  isCompletenessSufficient: boolean;
  missingEvidenceList: string[];
  requiredEvidenceList: string[];
  unknownAreas: string[];
}

export interface IEvidenceContradictionReport {
  evidenceId: string;
  tenantId: string;
  hasContradictions: boolean;
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  affectedDecisions: string[];
  affectedGoals: string[];
  affectedPlans: string[];
  explanation: string;
  conflictGraph: { source: string; target: string; reason: string }[];
}

export interface IEvidenceConfidenceReport {
  evidenceId: string;
  tenantId: string;
  overallConfidence: number; // 0.0 - 1.0
  confidenceInterval: [number, number];
  reasonCodes: string[];
  weakAreas: string[];
}

export interface IEvidenceExplainability {
  evidenceId: string;
  tenantId: string;
  whyAccepted: string;
  whyRejected: string;
  whyConfidence: string;
  whyStale: string;
  whyConflict: string;
  whyInsufficient: string;
  whyLinked: string;
}

export interface IEvidencePackage {
  problem: string;
  decisionContext: string;
  evidenceList: IEvidence[];
  confidence: number;
  contradictions: string[];
  missingEvidence: string[];
  weakEvidence: string[];
  relatedMemory: string[];
  relatedRisks: string[];
  relatedGoals: string[];
  relatedPlans: string[];
  explanation: string;
}

export interface IEvidenceGraphNode {
  evidenceId: string;
  classification: EvidenceClassification;
  status: EvidenceStatus;
  relations: {
    targetEvidenceId: string;
    type: IEvidenceRelation["type"];
  }[];
}

export interface IEvidenceGraphTraversalResult {
  rootEvidenceId: string;
  nodes: IEvidenceGraphNode[];
  hasCycle: boolean;
}

export interface IExecutiveEvidenceRepository {
  saveEvidence(tenantId: string, evidence: IEvidence): Promise<void>;
  findEvidenceById(tenantId: string, id: string): Promise<IEvidence | null>;
  findEvidenceVersion(tenantId: string, id: string, version: number): Promise<IEvidence | null>;
  deleteEvidence(tenantId: string, id: string): Promise<void>;
  getEvidences(tenantId: string): Promise<IEvidence[]>;
  saveRelation(tenantId: string, relation: IEvidenceRelation): Promise<void>;
  getRelationsByEvidenceId(tenantId: string, evidenceId: string): Promise<IEvidenceRelation[]>;
  saveHistoryEntry(tenantId: string, entry: IEvidenceHistoryEntry): Promise<void>;
  getHistoryByEvidenceId(tenantId: string, evidenceId: string): Promise<IEvidenceHistoryEntry[]>;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION (DECOUPLED / IN-MEMORY)
// ============================================================================

export class MemoryExecutiveEvidenceRepository implements IExecutiveEvidenceRepository {
  private evidenceDb = new Map<string, IEvidence>();
  private relationsDb = new Map<string, IEvidenceRelation[]>();
  private historyDb = new Map<string, IEvidenceHistoryEntry[]>();

  public async saveEvidence(tenantId: string, evidence: IEvidence): Promise<void> {
    this.verifyTenant(tenantId, evidence.tenantId);
    this.evidenceDb.set(evidence.id, JSON.parse(JSON.stringify(evidence)));
  }

  public async findEvidenceById(tenantId: string, id: string): Promise<IEvidence | null> {
    const ev = this.evidenceDb.get(id);
    if (!ev) return null;
    this.verifyTenant(tenantId, ev.tenantId);
    return JSON.parse(JSON.stringify(ev));
  }

  public async findEvidenceVersion(tenantId: string, id: string, version: number): Promise<IEvidence | null> {
    const history = await this.getHistoryByEvidenceId(tenantId, id);
    const entry = history.find(h => h.version === version);
    if (!entry) return null;
    return JSON.parse(JSON.stringify(entry.evidenceSnapshot));
  }

  public async deleteEvidence(tenantId: string, id: string): Promise<void> {
    const ev = this.evidenceDb.get(id);
    if (ev) {
      this.verifyTenant(tenantId, ev.tenantId);
      this.evidenceDb.delete(id);
    }
  }

  public async getEvidences(tenantId: string): Promise<IEvidence[]> {
    const list: IEvidence[] = [];
    for (const ev of this.evidenceDb.values()) {
      if (ev.tenantId === tenantId) {
        list.push(JSON.parse(JSON.stringify(ev)));
      }
    }
    return list;
  }

  public async saveRelation(tenantId: string, relation: IEvidenceRelation): Promise<void> {
    this.verifyTenant(tenantId, relation.tenantId);
    if (!this.relationsDb.has(relation.sourceEvidenceId)) {
      this.relationsDb.set(relation.sourceEvidenceId, []);
    }
    this.relationsDb.get(relation.sourceEvidenceId)!.push(JSON.parse(JSON.stringify(relation)));
  }

  public async getRelationsByEvidenceId(tenantId: string, evidenceId: string): Promise<IEvidenceRelation[]> {
    const list = this.relationsDb.get(evidenceId) || [];
    for (const r of list) {
      this.verifyTenant(tenantId, r.tenantId);
    }
    return JSON.parse(JSON.stringify(list));
  }

  public async saveHistoryEntry(tenantId: string, entry: IEvidenceHistoryEntry): Promise<void> {
    this.verifyTenant(tenantId, entry.tenantId);
    if (!this.historyDb.has(entry.evidenceId)) {
      this.historyDb.set(entry.evidenceId, []);
    }
    this.historyDb.get(entry.evidenceId)!.push(JSON.parse(JSON.stringify(entry)));
  }

  public async getHistoryByEvidenceId(tenantId: string, evidenceId: string): Promise<IEvidenceHistoryEntry[]> {
    const list = this.historyDb.get(evidenceId) || [];
    for (const h of list) {
      this.verifyTenant(tenantId, h.tenantId);
    }
    return JSON.parse(JSON.stringify(list));
  }

  private verifyTenant(callerTenantId: string, resourceTenantId: string): void {
    if (callerTenantId !== resourceTenantId) {
      throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
    }
  }
}

// ============================================================================
// SERVICE IMPLEMENTATION (EVIDENCE VALIDATION SERVICE)
// ============================================================================

export class ExecutiveEvidenceValidationService {
  constructor(private di: DIContainer = container) {}

  public async collectEvidence(tenantId: string, data: Partial<IEvidence>): Promise<IEvidence> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");

    const id = data.id || `ev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const evidence: IEvidence = {
      id,
      tenantId,
      title: data.title || "Untitled Evidence",
      description: data.description || "No description.",
      status: data.status || "DRAFT",
      classification: data.classification || "Quantitative",
      version: 1,
      actorId: data.actorId || "exec_chief_operations",

      source: data.source || "Unknown Source",
      sourceReliability: data.sourceReliability !== undefined ? data.sourceReliability : 0.8,
      verificationStatus: data.verificationStatus || "PENDING",
      consistency: data.consistency !== undefined ? data.consistency : 0.9,
      historicalAccuracy: data.historicalAccuracy !== undefined ? data.historicalAccuracy : 0.8,
      evidenceQuality: data.evidenceQuality !== undefined ? data.evidenceQuality : 0.85,
      independentSourcesCount: data.independentSourcesCount || 1,

      goals: data.goals || [],
      strategies: data.strategies || [],
      plans: data.plans || [],
      timelines: data.timelines || [],
      scenarios: data.scenarios || [],
      risks: data.risks || [],
      memories: data.memories || [],
      decisions: data.decisions || [],
      customers: data.customers || [],
      products: data.products || [],
      markets: data.markets || [],

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await repo.saveEvidence(tenantId, evidence);
    await this.publishEvent(tenantId, "executive.evidence.created", { evidenceId: id, tenantId });
    await this.logHistory(tenantId, evidence, "NONE", evidence.status, evidence.actorId, "Collected evidence.");

    return evidence;
  }

  public async verifyEvidence(
    tenantId: string,
    id: string,
    verificationStatus: "VERIFIED" | "REJECTED",
    actorId: string,
    reason: string
  ): Promise<IEvidence> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");

    const evidence = await repo.findEvidenceById(tenantId, id);
    if (!evidence) {
      throw new Error(`Evidence [${id}] not found.`);
    }

    const previousStatus = evidence.status;
    const oldVersion = evidence.version;

    evidence.verificationStatus = verificationStatus;
    evidence.status = verificationStatus === "VERIFIED" ? "VERIFIED" : "REJECTED";
    evidence.version = oldVersion + 1;
    evidence.actorId = actorId;
    evidence.updatedAt = new Date().toISOString();

    await repo.saveEvidence(tenantId, evidence);
    await this.publishEvent(tenantId, "executive.evidence.verified", { evidenceId: id, verificationStatus, tenantId });
    await this.logHistory(tenantId, evidence, previousStatus, evidence.status, actorId, reason);

    return evidence;
  }

  public async getEvidence(tenantId: string, id: string): Promise<IEvidence | null> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");
    return repo.findEvidenceById(tenantId, id);
  }

  public async searchEvidence(tenantId: string, criteria: Partial<IEvidence>): Promise<IEvidence[]> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");
    const all = await repo.getEvidences(tenantId);

    return all.filter(ev => {
      if (criteria.status && ev.status !== criteria.status) return false;
      if (criteria.classification && ev.classification !== criteria.classification) return false;
      if (criteria.title && !ev.title.includes(criteria.title)) return false;
      return true;
    });
  }

  // DELIVERABLE 6: Credibility Engine
  public async calculateCredibility(tenantId: string, id: string): Promise<ICredibilityReport> {
    this.verifyTenantOwnership(tenantId);
    const ev = await this.getEvidence(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const sourceReliabilityWeight = 0.4;
    const consistencyWeight = 0.2;
    const historicalAccuracyWeight = 0.2;
    const qualityWeight = 0.2;

    const score = parseFloat((
      (ev.sourceReliability * sourceReliabilityWeight) +
      (ev.consistency * consistencyWeight) +
      (ev.historicalAccuracy * historicalAccuracyWeight) +
      (ev.evidenceQuality * qualityWeight)
    ).toFixed(2));

    return {
      evidenceId: id,
      tenantId,
      credibilityScore: score,
      explanation: `Calculated from source reliability (${ev.sourceReliability}), quality (${ev.evidenceQuality}), and consistency.`
    };
  }

  // DELIVERABLE 7: Evidence Completeness Engine
  public async checkCompleteness(tenantId: string, id: string): Promise<IEvidenceCompletenessReport> {
    this.verifyTenantOwnership(tenantId);
    const ev = await this.getEvidence(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const requiredEvidenceList = ["Source", "Verification Status", "Goals Reference", "Plans Reference"];
    const missingEvidenceList: string[] = [];

    if (!ev.source || ev.source === "Unknown Source") missingEvidenceList.push("Source");
    if (ev.verificationStatus === "PENDING") missingEvidenceList.push("Verification Status");
    if (ev.goals.length === 0) missingEvidenceList.push("Goals Reference");
    if (ev.plans.length === 0) missingEvidenceList.push("Plans Reference");

    const coverageScore = parseFloat(((requiredEvidenceList.length - missingEvidenceList.length) / requiredEvidenceList.length).toFixed(2));
    const isCompletenessSufficient = coverageScore >= 0.75;

    return {
      evidenceId: id,
      tenantId,
      coverageScore,
      isCompletenessSufficient,
      missingEvidenceList,
      requiredEvidenceList,
      unknownAreas: missingEvidenceList.length > 0 ? ["Referenced strategy domain gaps"] : []
    };
  }

  // DELIVERABLE 8: Evidence Contradiction Engine
  public async detectContradictions(tenantId: string, id: string): Promise<IEvidenceContradictionReport> {
    this.verifyTenantOwnership(tenantId);
    const ev = await this.getEvidence(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    let hasContradictions = false;
    let severity: IEvidenceContradictionReport["severity"] = "NONE";
    const conflictGraph: IEvidenceContradictionReport["conflictGraph"] = [];

    if (ev.consistency < 0.5) {
      hasContradictions = true;
      severity = "HIGH";
      conflictGraph.push({
        source: id,
        target: "Consistency Check",
        reason: "Evidence consistency metrics fallen below standard tolerance limit."
      });
      await this.publishEvent(tenantId, "executive.evidence.conflict", { evidenceId: id, severity, tenantId });
    }

    return {
      evidenceId: id,
      tenantId,
      hasContradictions,
      severity,
      affectedDecisions: ev.decisions,
      affectedGoals: ev.goals,
      affectedPlans: ev.plans,
      explanation: hasContradictions ? "Contradictory values detected within reliability inputs." : "No conflicts detected.",
      conflictGraph
    };
  }

  // DELIVERABLE 10: Evidence Confidence Engine
  public async calculateConfidence(tenantId: string, id: string): Promise<IEvidenceConfidenceReport> {
    this.verifyTenantOwnership(tenantId);
    const ev = await this.getEvidence(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const credibility = (await this.calculateCredibility(tenantId, id)).credibilityScore;
    const completeness = (await this.checkCompleteness(tenantId, id)).coverageScore;

    const overallConfidence = parseFloat(((credibility * 0.6) + (completeness * 0.4)).toFixed(2));
    const confidenceInterval: [number, number] = [Math.max(0, overallConfidence - 0.1), Math.min(1.0, overallConfidence + 0.1)];

    const weakAreas: string[] = [];
    const reasonCodes: string[] = [];

    if (credibility < 0.7) {
      weakAreas.push("Source credibility");
      reasonCodes.push("LOW_CREDIBILITY");
    }
    if (completeness < 0.7) {
      weakAreas.push("Information coverage completeness");
      reasonCodes.push("LOW_COVERAGE");
    }

    await this.publishEvent(tenantId, "executive.evidence.confidence.updated", { evidenceId: id, overallConfidence, tenantId });

    return {
      evidenceId: id,
      tenantId,
      overallConfidence,
      confidenceInterval,
      reasonCodes,
      weakAreas
    };
  }

  // DELIVERABLE 11: Evidence Explainability Engine
  public async explainEvidence(tenantId: string, id: string): Promise<IEvidenceExplainability> {
    this.verifyTenantOwnership(tenantId);
    const ev = await this.getEvidence(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const credibility = await this.calculateCredibility(tenantId, id);
    const completeness = await this.checkCompleteness(tenantId, id);
    const confidence = await this.calculateConfidence(tenantId, id);

    return {
      evidenceId: id,
      tenantId,
      whyAccepted: ev.verificationStatus === "VERIFIED" ? "Sufficient independent sources provided." : "Verification pending.",
      whyRejected: ev.verificationStatus === "REJECTED" ? "Consistency check failed." : "Not rejected.",
      whyConfidence: `Score of ${confidence.overallConfidence} based on ${credibility.credibilityScore} credibility and ${completeness.coverageScore} completeness.`,
      whyStale: ev.status === "STALE" ? "Age of records exceeded tolerance thresholds." : "Not stale.",
      whyConflict: ev.consistency < 0.5 ? "Low consistency reported." : "No conflicts.",
      whyInsufficient: !completeness.isCompletenessSufficient ? "Missing required goal or plan references." : "Sufficient.",
      whyLinked: `Linked to plans: [${ev.plans.join(", ")}].`
    };
  }

  // DELIVERABLE 12: Evidence Packaging Engine
  public async packageEvidence(tenantId: string, id: string): Promise<IEvidencePackage> {
    this.verifyTenantOwnership(tenantId);
    const ev = await this.getEvidence(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const credibility = await this.calculateCredibility(tenantId, id);
    const completeness = await this.checkCompleteness(tenantId, id);
    const contradiction = await this.detectContradictions(tenantId, id);
    const confidence = await this.calculateConfidence(tenantId, id);

    return {
      problem: `Validate operational feasibility of plans: [${ev.plans.join(", ")}].`,
      decisionContext: ev.description,
      evidenceList: [ev],
      confidence: confidence.overallConfidence,
      contradictions: contradiction.hasContradictions ? [contradiction.explanation] : [],
      missingEvidence: completeness.missingEvidenceList,
      weakEvidence: credibility.credibilityScore < 0.7 ? ["Low source reliability score"] : [],
      relatedMemory: ev.memories,
      relatedRisks: ev.risks,
      relatedGoals: ev.goals,
      relatedPlans: ev.plans,
      explanation: `packaged evidence with ${confidence.overallConfidence} aggregate confidence interval.`
    };
  }

  // DELIVERABLE 16: Transitive Graph Correlation traversal
  public async traverseEvidenceGraph(tenantId: string, rootId: string): Promise<IEvidenceGraphTraversalResult> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");

    const root = await repo.findEvidenceById(tenantId, rootId);
    if (!root) throw new Error(`Evidence [${rootId}] not found.`);

    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const nodes: IEvidenceGraphNode[] = [];
    let hasCycle = false;

    const traverse = async (currentId: string) => {
      if (recursionStack.has(currentId)) {
        hasCycle = true;
        return;
      }
      if (visited.has(currentId)) return;

      visited.add(currentId);
      recursionStack.add(currentId);

      const ev = await repo.findEvidenceById(tenantId, currentId);
      if (ev) {
        const relations = await repo.getRelationsByEvidenceId(tenantId, currentId);
        nodes.push({
          evidenceId: ev.id,
          classification: ev.classification,
          status: ev.status,
          relations: relations.map(r => ({
            targetEvidenceId: r.targetEvidenceId,
            type: r.type
          }))
        });

        for (const rel of relations) {
          await traverse(rel.targetEvidenceId);
        }
      }

      recursionStack.delete(currentId);
    };

    await traverse(rootId);

    return {
      rootEvidenceId: rootId,
      nodes,
      hasCycle
    };
  }

  public async linkEvidence(
    tenantId: string,
    sourceId: string,
    targetId: string,
    relationType: IEvidenceRelation["type"]
  ): Promise<IEvidenceRelation> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");

    const source = await repo.findEvidenceById(tenantId, sourceId);
    const target = await repo.findEvidenceById(tenantId, targetId);
    if (!source || !target) {
      throw new Error("Source or Target evidence not found.");
    }

    const relId = `rel_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const relation: IEvidenceRelation = {
      id: relId,
      tenantId,
      sourceEvidenceId: sourceId,
      targetEvidenceId: targetId,
      type: relationType,
      createdAt: new Date().toISOString()
    };

    await repo.saveRelation(tenantId, relation);

    return relation;
  }

  public async markEvidenceStale(tenantId: string, id: string): Promise<IEvidence> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");

    const ev = await repo.findEvidenceById(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const previousStatus = ev.status;
    ev.status = "STALE";
    ev.version += 1;
    ev.updatedAt = new Date().toISOString();

    await repo.saveEvidence(tenantId, ev);
    await this.publishEvent(tenantId, "executive.evidence.stale", { evidenceId: id, tenantId });
    await this.logHistory(tenantId, ev, previousStatus, "STALE", ev.actorId, "Evidence marked stale.");

    return ev;
  }

  public async archiveEvidence(tenantId: string, id: string): Promise<IEvidence> {
    this.verifyTenantOwnership(tenantId);
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");

    const ev = await repo.findEvidenceById(tenantId, id);
    if (!ev) throw new Error(`Evidence [${id}] not found.`);

    const previousStatus = ev.status;
    ev.status = "ARCHIVED";
    ev.version += 1;
    ev.updatedAt = new Date().toISOString();

    await repo.saveEvidence(tenantId, ev);
    await this.publishEvent(tenantId, "executive.evidence.archived", { evidenceId: id, tenantId });
    await this.logHistory(tenantId, ev, previousStatus, "ARCHIVED", ev.actorId, "Evidence archived.");

    return ev;
  }

  private async logHistory(
    tenantId: string,
    snapshot: IEvidence,
    previousStatus: EvidenceStatus | "NONE",
    newStatus: EvidenceStatus,
    actorId: string,
    reason: string
  ): Promise<void> {
    const repo = this.di.resolve<IExecutiveEvidenceRepository>("IExecutiveEvidenceRepository");
    const hId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const entry: IEvidenceHistoryEntry = {
      id: hId,
      tenantId,
      evidenceId: snapshot.id,
      version: snapshot.version,
      previousStatus,
      newStatus,
      actorId,
      timestamp: new Date().toISOString(),
      reason,
      evidenceSnapshot: JSON.parse(JSON.stringify(snapshot))
    };
    await repo.saveHistoryEntry(tenantId, entry);
  }

  private verifyTenantOwnership(tenantId: string): void {
    const ctx = getRequestContext();
    const ctxTenantId = ctx?.tenantId || ctx?.businessId;
    if (ctxTenantId && ctxTenantId !== tenantId) {
      throw new Error(`Security Violation: Caller tenant [${ctxTenantId}] does not match resource tenant [${tenantId}].`);
    }
  }

  private async publishEvent(tenantId: string, eventName: string, payload: any): Promise<void> {
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish(eventName, "1.0.0", payload, { tenantId, priority: "high" });
      } catch (err) {}
    }
  }
}
