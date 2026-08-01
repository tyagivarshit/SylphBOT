import prismaClient from "../../config/prisma";
import { DIContainer, container } from "../../runtime/kernel/diContainer";
import {
  IExecutiveDNA,
  IExecutiveIdentity,
  IExecutiveRepository,
  IDNARepository
} from "./interfaces";
import { IExecutiveMemory, IExecutiveMemoryRepository } from "./memory.service";
import {
  IMemoryArchitectureRecord,
  IExecutiveMemoryArchitectureRepository
} from "./memoryArchitecture.service";
import {
  IConsolidatedMemoryRecord,
  IExecutiveMemoryConsolidationRepository
} from "./memoryConsolidation.service";
import {
  IUnifiedContextPackage,
  IExecutiveMemoryRetrievalRepository
} from "./memoryRetrieval.service";
import {
  IMemoryAssociationNode,
  IMemoryAssociationEdge,
  IExecutiveMemoryAssociationRepository
} from "./memoryAssociation.service";
import {
  ISemanticConcept,
  ISemanticRelationship,
  ISemanticConflict,
  IExecutiveSemanticMemoryRepository
} from "./semanticMemory.service";
import {
  IOrganizationalKnowledge,
  IExecutiveOrganizationalKnowledgeRepository
} from "./organizationalKnowledge.service";
import {
  IMemoryOptimizationRecord,
  IMemoryOptimizationHistory,
  IExecutiveMemoryOptimizationRepository
} from "./memoryOptimization.service";
import {
  IMemoryGovernanceRecord,
  IMemoryAuditLog,
  IMemoryLineageNode,
  IExecutiveMemoryGovernanceRepository
} from "./memoryGovernance.service";
import {
  IMemoryCertificationRecord,
  ISelfValidationHistory,
  IMemoryScorecard,
  IExecutiveMemoryCertificationRepository
} from "./memoryCertification.service";
import {
  IExecutiveGoal,
  IExecutiveGoalRepository,
  IGoalAssumption,
  IGoalAssumptionRepository
} from "./goalIntelligence.service";
import {
  IExecutiveStrategy,
  IExecutiveStrategyRepository
} from "./strategyIntelligence.service";
import {
  IExecutivePlan,
  IExecutivePlanningRepository
} from "./planning.service";
import {
  IExecutiveTimeline,
  IExecutiveTimelineRepository
} from "./timeline.service";
import {
  IScenario,
  IExecutiveScenarioRepository
} from "./scenario.service";
import {
  IPlanningOptimization,
  IExecutivePlanningOptimizationRepository
} from "./planningOptimization.service";
import {
  IRisk,
  IContingencyPlan,
  IExecutiveRiskRepository
} from "./risk.service";
import {
  IResource,
  IResourceAllocation,
  IExecutiveResourceRepository
} from "./resource.service";
import {
  IPlanningPolicyValidation,
  IAuditRecord,
  IPlanningCertification,
  IExecutivePlanningGovernanceRepository
} from "./planningGovernance.service";
import {
  ISecurityViolation,
  ISandboxHardeningReport,
  IExecutivePlanningHardeningRepository
} from "./planningHardening.service";
import {
  IDecision,
  IDecisionRelation,
  IDecisionHistoryEntry,
  IExecutiveDecisionRepository
} from "./decisionIntelligence.service";
import {
  IEvidence,
  IEvidenceRelation,
  IEvidenceHistoryEntry,
  IExecutiveEvidenceRepository
} from "./evidenceValidation.service";
import {
  IExecutiveAlternative,
  IAlternativeHistoryEntry,
  IHypothesisPair,
  IExecutiveAlternativeRepository
} from "./alternativeGeneration.service";
import {
  IEvaluationPackage,
  IEvaluationHistoryEntry,
  IExecutiveDecisionEvaluationRepository
} from "./decisionEvaluation.service";
import {
  ISimulationPackage,
  ISimulationHistoryEntry,
  IExecutiveSimulationRepository
} from "./simulationProjection.service";
import {
  IExecutiveDecisionSelection,
  ISelectionHistoryEntry,
  IExecutiveDecisionSelectionRepository
} from "./decisionSelection.service";
import {
  IExecutiveDecisionAuthorization,
  IAuthorizationHistoryEntry,
  IExecutiveDecisionAuthorizationRepository
} from "./decisionAuthorization.service";
import {
  IExecutiveDecisionDispatch,
  IDispatchHistoryEntry,
  IExecutiveDecisionDispatchRepository
} from "./decisionDispatch.service";
import {
  IExecutiveDecisionMonitoring,
  IMonitoringHistoryEntry,
  IExecutiveDecisionMonitoringRepository
} from "./decisionMonitoring.service";
import {
  IExecutiveDecisionHardening,
  IHardeningHistoryEntry as IDecisionHardeningHistoryEntry,
  IExecutiveDecisionHardeningRepository
} from "./decisionHardening.service";
import {
  IExecutionContext,
  IExecutionHistoryEntry,
  IExecutionSnapshot,
  IExecutiveExecutionRepository
} from "./execution.service";
import {
  IExecutionHardeningRecord,
  IHardeningHistoryEntry as IExecutionHardeningHistoryEntry,
  IExecutiveExecutionHardeningRepository
} from "./executionHardening.service";
import {
  IExecutionGraph,
  IGraphHistoryEntry,
  IExecutiveExecutionGraphRepository
} from "./executionGraph.service";
import {
  IConnectorConfig,
  IExecutiveExecutionAdapterRepository
} from "./executionAdapter.service";
import {
  IDriverConfig,
  IDriverExecutionLog,
  IExecutiveExecutionDriverRepository
} from "./executionDriver.service";
import {
  IWorkflowConfig,
  IWorkflowState,
  IExecutiveWorkflowRepository
} from "./workflowOrchestrator.service";
import {
  IAdaptiveExecutionState,
  IExecutiveAdaptiveExecutionRepository
} from "./adaptiveExecution.service";
import {
  ISupervisorAuditState,
  IExecutiveSupervisorRepository
} from "./supervisor.service";
import {
  IOperationsState,
  IExecutiveOperationsSupervisorRepository
} from "./operationsSupervisor.service";
import {
  IScheduleState,
  IExecutiveSchedulerRepository
} from "./scheduler.service";
import {
  ILearningState,
  IExecutiveExecutionLearningRepository
} from "./learning.service";
import {
  ICertificationState,
  IExecutiveExecutionCertificationRepository
} from "./executionCertification.service";

import { AsyncLocalStorage } from "async_hooks";
import { getRequestContext } from "../../observability/requestContext";
export const prismaTransactionStorage = new AsyncLocalStorage<any>();

// Helper to verify tenant isolation
function verifyTenant(callerTenantId: string, resourceTenantId: string): void {
  if (callerTenantId !== resourceTenantId) {
    throw new Error(`Security Violation: Caller tenant [${callerTenantId}] does not match resource tenant [${resourceTenantId}].`);
  }
  const ctx = getRequestContext();
  const ctxTenantId = ctx?.tenantId || ctx?.businessId;
  if (ctxTenantId && ctxTenantId !== callerTenantId) {
    throw new Error(`Security Violation: Context tenant [${ctxTenantId}] does not match resource tenant [${callerTenantId}].`);
  }
}

// Base class supporting shared transaction context resolution from DI container scope
class BasePrismaRepository {
  constructor(protected di: DIContainer = container) {}

  protected get db() {
    const tx = prismaTransactionStorage.getStore();
    if (tx) {
      return tx;
    }
    if (this.di.has("PrismaTransactionClient")) {
      return this.di.resolve<any>("PrismaTransactionClient");
    }
    return prismaClient;
  }
}

export class PrismaDNARepository extends BasePrismaRepository implements IDNARepository {
  public async getDNA(role: string): Promise<IExecutiveDNA | null> {
    const record = await this.db.executiveDNA.findFirst({
      where: { id: role, isDeleted: false }
    });
    if (!record) return null;
    return record as any as IExecutiveDNA;
  }

  public async saveDNA(dna: IExecutiveDNA): Promise<void> {
    await this.db.executiveDNA.upsert({
      where: { id: dna.role },
      update: {
        version: dna.version,
        mission: dna.mission as any,
        responsibilities: dna.responsibilities as any,
        authorities: dna.authorities as any,
        boundaries: dna.boundaries as any,
        kpiOwnership: dna.kpiOwnership as any,
        decisionScope: dna.decisionScope as any,
        communicationProfile: dna.communicationProfile as any,
        delegationProfile: dna.delegationProfile as any,
        escalationProfile: dna.escalationProfile as any,
        successCriteria: dna.successCriteria as any,
        failureCriteria: dna.failureCriteria as any,
        personalityModel: dna.personalityModel as any,
        capabilityProfile: dna.capabilityProfile as any,
        decisionAuthorityMatrix: dna.decisionAuthorityMatrix as any,
        businessOutcomes: dna.businessOutcomes as any,
        goalAlignment: dna.goalAlignment as any,
        evolutionMetadata: dna.evolutionMetadata as any,
        updatedAt: new Date(),
      },
      create: {
        id: dna.role,
        role: dna.role,
        version: dna.version,
        mission: dna.mission as any,
        responsibilities: dna.responsibilities as any,
        authorities: dna.authorities as any,
        boundaries: dna.boundaries as any,
        kpiOwnership: dna.kpiOwnership as any,
        decisionScope: dna.decisionScope as any,
        communicationProfile: dna.communicationProfile as any,
        delegationProfile: dna.delegationProfile as any,
        escalationProfile: dna.escalationProfile as any,
        successCriteria: dna.successCriteria as any,
        failureCriteria: dna.failureCriteria as any,
        personalityModel: dna.personalityModel as any,
        capabilityProfile: dna.capabilityProfile as any,
        decisionAuthorityMatrix: dna.decisionAuthorityMatrix as any,
        businessOutcomes: dna.businessOutcomes as any,
        goalAlignment: dna.goalAlignment as any,
        evolutionMetadata: dna.evolutionMetadata as any,
      }
    });
  }

  public async listAllDNA(): Promise<IExecutiveDNA[]> {
    const records = await this.db.executiveDNA.findMany({
      where: { isDeleted: false }
    });
    return records as any as IExecutiveDNA[];
  }
}

// 1. Executive Repository
export class PrismaExecutiveRepository extends BasePrismaRepository implements IExecutiveRepository {
  public getDNASync(role: string): IExecutiveDNA | null {
    return null;
  }

  public saveDNASync(dna: IExecutiveDNA): void {
    // No-op
  }

  public async getDNA(role: string): Promise<IExecutiveDNA | null> {
    const record = await this.db.executiveDNA.findFirst({
      where: { id: role, isDeleted: false }
    });
    if (!record) return null;
    return record as any as IExecutiveDNA;
  }

  public async saveDNA(dna: IExecutiveDNA): Promise<void> {
    await this.db.executiveDNA.upsert({
      where: { id: dna.role },
      update: {
        version: dna.version,
        mission: dna.mission as any,
        responsibilities: dna.responsibilities as any,
        authorities: dna.authorities as any,
        boundaries: dna.boundaries as any,
        kpiOwnership: dna.kpiOwnership as any,
        decisionScope: dna.decisionScope as any,
        communicationProfile: dna.communicationProfile as any,
        delegationProfile: dna.delegationProfile as any,
        escalationProfile: dna.escalationProfile as any,
        successCriteria: dna.successCriteria as any,
        failureCriteria: dna.failureCriteria as any,
        personalityModel: dna.personalityModel as any,
        capabilityProfile: dna.capabilityProfile as any,
        decisionAuthorityMatrix: dna.decisionAuthorityMatrix as any,
        businessOutcomes: dna.businessOutcomes as any,
        goalAlignment: dna.goalAlignment as any,
        evolutionMetadata: dna.evolutionMetadata as any,
        isDeleted: false
      },
      create: {
        id: dna.role,
        role: dna.role,
        version: dna.version,
        mission: dna.mission as any,
        responsibilities: dna.responsibilities as any,
        authorities: dna.authorities as any,
        boundaries: dna.boundaries as any,
        kpiOwnership: dna.kpiOwnership as any,
        decisionScope: dna.decisionScope as any,
        communicationProfile: dna.communicationProfile as any,
        delegationProfile: dna.delegationProfile as any,
        escalationProfile: dna.escalationProfile as any,
        successCriteria: dna.successCriteria as any,
        failureCriteria: dna.failureCriteria as any,
        personalityModel: dna.personalityModel as any,
        capabilityProfile: dna.capabilityProfile as any,
        decisionAuthorityMatrix: dna.decisionAuthorityMatrix as any,
        businessOutcomes: dna.businessOutcomes as any,
        goalAlignment: dna.goalAlignment as any,
        evolutionMetadata: dna.evolutionMetadata as any,
        isDeleted: false
      }
    });
  }

  public async getExecutive(tenantId: string, id: string): Promise<IExecutiveIdentity | null> {
    const record = await this.db.executiveIdentity.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record as any as IExecutiveIdentity;
  }

  public async saveExecutive(executive: IExecutiveIdentity, expectedVersion?: number): Promise<IExecutiveIdentity> {
    const existing = await this.db.executiveIdentity.findFirst({
      where: { id: executive.id, isDeleted: false }
    });

    let currentVersion = 0;
    if (existing) {
      currentVersion = existing.version || 0;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        throw new Error(`Optimistic concurrency violation: version mismatch. Expected [${expectedVersion}] but got [${currentVersion}].`);
      }
      executive.version = currentVersion + 1;
    } else {
      executive.version = 1;
    }

    executive.updatedAt = new Date();

    const data = {
      tenantId: executive.tenantId,
      role: executive.role,
      name: executive.name,
      status: executive.status,
      dna: executive.dna as any,
      metadata: executive.metadata as any,
      missionState: executive.missionState as any,
      businessOutcomes: executive.businessOutcomes as any,
      healthSignals: executive.healthSignals as any,
      health: executive.health as any,
      version: executive.version,
      goalAlignment: executive.goalAlignment as any,
      evolutionMetadata: executive.evolutionMetadata as any,
      diagnostics: executive.diagnostics as any,
      isDeleted: false
    };

    await this.db.executiveIdentity.upsert({
      where: { id: executive.id },
      update: data,
      create: {
        id: executive.id,
        ...data
      }
    });

    return { ...executive };
  }

  public async listExecutives(tenantId: string): Promise<IExecutiveIdentity[]> {
    const records = await this.db.executiveIdentity.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records as any as IExecutiveIdentity[];
  }

  public async deleteExecutive(tenantId: string, id: string): Promise<void> {
    const record = await this.db.executiveIdentity.findFirst({
      where: { id }
    });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.executiveIdentity.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async clear(): Promise<void> {
    await this.db.executiveIdentity.deleteMany({});
    await this.db.executiveDNA.deleteMany({});
  }
}

// 2. Executive Memory Repository
export class PrismaExecutiveMemoryRepository extends BasePrismaRepository implements IExecutiveMemoryRepository {
  private memCache = new Map<string, IExecutiveMemory>();

  public get db() {
    return this.memCache;
  }

  private get client() {
    return super.db;
  }

  public async save(tenantId: string, memory: IExecutiveMemory): Promise<void> {
    verifyTenant(tenantId, memory.tenantId);
    this.memCache.set(memory.id, JSON.parse(JSON.stringify(memory)));
    await this.client.executiveMemory.upsert({
      where: { id: memory.id },
      update: {
        executiveId: memory.executiveId,
        category: memory.category,
        key: memory.key,
        value: memory.value as any,
        lifecycleState: memory.lifecycleState,
        metadata: memory.metadata as any,
        importance: memory.importance as any,
        freshness: memory.freshness as any,
        explainability: memory.explainability as any,
        isDeleted: false
      },
      create: {
        id: memory.id,
        tenantId: memory.tenantId,
        executiveId: memory.executiveId,
        category: memory.category,
        key: memory.key,
        value: memory.value as any,
        lifecycleState: memory.lifecycleState,
        metadata: memory.metadata as any,
        importance: memory.importance as any,
        freshness: memory.freshness as any,
        explainability: memory.explainability as any,
        isDeleted: false
      }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveMemory | null> {
    const record = await this.client.executiveMemory.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    const memory = record as any as IExecutiveMemory;
    this.memCache.set(memory.id, JSON.parse(JSON.stringify(memory)));
    return memory;
  }

  public async findByKey(tenantId: string, executiveId: string, key: string): Promise<IExecutiveMemory[]> {
    const records = await this.client.executiveMemory.findMany({
      where: { tenantId, executiveId, key, isDeleted: false }
    });
    const memories = records as any as IExecutiveMemory[];
    for (const m of memories) {
      this.memCache.set(m.id, JSON.parse(JSON.stringify(m)));
    }
    return memories;
  }

  public async findByCategory(tenantId: string, executiveId: string, category: string): Promise<IExecutiveMemory[]> {
    const records = await this.client.executiveMemory.findMany({
      where: { tenantId, executiveId, category, isDeleted: false }
    });
    const memories = records as any as IExecutiveMemory[];
    for (const m of memories) {
      this.memCache.set(m.id, JSON.parse(JSON.stringify(m)));
    }
    return memories;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.client.executiveMemory.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      this.memCache.delete(id);
      await this.client.executiveMemory.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }
}

// 3. Goal Repository
export class PrismaExecutiveGoalRepository extends BasePrismaRepository implements IExecutiveGoalRepository {
  public async save(tenantId: string, goal: IExecutiveGoal): Promise<void> {
    verifyTenant(tenantId, goal.tenantId);
    await this.db.goal.upsert({
      where: { id: goal.id },
      update: {
        executiveId: goal.executiveId || "SYSTEM",
        parentId: goal.parentId,
        title: goal.title,
        description: goal.description,
        ownerRole: goal.ownerRole,
        requestedBy: goal.requestedBy,
        missionId: goal.missionId,
        status: goal.status,
        version: goal.version || 1,
        history: goal.history as any,
        priorityMetrics: goal.priorityMetrics as any,
        priorityScore: goal.priorityScore || 0,
        kpis: goal.kpis as any,
        constraints: goal.constraints as any,
        relations: goal.relations as any,
        associatedMemories: goal.associatedMemories || [],
        evidenceRefs: goal.evidenceRefs || [],
        whyExistsReason: goal.whyExistsReason || "",
        health: goal.health as any,
        tradeoffProfile: goal.tradeoffProfile as any,
        successProbability: goal.successProbability as any,
        isDeleted: false
      },
      create: {
        id: goal.id,
        tenantId: goal.tenantId,
        executiveId: goal.executiveId || "SYSTEM",
        parentId: goal.parentId,
        title: goal.title,
        description: goal.description,
        ownerRole: goal.ownerRole,
        requestedBy: goal.requestedBy,
        missionId: goal.missionId,
        status: goal.status,
        version: goal.version || 1,
        history: goal.history as any,
        priorityMetrics: goal.priorityMetrics as any,
        priorityScore: goal.priorityScore || 0,
        kpis: goal.kpis as any,
        constraints: goal.constraints as any,
        relations: goal.relations as any,
        associatedMemories: goal.associatedMemories || [],
        evidenceRefs: goal.evidenceRefs || [],
        whyExistsReason: goal.whyExistsReason || "",
        health: goal.health as any,
        tradeoffProfile: goal.tradeoffProfile as any,
        successProbability: goal.successProbability as any,
        isDeleted: false
      }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveGoal | null> {
    const record = await this.db.goal.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record as any as IExecutiveGoal;
  }

  public async getAllGoals(tenantId: string): Promise<IExecutiveGoal[]> {
    const records = await this.db.goal.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records as any as IExecutiveGoal[];
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.db.goal.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.goal.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }
}

// 4. Goal Assumption Repository
export class PrismaGoalAssumptionRepository extends BasePrismaRepository implements IGoalAssumptionRepository {
  public async save(tenantId: string, assumption: IGoalAssumption): Promise<void> {
    verifyTenant(tenantId, assumption.tenantId);
    await this.db.goalAssumption.upsert({
      where: { id: assumption.id },
      update: {
        goalIds: assumption.goalIds,
        description: assumption.description,
        confidence: assumption.confidence,
        evidence: assumption.evidence,
        owner: assumption.owner,
        status: assumption.status,
        dependencies: assumption.dependencies,
        impactIfBroken: assumption.impactIfBroken,
        isDeleted: false
      },
      create: {
        id: assumption.id,
        tenantId: assumption.tenantId,
        goalIds: assumption.goalIds,
        description: assumption.description,
        confidence: assumption.confidence,
        evidence: assumption.evidence,
        owner: assumption.owner,
        status: assumption.status,
        dependencies: assumption.dependencies,
        impactIfBroken: assumption.impactIfBroken,
        isDeleted: false
      }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IGoalAssumption | null> {
    const record = await this.db.goalAssumption.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record as any as IGoalAssumption;
  }

  public async getByGoalId(tenantId: string, goalId: string): Promise<IGoalAssumption[]> {
    const records = await this.db.goalAssumption.findMany({
      where: { tenantId, isDeleted: false }
    });
    return (records as any as IGoalAssumption[]).filter(x => x.goalIds.includes(goalId));
  }

  public async getAll(tenantId: string): Promise<IGoalAssumption[]> {
    const records = await this.db.goalAssumption.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records as any as IGoalAssumption[];
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.db.goalAssumption.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.goalAssumption.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }
}

// 5. Strategy Repository
export class PrismaExecutiveStrategyRepository extends BasePrismaRepository implements IExecutiveStrategyRepository {
  public async save(tenantId: string, strategy: IExecutiveStrategy): Promise<void> {
    verifyTenant(tenantId, strategy.tenantId);
    await this.db.strategy.upsert({
      where: { id: strategy.id },
      update: {
        executiveId: strategy.executiveId || "SYSTEM",
        goalId: strategy.goalId,
        title: strategy.title,
        description: strategy.description,
        status: strategy.status,
        confidence: strategy.health?.confidence !== undefined ? strategy.health.confidence : 1.0,
        actions: (strategy as any).actions || [],
        version: strategy.version || 1,
        history: strategy.history as any,
        constraints: strategy.constraints as any,
        health: strategy.health as any,
        relations: strategy.relations as any,
        whyGenerated: strategy.whyGenerated || "",
        supportingMemories: strategy.supportingMemories || [],
        perceptionSignals: strategy.perceptionSignals || [],
        cognitionHypotheses: strategy.cognitionHypotheses || [],
        associatedAssumptions: strategy.associatedAssumptions || [],
        associatedTradeoffs: strategy.associatedTradeoffs || [],
        whyExistsReason: strategy.whyExistsReason || "",
        explanation: strategy.explanation || "",
        isDeleted: false
      },
      create: {
        id: strategy.id,
        tenantId: strategy.tenantId,
        executiveId: strategy.executiveId || "SYSTEM",
        goalId: strategy.goalId,
        title: strategy.title,
        description: strategy.description,
        status: strategy.status,
        confidence: strategy.health?.confidence !== undefined ? strategy.health.confidence : 1.0,
        actions: (strategy as any).actions || [],
        version: strategy.version || 1,
        history: strategy.history as any,
        constraints: strategy.constraints as any,
        health: strategy.health as any,
        relations: strategy.relations as any,
        whyGenerated: strategy.whyGenerated || "",
        supportingMemories: strategy.supportingMemories || [],
        perceptionSignals: strategy.perceptionSignals || [],
        cognitionHypotheses: strategy.cognitionHypotheses || [],
        associatedAssumptions: strategy.associatedAssumptions || [],
        associatedTradeoffs: strategy.associatedTradeoffs || [],
        whyExistsReason: strategy.whyExistsReason || "",
        explanation: strategy.explanation || "",
        isDeleted: false
      }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveStrategy | null> {
    const record = await this.db.strategy.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record as any as IExecutiveStrategy;
  }

  public async getByGoalId(tenantId: string, goalId: string): Promise<IExecutiveStrategy[]> {
    const records = await this.db.strategy.findMany({
      where: { tenantId, goalId, isDeleted: false }
    });
    return records as any as IExecutiveStrategy[];
  }

  public async getAll(tenantId: string): Promise<IExecutiveStrategy[]> {
    const records = await this.db.strategy.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records as any as IExecutiveStrategy[];
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.db.strategy.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.strategy.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }
}

// 6. Plan Repository (maps to ExecutivePlan model)
export class PrismaExecutivePlanningRepository extends BasePrismaRepository implements IExecutivePlanningRepository {
  public async save(tenantId: string, plan: IExecutivePlan): Promise<void> {
    verifyTenant(tenantId, plan.tenantId);
    await this.db.executivePlan.upsert({
      where: { id: plan.id },
      update: {
        executiveId: plan.executiveId || "SYSTEM",
        goalId: plan.goalId || "SYSTEM",
        strategyId: plan.strategyId,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        phases: plan.phases as any,
        milestones: plan.milestones as any,
        version: plan.version || 1,
        isDeleted: false
      },
      create: {
        id: plan.id,
        tenantId: plan.tenantId,
        executiveId: plan.executiveId || "SYSTEM",
        goalId: plan.goalId || "SYSTEM",
        strategyId: plan.strategyId,
        title: plan.title,
        description: plan.description,
        status: plan.status,
        phases: plan.phases as any,
        milestones: plan.milestones as any,
        version: plan.version || 1,
        isDeleted: false
      }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IExecutivePlan | null> {
    const record = await this.db.executivePlan.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record as any as IExecutivePlan;
  }

  public async getByStrategyId(tenantId: string, strategyId: string): Promise<IExecutivePlan[]> {
    const records = await this.db.executivePlan.findMany({
      where: { tenantId, strategyId, isDeleted: false }
    });
    return records as any as IExecutivePlan[];
  }

  public async getAll(tenantId: string): Promise<IExecutivePlan[]> {
    const records = await this.db.executivePlan.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records as any as IExecutivePlan[];
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.db.executivePlan.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.executivePlan.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }
}

// 7. Decision Repository
export class PrismaExecutiveDecisionRepository extends BasePrismaRepository implements IExecutiveDecisionRepository {
  public async saveDecision(tenantId: string, decision: IDecision): Promise<void> {
    verifyTenant(tenantId, decision.tenantId);
    await this.db.decision.upsert({
      where: { id: decision.id },
      update: {
        executiveId: decision.actorId || "SYSTEM",
        goalId: decision.goals?.[0] || "SYSTEM",
        strategyId: decision.strategies?.[0] || "SYSTEM",
        planId: decision.plans?.[0] || "SYSTEM",
        title: decision.title,
        description: decision.description,
        status: decision.status,
        confidence: decision.metadata?.confidence || decision.metadata?.confidenceScore || 0,
        evidenceIds: decision.metadata?.evidenceExisted || [],
        version: decision.version || 1,
        metadata: {
          type: decision.type,
          actorId: decision.actorId,
          ownership: decision.ownership,
          assumptions: decision.assumptions,
          trace: decision.trace,
          goals: decision.goals,
          strategies: decision.strategies,
          plans: decision.plans,
          timelines: decision.timelines,
          scenarios: decision.scenarios,
          risks: decision.risks,
          resources: decision.resources,
          memories: decision.memories,
          ...decision.metadata
        } as any,
        isDeleted: false
      },
      create: {
        id: decision.id,
        tenantId: decision.tenantId,
        executiveId: decision.actorId || "SYSTEM",
        goalId: decision.goals?.[0] || "SYSTEM",
        strategyId: decision.strategies?.[0] || "SYSTEM",
        planId: decision.plans?.[0] || "SYSTEM",
        title: decision.title,
        description: decision.description,
        status: decision.status,
        confidence: decision.metadata?.confidence || decision.metadata?.confidenceScore || 0,
        evidenceIds: decision.metadata?.evidenceExisted || [],
        version: decision.version || 1,
        metadata: {
          type: decision.type,
          actorId: decision.actorId,
          ownership: decision.ownership,
          assumptions: decision.assumptions,
          trace: decision.trace,
          goals: decision.goals,
          strategies: decision.strategies,
          plans: decision.plans,
          timelines: decision.timelines,
          scenarios: decision.scenarios,
          risks: decision.risks,
          resources: decision.resources,
          memories: decision.memories,
          ...decision.metadata
        } as any,
        isDeleted: false
      }
    });
  }

  public async findDecisionById(tenantId: string, id: string): Promise<IDecision | null> {
    const record = await this.db.decision.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return {
      id: record.id,
      tenantId: record.tenantId,
      title: record.title,
      description: record.description,
      status: record.status as any,
      version: record.version || 1,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      metadata: record.metadata as any,
      ...(record.metadata as any || {})
    } as any as IDecision;
  }

  public async findDecisionVersion(tenantId: string, id: string, version: number): Promise<IDecision | null> {
    const history = await this.getHistoryByDecisionId(tenantId, id);
    const entry = history.find(h => h.version === version);
    if (!entry) return null;
    return entry.decisionSnapshot;
  }

  public async deleteDecision(tenantId: string, id: string): Promise<void> {
    const record = await this.db.decision.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.decision.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async getDecisions(tenantId: string): Promise<IDecision[]> {
    const records = await this.db.decision.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(r => ({
      id: r.id,
      tenantId: r.tenantId,
      title: r.title,
      description: r.description,
      status: r.status as any,
      version: r.version || 1,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      metadata: r.metadata as any,
      ...(r.metadata as any || {})
    } as any as IDecision));
  }

  public async saveRelation(tenantId: string, relation: IDecisionRelation): Promise<void> {
    verifyTenant(tenantId, relation.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `rel:${relation.id}` },
      update: { value: relation as any },
      create: { id: `rel:${relation.id}`, value: relation as any }
    });
  }

  public async getRelationsByDecisionId(tenantId: string, decisionId: string): Promise<IDecisionRelation[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "rel:" } }
    });
    const list: IDecisionRelation[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.sourceDecisionId === decisionId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHistoryEntry(tenantId: string, entry: IDecisionHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `d_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `d_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistoryByDecisionId(tenantId: string, decisionId: string): Promise<IDecisionHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "d_hist:" } }
    });
    const list: IDecisionHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, decisionId: string, snapshot: IDecision): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `d_snap:${decisionId}:${snapshot.version || 1}` },
      update: { value: snapshot as any },
      create: { id: `d_snap:${decisionId}:${snapshot.version || 1}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, decisionId: string): Promise<IDecision | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: `d_snap:${decisionId}:` } }
    });
    if (records.length === 0) return null;
    const items = records.map(x => x.value as any as IDecision);
    items.sort((a, b) => (b.version || 0) - (a.version || 0));
    const val = items[0];
    verifyTenant(tenantId, val.tenantId);
    return val;
  }
}

// 8. Execution Repository
export class PrismaExecutiveExecutionRepository extends BasePrismaRepository implements IExecutiveExecutionRepository {
  public async create(tenantId: string, execution: IExecutionContext): Promise<IExecutionContext> {
    verifyTenant(tenantId, execution.tenantId);
    await this.db.execution.create({
      data: {
        id: execution.id,
        tenantId: execution.tenantId,
        decisionId: execution.decisionId,
        executiveId: execution.metadata?.executiveId || execution.owner || "SYSTEM",
        planId: execution.metadata?.planId || "SYSTEM",
        startTime: execution.startedAt || new Date().toISOString(),
        status: execution.status,
        version: execution.version || 1,
        metadata: {
          authorizationId: execution.authorizationId,
          dispatchId: execution.dispatchId,
          priority: execution.priority,
          executionType: execution.executionType,
          owner: execution.owner,
          approver: execution.approver,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          ...execution.metadata
        } as any,
        isDeleted: false
      }
    });
    return execution;
  }

  public async update(tenantId: string, execution: IExecutionContext): Promise<IExecutionContext> {
    verifyTenant(tenantId, execution.tenantId);
    const data: any = {
      status: execution.status,
      version: execution.version || 1,
      metadata: {
        authorizationId: execution.authorizationId,
        dispatchId: execution.dispatchId,
        priority: execution.priority,
        executionType: execution.executionType,
        owner: execution.owner,
        approver: execution.approver,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        ...execution.metadata
      } as any
    };
    if (execution.startedAt) data.startTime = execution.startedAt;
    if (execution.completedAt) data.endTime = execution.completedAt;

    await this.db.execution.update({
      where: { id: execution.id },
      data
    });
    return execution;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.db.execution.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.execution.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async findById(tenantId: string, id: string): Promise<IExecutionContext | null> {
    const record = await this.db.execution.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    const meta = record.metadata as any || {};
    return {
      id: record.id,
      tenantId: record.tenantId,
      decisionId: record.decisionId,
      status: record.status as any,
      version: record.version || 1,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      startedAt: record.startTime,
      completedAt: record.endTime || undefined,
      ...meta
    } as any as IExecutionContext;
  }

  public async search(tenantId: string, query: Partial<IExecutionContext>): Promise<IExecutionContext[]> {
    const where: any = { tenantId, isDeleted: false };
    if (query.decisionId) where.decisionId = query.decisionId;
    if (query.status) where.status = query.status;

    const records = await this.db.execution.findMany({ where });
    return records.map(r => {
      const meta = r.metadata as any || {};
      return {
        id: r.id,
        tenantId: r.tenantId,
        decisionId: r.decisionId,
        status: r.status as any,
        version: r.version || 1,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        startedAt: r.startTime,
        completedAt: r.endTime || undefined,
        ...meta
      } as any as IExecutionContext;
    });
  }

  public async saveHistory(tenantId: string, entry: IExecutionHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `e_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `e_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, executionId: string): Promise<IExecutionHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "e_hist:" } }
    });
    const list: IExecutionHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executionId === executionId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, snapshot: IExecutionSnapshot): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `e_snap:${snapshot.id}` },
      update: { value: snapshot as any },
      create: { id: `e_snap:${snapshot.id}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionSnapshot | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `e_snap:${snapshotId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async listSnapshots(tenantId: string, executionId: string): Promise<IExecutionSnapshot[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "e_snap:" } }
    });
    const list: IExecutionSnapshot[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executionId === executionId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 9. Memory Architecture Repository
export class PrismaExecutiveMemoryArchitectureRepository extends BasePrismaRepository implements IExecutiveMemoryArchitectureRepository {
  public async saveRecord(tenantId: string, record: IMemoryArchitectureRecord): Promise<void> {
    verifyTenant(tenantId, record.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `arch:${record.memoryId}` },
      update: { value: record as any },
      create: { id: `arch:${record.memoryId}`, value: record as any }
    });
  }

  public async findRecordById(tenantId: string, memoryId: string): Promise<IMemoryArchitectureRecord | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `arch:${memoryId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findRecordsByOwner(tenantId: string, ownerId: string): Promise<IMemoryArchitectureRecord[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "arch:" } }
    });
    const list: IMemoryArchitectureRecord[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.ownership?.ownerId === ownerId) {
        list.push(val);
      }
    }
    return list;
  }

  public async deleteRecord(tenantId: string, memoryId: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({
      where: { id: `arch:${memoryId}` }
    });
  }
}

// 10. Memory Consolidation Repository
export class PrismaExecutiveMemoryConsolidationRepository extends BasePrismaRepository implements IExecutiveMemoryConsolidationRepository {
  public async saveConsolidated(tenantId: string, record: IConsolidatedMemoryRecord): Promise<void> {
    verifyTenant(tenantId, record.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `con:${record.id}` },
      update: { value: record as any },
      create: { id: `con:${record.id}`, value: record as any }
    });
  }

  public async findConsolidatedById(tenantId: string, id: string): Promise<IConsolidatedMemoryRecord | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `con:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findConsolidatedByKey(tenantId: string, executiveId: string, key: string): Promise<IConsolidatedMemoryRecord[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "con:" } }
    });
    const list: IConsolidatedMemoryRecord[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executiveId === executiveId && val.key === key) {
        list.push(val);
      }
    }
    return list;
  }
}

// 11. Memory Retrieval Repository
export class PrismaExecutiveMemoryRetrievalRepository extends BasePrismaRepository implements IExecutiveMemoryRetrievalRepository {
  public async saveContextPackage(tenantId: string, pkg: IUnifiedContextPackage): Promise<void> {
    verifyTenant(tenantId, pkg.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `ret:${pkg.tenantId}:${pkg.executiveId}` },
      update: { value: pkg as any },
      create: { id: `ret:${pkg.tenantId}:${pkg.executiveId}`, value: pkg as any }
    });
  }

  public async findContextPackage(tenantId: string, executiveId: string): Promise<IUnifiedContextPackage | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `ret:${tenantId}:${executiveId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }
}

// 12. Memory Association Repository
export class PrismaExecutiveMemoryAssociationRepository extends BasePrismaRepository implements IExecutiveMemoryAssociationRepository {
  public async saveNode(tenantId: string, node: IMemoryAssociationNode): Promise<void> {
    verifyTenant(tenantId, node.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `node:${node.id}` },
      update: { value: node as any },
      create: { id: `node:${node.id}`, value: node as any }
    });
  }

  public async saveEdge(tenantId: string, edge: IMemoryAssociationEdge): Promise<void> {
    await this.db.memoryAssociation.upsert({
      where: { id: edge.id },
      update: {
        tenantId,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        relationType: edge.relationshipType,
        weight: edge.weight,
        metadata: edge as any,
        isDeleted: false
      },
      create: {
        id: edge.id,
        tenantId,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        relationType: edge.relationshipType,
        weight: edge.weight,
        metadata: edge as any,
        isDeleted: false
      }
    });
  }

  public async findNode(tenantId: string, id: string): Promise<IMemoryAssociationNode | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `node:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findEdgesFrom(tenantId: string, sourceId: string): Promise<IMemoryAssociationEdge[]> {
    const records = await this.db.memoryAssociation.findMany({
      where: { tenantId, sourceId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IMemoryAssociationEdge);
  }

  public async findEdgesTo(tenantId: string, targetId: string): Promise<IMemoryAssociationEdge[]> {
    const records = await this.db.memoryAssociation.findMany({
      where: { tenantId, targetId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IMemoryAssociationEdge);
  }

  public async deleteNode(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `node:${id}` } });
  }

  public async deleteEdge(tenantId: string, id: string): Promise<void> {
    const record = await this.db.memoryAssociation.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.memoryAssociation.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async getAllNodes(tenantId: string): Promise<IMemoryAssociationNode[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "node:" } }
    });
    const list: IMemoryAssociationNode[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async getAllEdges(tenantId: string): Promise<IMemoryAssociationEdge[]> {
    const records = await this.db.memoryAssociation.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IMemoryAssociationEdge);
  }
}

// 13. Semantic Memory Repository
export class PrismaExecutiveSemanticMemoryRepository extends BasePrismaRepository implements IExecutiveSemanticMemoryRepository {
  public async saveConcept(tenantId: string, concept: ISemanticConcept): Promise<void> {
    verifyTenant(tenantId, concept.tenantId);
    await this.db.semanticMemory.upsert({
      where: { id: concept.id },
      update: {
        tenantId: concept.tenantId,
        executiveId: concept.executiveId,
        concept: concept.name,
        description: (concept as any).description || "",
        importance: (concept as any).importance || 0.0,
        associations: (concept as any).associations as any || null,
        metadata: concept as any,
        isDeleted: false
      },
      create: {
        id: concept.id,
        tenantId: concept.tenantId,
        executiveId: concept.executiveId,
        concept: concept.name,
        description: (concept as any).description || "",
        importance: (concept as any).importance || 0.0,
        associations: (concept as any).associations as any || null,
        metadata: concept as any,
        isDeleted: false
      }
    });
  }

  public async saveRelationship(tenantId: string, rel: ISemanticRelationship): Promise<void> {
    await this.db.systemKeyValueStore.upsert({
      where: { id: `sem_rel:${rel.id}` },
      update: { value: { ...rel, tenantId } as any },
      create: { id: `sem_rel:${rel.id}`, value: { ...rel, tenantId } as any }
    });
  }

  public async saveConflict(tenantId: string, conflict: ISemanticConflict): Promise<void> {
    verifyTenant(tenantId, conflict.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `conflict:${conflict.id}` },
      update: { value: conflict as any },
      create: { id: `conflict:${conflict.id}`, value: conflict as any }
    });
  }

  public async findConcept(tenantId: string, id: string): Promise<ISemanticConcept | null> {
    const record = await this.db.semanticMemory.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as ISemanticConcept;
  }

  public async findConceptByName(tenantId: string, name: string, domain?: string): Promise<ISemanticConcept | null> {
    const record = await this.db.semanticMemory.findFirst({
      where: { tenantId, concept: name, isDeleted: false }
    });
    if (!record) return null;
    return record.metadata as any as ISemanticConcept;
  }

  public async findRelationshipsFrom(tenantId: string, sourceId: string): Promise<ISemanticRelationship[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "sem_rel:" } }
    });
    const list: ISemanticRelationship[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.sourceConceptId === sourceId) {
        list.push(val);
      }
    }
    return list;
  }

  public async getAllConcepts(tenantId: string): Promise<ISemanticConcept[]> {
    const records = await this.db.semanticMemory.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(record => record.metadata as any as ISemanticConcept);
  }

  public async getAllRelationships(tenantId: string): Promise<ISemanticRelationship[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "sem_rel:" } }
    });
    const list: ISemanticRelationship[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async getAllConflicts(tenantId: string): Promise<ISemanticConflict[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "conflict:" } }
    });
    const list: ISemanticConflict[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 14. Organizational Knowledge Repository
export class PrismaExecutiveOrganizationalKnowledgeRepository extends BasePrismaRepository implements IExecutiveOrganizationalKnowledgeRepository {
  public async saveKnowledge(tenantId: string, obj: IOrganizationalKnowledge): Promise<void> {
    verifyTenant(tenantId, obj.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `org_know:${obj.id}` },
      update: { value: obj as any },
      create: { id: `org_know:${obj.id}`, value: obj as any }
    });
  }

  public async findKnowledge(tenantId: string, id: string): Promise<IOrganizationalKnowledge | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `org_know:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async getAllKnowledge(tenantId: string): Promise<IOrganizationalKnowledge[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "org_know:" } }
    });
    const list: IOrganizationalKnowledge[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async deleteKnowledge(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `org_know:${id}` } });
  }
}

// 15. Memory Optimization Repository
export class PrismaExecutiveMemoryOptimizationRepository extends BasePrismaRepository implements IExecutiveMemoryOptimizationRepository {
  public async saveRecord(tenantId: string, record: IMemoryOptimizationRecord): Promise<void> {
    verifyTenant(tenantId, record.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `opt_rec:${record.memoryId}` },
      update: { value: record as any },
      create: { id: `opt_rec:${record.memoryId}`, value: record as any }
    });
  }

  public async findRecord(tenantId: string, memoryId: string): Promise<IMemoryOptimizationRecord | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `opt_rec:${memoryId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async getAllRecords(tenantId: string): Promise<IMemoryOptimizationRecord[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "opt_rec:" } }
    });
    const list: IMemoryOptimizationRecord[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHistory(tenantId: string, item: IMemoryOptimizationHistory): Promise<void> {
    verifyTenant(tenantId, item.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `opt_hist:${item.id}` },
      update: { value: item as any },
      create: { id: `opt_hist:${item.id}`, value: item as any }
    });
  }

  public async getAllHistory(tenantId: string): Promise<IMemoryOptimizationHistory[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "opt_hist:" } }
    });
    const list: IMemoryOptimizationHistory[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 16. Memory Governance Repository
export class PrismaExecutiveMemoryGovernanceRepository extends BasePrismaRepository implements IExecutiveMemoryGovernanceRepository {
  public async saveRecord(tenantId: string, record: IMemoryGovernanceRecord): Promise<void> {
    verifyTenant(tenantId, record.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `gov_rec:${record.memoryId}` },
      update: { value: record as any },
      create: { id: `gov_rec:${record.memoryId}`, value: record as any }
    });
  }

  public async findRecord(tenantId: string, memoryId: string): Promise<IMemoryGovernanceRecord | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `gov_rec:${memoryId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async getAllRecords(tenantId: string): Promise<IMemoryGovernanceRecord[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "gov_rec:" } }
    });
    const list: IMemoryGovernanceRecord[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveAuditLog(tenantId: string, log: IMemoryAuditLog): Promise<void> {
    verifyTenant(tenantId, log.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `gov_audit:${log.id}` },
      update: { value: log as any },
      create: { id: `gov_audit:${log.id}`, value: log as any }
    });
  }

  public async getAllAuditLogs(tenantId: string): Promise<IMemoryAuditLog[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "gov_audit:" } }
    });
    const list: IMemoryAuditLog[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveLineage(tenantId: string, node: IMemoryLineageNode): Promise<void> {
    verifyTenant(tenantId, node.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `gov_lineage:${node.tenantId}:${node.memoryId}:${node.stage}` },
      update: { value: node as any },
      create: { id: `gov_lineage:${node.tenantId}:${node.memoryId}:${node.stage}`, value: node as any }
    });
  }

  public async getLineage(tenantId: string, memoryId: string): Promise<IMemoryLineageNode[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: `gov_lineage:${tenantId}:${memoryId}` } }
    });
    return records.map(x => x.value as any as IMemoryLineageNode);
  }
}

// 17. Memory Certification Repository
export class PrismaExecutiveMemoryCertificationRepository extends BasePrismaRepository implements IExecutiveMemoryCertificationRepository {
  public async saveCertification(tenantId: string, cert: IMemoryCertificationRecord): Promise<void> {
    verifyTenant(tenantId, cert.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `mem_cert:${cert.tenantId}` },
      update: { value: cert as any },
      create: { id: `mem_cert:${cert.tenantId}`, value: cert as any }
    });
  }

  public async getCertification(tenantId: string): Promise<IMemoryCertificationRecord | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `mem_cert:${tenantId}` }
    });
    if (!record) return null;
    return record.value as any as IMemoryCertificationRecord;
  }

  public async saveValidation(tenantId: string, item: ISelfValidationHistory): Promise<void> {
    verifyTenant(tenantId, item.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `mem_val:${item.id}` },
      update: { value: item as any },
      create: { id: `mem_val:${item.id}`, value: item as any }
    });
  }

  public async getValidationHistory(tenantId: string): Promise<ISelfValidationHistory[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "mem_val:" } }
    });
    const list: ISelfValidationHistory[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveScorecard(tenantId: string, scorecard: IMemoryScorecard): Promise<void> {
    verifyTenant(tenantId, scorecard.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `mem_score:${scorecard.tenantId}` },
      update: { value: scorecard as any },
      create: { id: `mem_score:${scorecard.tenantId}`, value: scorecard as any }
    });
  }

  public async getScorecard(tenantId: string): Promise<IMemoryScorecard | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `mem_score:${tenantId}` }
    });
    if (!record) return null;
    return record.value as any as IMemoryScorecard;
  }
}

// 18. Planning Governance Repository
export class PrismaExecutivePlanningGovernanceRepository extends BasePrismaRepository implements IExecutivePlanningGovernanceRepository {
  public async saveValidation(tenantId: string, validation: IPlanningPolicyValidation): Promise<void> {
    verifyTenant(tenantId, validation.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `pg_val:${validation.planId}` },
      update: { value: validation as any },
      create: { id: `pg_val:${validation.planId}`, value: validation as any }
    });
  }

  public async findValidationByPlanId(tenantId: string, planId: string): Promise<IPlanningPolicyValidation | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `pg_val:${planId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async saveAuditRecord(tenantId: string, record: IAuditRecord): Promise<void> {
    verifyTenant(tenantId, record.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `pg_audit:${record.id}` },
      update: { value: record as any },
      create: { id: `pg_audit:${record.id}`, value: record as any }
    });
  }

  public async getAuditRecordsByPlanId(tenantId: string, planId: string): Promise<IAuditRecord[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "pg_audit:" } }
    });
    const list: IAuditRecord[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.planId === planId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveCertification(tenantId: string, certification: IPlanningCertification): Promise<void> {
    verifyTenant(tenantId, certification.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `pg_cert:${certification.planId}` },
      update: { value: certification as any },
      create: { id: `pg_cert:${certification.planId}`, value: certification as any }
    });
  }

  public async findCertificationByPlanId(tenantId: string, planId: string): Promise<IPlanningCertification | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `pg_cert:${planId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }
}

// 19. Planning Hardening Repository
export class PrismaExecutivePlanningHardeningRepository extends BasePrismaRepository implements IExecutivePlanningHardeningRepository {
  public async saveViolation(tenantId: string, violation: ISecurityViolation): Promise<void> {
    verifyTenant(tenantId, violation.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `ph_violation:${violation.id}` },
      update: { value: violation as any },
      create: { id: `ph_violation:${violation.id}`, value: violation as any }
    });
  }

  public async getViolationsByPlanId(tenantId: string, planId: string): Promise<ISecurityViolation[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "ph_violation:" } }
    });
    const list: ISecurityViolation[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.planId === planId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHardeningReport(tenantId: string, report: ISandboxHardeningReport): Promise<void> {
    verifyTenant(tenantId, report.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `ph_report:${report.planId}` },
      update: { value: report as any },
      create: { id: `ph_report:${report.planId}`, value: report as any }
    });
  }

  public async getHardeningReportByPlanId(tenantId: string, planId: string): Promise<ISandboxHardeningReport | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `ph_report:${planId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }
}

// 20. Decision Hardening Repository
export class PrismaExecutiveDecisionHardeningRepository extends BasePrismaRepository implements IExecutiveDecisionHardeningRepository {
  public async saveHardening(tenantId: string, hardening: IExecutiveDecisionHardening): Promise<void> {
    verifyTenant(tenantId, hardening.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `dh:${hardening.id}` },
      update: { value: hardening as any },
      create: { id: `dh:${hardening.id}`, value: hardening as any }
    });
  }

  public async findHardeningById(tenantId: string, id: string): Promise<IExecutiveDecisionHardening | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `dh:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findHardeningByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionHardening | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "dh:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        return val;
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IDecisionHardeningHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `dh_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `dh_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, hardeningId: string): Promise<IDecisionHardeningHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "dh_hist:" } }
    });
    const list: IDecisionHardeningHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.hardeningId === hardeningId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, hardeningId: string, snapshot: IExecutiveDecisionHardening): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `dh_snap:${hardeningId}` },
      update: { value: snapshot as any },
      create: { id: `dh_snap:${hardeningId}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, hardeningId: string): Promise<IExecutiveDecisionHardening | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `dh_snap:${hardeningId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async deleteHardening(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `dh:${id}` } });
  }
}

// 21. Execution Hardening Repository
export class PrismaExecutiveExecutionHardeningRepository extends BasePrismaRepository implements IExecutiveExecutionHardeningRepository {
  public async saveHardeningRecord(tenantId: string, record: IExecutionHardeningRecord): Promise<void> {
    verifyTenant(tenantId, record.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `eh:${record.id}` },
      update: { value: record as any },
      create: { id: `eh:${record.id}`, value: record as any }
    });
  }

  public async findHardeningRecordById(tenantId: string, id: string): Promise<IExecutionHardeningRecord | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `eh:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findHardeningRecordByExecutionId(tenantId: string, executionId: string): Promise<IExecutionHardeningRecord | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "eh:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executionId === executionId) {
        return val;
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IExecutionHardeningHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `eh_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `eh_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, hardeningId: string): Promise<IExecutionHardeningHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "eh_hist:" } }
    });
    const list: IExecutionHardeningHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.hardeningId === hardeningId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, snapshot: IExecutionSnapshot): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `eh_snap:${snapshot.id}` },
      update: { value: snapshot as any },
      create: { id: `eh_snap:${snapshot.id}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, executionId: string, snapshotId: string): Promise<IExecutionSnapshot | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `eh_snap:${snapshotId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async listSnapshots(tenantId: string, executionId: string): Promise<IExecutionSnapshot[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "eh_snap:" } }
    });
    const list: IExecutionSnapshot[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executionId === executionId) {
        list.push(val);
      }
    }
    return list;
  }

  public async deleteHardeningRecord(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `eh:${id}` } });
  }
}

// 22. Execution Graph Repository
export class PrismaExecutiveExecutionGraphRepository extends BasePrismaRepository implements IExecutiveExecutionGraphRepository {
  public async saveGraph(tenantId: string, graph: IExecutionGraph): Promise<void> {
    verifyTenant(tenantId, graph.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `graph:${graph.id}` },
      update: { value: graph as any },
      create: { id: `graph:${graph.id}`, value: graph as any }
    });
  }

  public async findGraphById(tenantId: string, id: string): Promise<IExecutionGraph | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `graph:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findGraphByExecutionId(tenantId: string, executionId: string): Promise<IExecutionGraph | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "graph:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executionId === executionId) {
        return val;
      }
    }
    return null;
  }

  public async deleteGraph(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `graph:${id}` } });
  }

  public async saveHistory(tenantId: string, entry: IGraphHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `graph_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `graph_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, graphId: string): Promise<IGraphHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "graph_hist:" } }
    });
    const list: IGraphHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.graphId === graphId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 23. Execution Adapter Repository
export class PrismaExecutiveExecutionAdapterRepository extends BasePrismaRepository implements IExecutiveExecutionAdapterRepository {
  public async saveConnectorConfig(tenantId: string, config: IConnectorConfig): Promise<void> {
    verifyTenant(tenantId, config.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `conn:${config.id}` },
      update: { value: config as any },
      create: { id: `conn:${config.id}`, value: config as any }
    });
  }

  public async findConnectorConfigById(tenantId: string, id: string): Promise<IConnectorConfig | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `conn:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findConnectorConfigByName(tenantId: string, name: string): Promise<IConnectorConfig | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "conn:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.name === name) {
        return val;
      }
    }
    return null;
  }

  public async deleteConnectorConfig(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `conn:${id}` } });
  }

  public async listAllConfigs(tenantId: string): Promise<IConnectorConfig[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "conn:" } }
    });
    const list: IConnectorConfig[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 24. Execution Driver Repository
export class PrismaExecutiveExecutionDriverRepository extends BasePrismaRepository implements IExecutiveExecutionDriverRepository {
  public async saveDriverConfig(tenantId: string, config: IDriverConfig): Promise<void> {
    verifyTenant(tenantId, config.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `driver:${config.id}` },
      update: { value: config as any },
      create: { id: `driver:${config.id}`, value: config as any }
    });
  }

  public async findDriverConfigById(tenantId: string, id: string): Promise<IDriverConfig | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `driver:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findDriverConfigByType(tenantId: string, type: string): Promise<IDriverConfig | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "driver:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.type === type) {
        return val;
      }
    }
    return null;
  }

  public async deleteDriverConfig(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `driver:${id}` } });
  }

  public async saveExecutionLog(tenantId: string, log: IDriverExecutionLog): Promise<void> {
    verifyTenant(tenantId, log.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `driver_log:${log.id}` },
      update: { value: log as any },
      create: { id: `driver_log:${log.id}`, value: log as any }
    });
  }

  public async findExecutionLogsByExecutionId(tenantId: string, executionId: string): Promise<IDriverExecutionLog[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "driver_log:" } }
    });
    const list: IDriverExecutionLog[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.executionId === executionId) {
        list.push(val);
      }
    }
    return list;
  }

  public async findExecutionLogById(tenantId: string, id: string): Promise<IDriverExecutionLog | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `driver_log:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async saveDlqMessage(tenantId: string, message: any): Promise<void> {
    verifyTenant(tenantId, tenantId);
    const recordId = `dlq:${tenantId}:${message.id || Math.random().toString(36).substr(2, 9)}`;
    const valWithTenant = { ...message, tenantId };
    await this.db.systemKeyValueStore.upsert({
      where: { id: recordId },
      update: { value: valWithTenant as any },
      create: { id: recordId, value: valWithTenant as any }
    });
  }

  public async getDlqMessages(tenantId: string): Promise<any[]> {
    verifyTenant(tenantId, tenantId);
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: `dlq:${tenantId}:` } }
    });
    return records.map(r => r.value);
  }
}

// 25. Workflow Repository
export class PrismaExecutiveWorkflowRepository extends BasePrismaRepository implements IExecutiveWorkflowRepository {
  public async saveWorkflowConfig(tenantId: string, config: IWorkflowConfig): Promise<void> {
    verifyTenant(tenantId, config.tenantId);
    await this.db.workflow.upsert({
      where: { id: config.id },
      update: {
        tenantId: config.tenantId,
        executionId: (config as any).executionId || "",
        title: config.name,
        status: (config as any).status || "ACTIVE",
        nodes: config.graph?.nodes as any || [],
        edges: config.graph?.edges as any || [],
        metadata: config as any,
        isDeleted: false
      },
      create: {
        id: config.id,
        tenantId: config.tenantId,
        executionId: (config as any).executionId || "",
        title: config.name,
        status: (config as any).status || "ACTIVE",
        nodes: config.graph?.nodes as any || [],
        edges: config.graph?.edges as any || [],
        metadata: config as any,
        isDeleted: false
      }
    });
  }

  public async findWorkflowConfigById(tenantId: string, id: string): Promise<IWorkflowConfig | null> {
    const record = await this.db.workflow.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as IWorkflowConfig;
  }

  public async deleteWorkflowConfig(tenantId: string, id: string): Promise<void> {
    const record = await this.db.workflow.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.workflow.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async saveWorkflowState(tenantId: string, state: IWorkflowState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.workflowState.upsert({
      where: { id: state.id },
      update: {
        tenantId: state.tenantId,
        workflowId: state.workflowId,
        currentNodeId: (state as any).currentNodeId || "",
        nodeStatuses: (state as any).nodeStatuses || {},
        variables: state as any,
        isDeleted: false
      },
      create: {
        id: state.id,
        tenantId: state.tenantId,
        workflowId: state.workflowId,
        currentNodeId: (state as any).currentNodeId || "",
        nodeStatuses: (state as any).nodeStatuses || {},
        variables: state as any,
        isDeleted: false
      }
    });
  }

  public async findWorkflowStateById(tenantId: string, id: string): Promise<IWorkflowState | null> {
    const record = await this.db.workflowState.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.variables as any as IWorkflowState;
  }

  public async saveCheckpoint(tenantId: string, stateId: string, checkpointContext: any): Promise<void> {
    await this.db.systemKeyValueStore.upsert({
      where: { id: `checkpoint:${stateId}` },
      update: { value: checkpointContext as any },
      create: { id: `checkpoint:${stateId}`, value: checkpointContext as any }
    });
  }

  public async findCheckpoint(tenantId: string, stateId: string): Promise<any | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `checkpoint:${stateId}` }
    });
    if (!record) return null;
    return record.value;
  }
}

// 26. Adaptive Execution Repository
export class PrismaExecutiveAdaptiveExecutionRepository extends BasePrismaRepository implements IExecutiveAdaptiveExecutionRepository {
  public async saveAdaptiveState(tenantId: string, state: IAdaptiveExecutionState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `adapt:${state.id}` },
      update: { value: state as any },
      create: { id: `adapt:${state.id}`, value: state as any }
    });
  }

  public async findAdaptiveStateById(tenantId: string, id: string): Promise<IAdaptiveExecutionState | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `adapt:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findAdaptiveStateByWorkflowId(tenantId: string, workflowStateId: string): Promise<IAdaptiveExecutionState | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "adapt:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.workflowStateId === workflowStateId) {
        return val;
      }
    }
    return null;
  }
}

// 27. Supervisor Repository
export class PrismaExecutiveSupervisorRepository extends BasePrismaRepository implements IExecutiveSupervisorRepository {
  public async saveAuditState(tenantId: string, state: ISupervisorAuditState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.supervisor.upsert({
      where: { id: state.id },
      update: {
        tenantId: state.tenantId,
        executiveId: (state as any).executiveId || "SYSTEM",
        adaptiveStateId: (state as any).adaptiveStateId || "",
        policyRules: (state as any).policyRules || {},
        auditIntervalMs: (state as any).auditIntervalMs || 0,
        status: (state as any).status || "",
        metadata: state as any,
        isDeleted: false
      },
      create: {
        id: state.id,
        tenantId: state.tenantId,
        executiveId: (state as any).executiveId || "SYSTEM",
        adaptiveStateId: (state as any).adaptiveStateId || "",
        policyRules: (state as any).policyRules || {},
        auditIntervalMs: (state as any).auditIntervalMs || 0,
        status: (state as any).status || "",
        metadata: state as any,
        isDeleted: false
      }
    });
  }

  public async findAuditStateById(tenantId: string, id: string): Promise<ISupervisorAuditState | null> {
    const record = await this.db.supervisor.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as ISupervisorAuditState;
  }

  public async findAuditStateByAdaptiveId(tenantId: string, adaptiveStateId: string): Promise<ISupervisorAuditState | null> {
    const record = await this.db.supervisor.findFirst({
      where: { tenantId, adaptiveStateId, isDeleted: false }
    });
    if (!record) return null;
    return record.metadata as any as ISupervisorAuditState;
  }
}

// 28. Operations Supervisor Repository
export class PrismaExecutiveOperationsSupervisorRepository extends BasePrismaRepository implements IExecutiveOperationsSupervisorRepository {
  public async saveOperationsState(tenantId: string, state: IOperationsState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `ops:${state.id}` },
      update: { value: state as any },
      create: { id: `ops:${state.id}`, value: state as any }
    });
  }

  public async findOperationsStateById(tenantId: string, id: string): Promise<IOperationsState | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `ops:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }
}

// 29. Scheduler Repository
export class PrismaExecutiveSchedulerRepository extends BasePrismaRepository implements IExecutiveSchedulerRepository {
  public async saveScheduleState(tenantId: string, state: IScheduleState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.scheduler.upsert({
      where: { id: state.id },
      update: {
        tenantId: state.tenantId,
        executiveId: (state as any).executionId || "SYSTEM",
        workflowId: state.workflowId,
        cronExpression: state.cronExpression || "",
        isActive: true,
        nextExecutionTime: state.triggerTime || "",
        metadata: state as any,
        isDeleted: false
      },
      create: {
        id: state.id,
        tenantId: state.tenantId,
        executiveId: (state as any).executionId || "SYSTEM",
        workflowId: state.workflowId,
        cronExpression: state.cronExpression || "",
        isActive: true,
        nextExecutionTime: state.triggerTime || "",
        metadata: state as any,
        isDeleted: false
      }
    });
  }

  public async findScheduleStateById(tenantId: string, id: string): Promise<IScheduleState | null> {
    const record = await this.db.scheduler.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as IScheduleState;
  }

  public async findSchedulesByWorkflowId(tenantId: string, workflowId: string): Promise<IScheduleState[]> {
    const records = await this.db.scheduler.findMany({
      where: { tenantId, workflowId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IScheduleState);
  }

  public async findAllSchedules(tenantId: string): Promise<IScheduleState[]> {
    const records = await this.db.scheduler.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IScheduleState);
  }
}

// 30. Learning Repository
export class PrismaExecutiveExecutionLearningRepository extends BasePrismaRepository implements IExecutiveExecutionLearningRepository {
  public async saveLearningState(tenantId: string, state: ILearningState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.learning.upsert({
      where: { id: state.id },
      update: {
        tenantId: state.tenantId,
        executiveId: (state as any).executionId || "SYSTEM",
        executionId: state.executionId,
        workflowId: state.workflowId,
        observations: (state as any).observations || [],
        reflectionNotes: (state as any).reflectionNotes || "",
        successRating: (state as any).successRating || 0.0,
        recommendations: (state as any).recommendations || [],
        metadata: state as any,
        isDeleted: false
      },
      create: {
        id: state.id,
        tenantId: state.tenantId,
        executiveId: (state as any).executionId || "SYSTEM",
        executionId: state.executionId,
        workflowId: state.workflowId,
        observations: (state as any).observations || [],
        reflectionNotes: (state as any).reflectionNotes || "",
        successRating: (state as any).successRating || 0.0,
        recommendations: (state as any).recommendations || [],
        metadata: state as any,
        isDeleted: false
      }
    });
  }

  public async findLearningStateById(tenantId: string, id: string): Promise<ILearningState | null> {
    const record = await this.db.learning.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as ILearningState;
  }

  public async findLearningStatesByWorkflowId(tenantId: string, workflowId: string): Promise<ILearningState[]> {
    const records = await this.db.learning.findMany({
      where: { tenantId, workflowId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as ILearningState);
  }
}

// 31. Execution Certification Repository
export class PrismaExecutiveExecutionCertificationRepository extends BasePrismaRepository implements IExecutiveExecutionCertificationRepository {
  public async saveCertificationState(tenantId: string, state: ICertificationState): Promise<void> {
    verifyTenant(tenantId, state.tenantId);
    await this.db.certification.upsert({
      where: { id: state.id },
      update: {
        tenantId: state.tenantId,
        executiveId: state.executionId || "SYSTEM",
        executionId: state.executionId,
        workflowId: state.workflowId,
        certificationType: "EXECUTION",
        status: state.status,
        issuedAt: state.createdAt,
        expiresAt: state.freezeSignature,
        metadata: state as any,
        isDeleted: false
      },
      create: {
        id: state.id,
        tenantId: state.tenantId,
        executiveId: state.executionId || "SYSTEM",
        executionId: state.executionId,
        workflowId: state.workflowId,
        certificationType: "EXECUTION",
        status: state.status,
        issuedAt: state.createdAt,
        expiresAt: state.freezeSignature,
        metadata: state as any,
        isDeleted: false
      }
    });
  }

  public async findCertificationStateById(tenantId: string, id: string): Promise<ICertificationState | null> {
    const record = await this.db.certification.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as ICertificationState;
  }

  public async findCertificationStatesByExecutionId(tenantId: string, executionId: string): Promise<ICertificationState[]> {
    const records = await this.db.certification.findMany({
      where: { tenantId, executionId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as ICertificationState);
  }
}

// 32. Timeline Repository
export class PrismaExecutiveTimelineRepository extends BasePrismaRepository implements IExecutiveTimelineRepository {
  public async save(tenantId: string, timeline: IExecutiveTimeline): Promise<void> {
    verifyTenant(tenantId, timeline.tenantId);
    await this.db.timeline.upsert({
      where: { id: timeline.id },
      update: {
        tenantId: timeline.tenantId,
        planId: timeline.planId,
        startDate: (timeline as any).startDate || "",
        endDate: (timeline as any).endDate || "",
        milestones: (timeline as any).milestones as any || [],
        metadata: timeline as any,
        isDeleted: false
      },
      create: {
        id: timeline.id,
        tenantId: timeline.tenantId,
        planId: timeline.planId,
        startDate: (timeline as any).startDate || "",
        endDate: (timeline as any).endDate || "",
        milestones: (timeline as any).milestones as any || [],
        metadata: timeline as any,
        isDeleted: false
      }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IExecutiveTimeline | null> {
    const record = await this.db.timeline.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as IExecutiveTimeline;
  }

  public async findByPlanId(tenantId: string, planId: string): Promise<IExecutiveTimeline | null> {
    const record = await this.db.timeline.findFirst({
      where: { tenantId, planId, isDeleted: false }
    });
    if (!record) return null;
    return record.metadata as any as IExecutiveTimeline;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const record = await this.db.timeline.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.timeline.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }
}

// 33. Scenario Repository
export class PrismaExecutiveScenarioRepository extends BasePrismaRepository implements IExecutiveScenarioRepository {
  public async save(tenantId: string, scenario: IScenario): Promise<void> {
    verifyTenant(tenantId, scenario.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `scenario:${scenario.id}` },
      update: { value: scenario as any },
      create: { id: `scenario:${scenario.id}`, value: scenario as any }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IScenario | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `scenario:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async getByPlanId(tenantId: string, planId: string): Promise<IScenario[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "scenario:" } }
    });
    const list: IScenario[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.planId === planId) {
        list.push(val);
      }
    }
    return list;
  }

  public async getAll(tenantId: string): Promise<IScenario[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "scenario:" } }
    });
    const list: IScenario[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `scenario:${id}` } });
  }
}

// 34. Simulation Repository
export class PrismaExecutiveSimulationRepository extends BasePrismaRepository implements IExecutiveSimulationRepository {
  public async saveSimulation(tenantId: string, sim: ISimulationPackage): Promise<void> {
    verifyTenant(tenantId, sim.tenantId);
    await this.db.simulation.upsert({
      where: { id: sim.decisionId },
      update: {
        tenantId: sim.tenantId,
        decisionId: sim.decisionId,
        scenarios: (sim as any).scenarios as any || [],
        metrics: (sim as any).metrics as any || {},
        metadata: sim as any,
        isDeleted: false
      },
      create: {
        id: sim.decisionId,
        tenantId: sim.tenantId,
        decisionId: sim.decisionId,
        scenarios: (sim as any).scenarios as any || [],
        metrics: (sim as any).metrics as any || {},
        metadata: sim as any,
        isDeleted: false
      }
    });
  }

  public async findSimulationById(tenantId: string, id: string): Promise<ISimulationPackage | null> {
    const record = await this.db.simulation.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as ISimulationPackage;
  }

  public async findSimulationByDecisionId(tenantId: string, decisionId: string): Promise<ISimulationPackage | null> {
    const record = await this.db.simulation.findFirst({
      where: { decisionId, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as ISimulationPackage;
  }

  public async deleteSimulation(tenantId: string, id: string): Promise<void> {
    const record = await this.db.simulation.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.simulation.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async getSimulations(tenantId: string): Promise<ISimulationPackage[]> {
    const records = await this.db.simulation.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as ISimulationPackage);
  }

  public async saveHistoryEntry(tenantId: string, entry: ISimulationHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `sim_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `sim_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistoryBySimulationId(tenantId: string, simId: string): Promise<ISimulationHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "sim_hist:" } }
    });
    const list: ISimulationHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.simulationId === simId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 35. Planning Optimization Repository
export class PrismaExecutivePlanningOptimizationRepository extends BasePrismaRepository implements IExecutivePlanningOptimizationRepository {
  public async save(tenantId: string, optimization: IPlanningOptimization): Promise<void> {
    verifyTenant(tenantId, optimization.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `opt_plan:${optimization.id}` },
      update: { value: optimization as any },
      create: { id: `opt_plan:${optimization.id}`, value: optimization as any }
    });
  }

  public async findById(tenantId: string, id: string): Promise<IPlanningOptimization | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `opt_plan:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findByPlanId(tenantId: string, planId: string): Promise<IPlanningOptimization | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "opt_plan:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.planId === planId) {
        return val;
      }
    }
    return null;
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `opt_plan:${id}` } });
  }
}

// 36. Risk Repository
export class PrismaExecutiveRiskRepository extends BasePrismaRepository implements IExecutiveRiskRepository {
  public async saveRisk(tenantId: string, risk: IRisk): Promise<void> {
    verifyTenant(tenantId, risk.tenantId);
    await this.db.risk.upsert({
      where: { id: risk.id },
      update: {
        tenantId: risk.tenantId,
        planId: risk.planId,
        category: risk.category,
        description: risk.description,
        probability: risk.probability,
        impact: risk.impact,
        mitigationStrategy: (risk as any).mitigationStrategy || "",
        metadata: risk as any,
        isDeleted: false
      },
      create: {
        id: risk.id,
        tenantId: risk.tenantId,
        planId: risk.planId,
        category: risk.category,
        description: risk.description,
        probability: risk.probability,
        impact: risk.impact,
        mitigationStrategy: (risk as any).mitigationStrategy || "",
        metadata: risk as any,
        isDeleted: false
      }
    });
  }

  public async findRiskById(tenantId: string, id: string): Promise<IRisk | null> {
    const record = await this.db.risk.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as IRisk;
  }

  public async getRisksByPlanId(tenantId: string, planId: string): Promise<IRisk[]> {
    const records = await this.db.risk.findMany({
      where: { tenantId, planId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IRisk);
  }

  public async saveContingency(tenantId: string, contingency: IContingencyPlan): Promise<void> {
    verifyTenant(tenantId, contingency.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `contingency:${contingency.id}` },
      update: { value: contingency as any },
      create: { id: `contingency:${contingency.id}`, value: contingency as any }
    });
  }

  public async getContingencyByRiskId(tenantId: string, riskId: string): Promise<IContingencyPlan | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "contingency:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.riskId === riskId) {
        return val;
      }
    }
    return null;
  }
}

// 37. Resource Repository
export class PrismaExecutiveResourceRepository extends BasePrismaRepository implements IExecutiveResourceRepository {
  public async saveResource(tenantId: string, resource: IResource): Promise<void> {
    verifyTenant(tenantId, resource.tenantId);
    await this.db.resource.upsert({
      where: { id: resource.id },
      update: {
        tenantId: resource.tenantId,
        name: resource.name,
        type: resource.type,
        allocationUnit: (resource as any).allocationUnit || "",
        costPerUnit: resource.costPerHour || 0,
        status: resource.status,
        availableQuantity: resource.capacityHoursPerWeek || 0,
        isDeleted: false
      },
      create: {
        id: resource.id,
        tenantId: resource.tenantId,
        name: resource.name,
        type: resource.type,
        allocationUnit: (resource as any).allocationUnit || "",
        costPerUnit: resource.costPerHour || 0,
        status: resource.status,
        availableQuantity: resource.capacityHoursPerWeek || 0,
        isDeleted: false
      }
    });
  }

  public async findResourceById(tenantId: string, id: string): Promise<IResource | null> {
    const record = await this.db.resource.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      type: record.type as any,
      capabilities: [],
      capacityHoursPerWeek: record.availableQuantity || 40,
      costPerHour: record.costPerUnit || 0,
      status: record.status as any
    };
  }

  public async getResources(tenantId: string): Promise<IResource[]> {
    const records = await this.db.resource.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(record => ({
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      type: record.type as any,
      capabilities: [],
      capacityHoursPerWeek: record.availableQuantity || 40,
      costPerHour: record.costPerUnit || 0,
      status: record.status as any
    }));
  }

  public async saveAllocation(tenantId: string, allocation: IResourceAllocation): Promise<void> {
    verifyTenant(tenantId, allocation.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `alloc:${allocation.id}` },
      update: { value: allocation as any },
      create: { id: `alloc:${allocation.id}`, value: allocation as any }
    });
  }

  public async getAllocationsByPlanId(tenantId: string, planId: string): Promise<IResourceAllocation[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "alloc:" } }
    });
    const list: IResourceAllocation[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.planId === planId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 38. Evidence Repository
export class PrismaExecutiveEvidenceRepository extends BasePrismaRepository implements IExecutiveEvidenceRepository {
  public async saveEvidence(tenantId: string, evidence: IEvidence): Promise<void> {
    verifyTenant(tenantId, evidence.tenantId);
    await this.db.evidence.upsert({
      where: { id: evidence.id },
      update: {
        tenantId: evidence.tenantId,
        decisionId: (evidence as any).decisions?.[0] || "SYSTEM",
        title: evidence.title,
        content: (evidence as any).description || "",
        credibilityScore: (evidence as any).sourceReliability || 0,
        metadata: evidence as any,
        isDeleted: false
      },
      create: {
        id: evidence.id,
        tenantId: evidence.tenantId,
        decisionId: (evidence as any).decisions?.[0] || "SYSTEM",
        title: evidence.title,
        content: (evidence as any).description || "",
        credibilityScore: (evidence as any).sourceReliability || 0,
        metadata: evidence as any,
        isDeleted: false
      }
    });
  }

  public async findEvidenceById(tenantId: string, id: string): Promise<IEvidence | null> {
    const record = await this.db.evidence.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as IEvidence;
  }

  public async findEvidenceVersion(tenantId: string, id: string, version: number): Promise<IEvidence | null> {
    const history = await this.getHistoryByEvidenceId(tenantId, id);
    const entry = history.find(h => h.version === version);
    if (!entry) return null;
    return entry.evidenceSnapshot;
  }

  public async deleteEvidence(tenantId: string, id: string): Promise<void> {
    const record = await this.db.evidence.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.evidence.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async getEvidences(tenantId: string): Promise<IEvidence[]> {
    const records = await this.db.evidence.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IEvidence);
  }

  public async saveRelation(tenantId: string, relation: IEvidenceRelation): Promise<void> {
    verifyTenant(tenantId, relation.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `ev_rel:${relation.id}` },
      update: { value: relation as any },
      create: { id: `ev_rel:${relation.id}`, value: relation as any }
    });
  }

  public async getRelationsByEvidenceId(tenantId: string, evidenceId: string): Promise<IEvidenceRelation[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "ev_rel:" } }
    });
    const list: IEvidenceRelation[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && (val.sourceEvidenceId === evidenceId || val.targetEvidenceId === evidenceId)) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHistoryEntry(tenantId: string, entry: IEvidenceHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `ev_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `ev_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistoryByEvidenceId(tenantId: string, evidenceId: string): Promise<IEvidenceHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "ev_hist:" } }
    });
    const list: IEvidenceHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.evidenceId === evidenceId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 39. Alternative Repository
export class PrismaExecutiveAlternativeRepository extends BasePrismaRepository implements IExecutiveAlternativeRepository {
  public async saveAlternative(tenantId: string, alt: IExecutiveAlternative): Promise<void> {
    verifyTenant(tenantId, alt.tenantId);
    await this.db.alternative.upsert({
      where: { id: alt.id },
      update: {
        tenantId: alt.tenantId,
        decisionId: alt.decisionId,
        title: alt.title,
        description: alt.description,
        status: alt.status,
        cost: 0,
        estimatedRoi: 0,
        confidence: alt.confidence,
        metadata: alt as any,
        isDeleted: false
      },
      create: {
        id: alt.id,
        tenantId: alt.tenantId,
        decisionId: alt.decisionId,
        title: alt.title,
        description: alt.description,
        status: alt.status,
        cost: 0,
        estimatedRoi: 0,
        confidence: alt.confidence,
        metadata: alt as any,
        isDeleted: false
      }
    });
  }

  public async findAlternativeById(tenantId: string, id: string): Promise<IExecutiveAlternative | null> {
    const record = await this.db.alternative.findFirst({
      where: { id, isDeleted: false }
    });
    if (!record) return null;
    verifyTenant(tenantId, record.tenantId);
    return record.metadata as any as IExecutiveAlternative;
  }

  public async findAlternativeVersion(tenantId: string, id: string, version: number): Promise<IExecutiveAlternative | null> {
    const history = await this.getHistoryByAlternativeId(tenantId, id);
    const entry = history.find(h => h.version === version);
    if (!entry) return null;
    return entry.alternativeSnapshot;
  }

  public async deleteAlternative(tenantId: string, id: string): Promise<void> {
    const record = await this.db.alternative.findFirst({ where: { id } });
    if (record) {
      verifyTenant(tenantId, record.tenantId);
      await this.db.alternative.update({
        where: { id },
        data: { isDeleted: true }
      });
    }
  }

  public async getAlternatives(tenantId: string): Promise<IExecutiveAlternative[]> {
    const records = await this.db.alternative.findMany({
      where: { tenantId, isDeleted: false }
    });
    return records.map(r => r.metadata as any as IExecutiveAlternative);
  }

  public async saveHistoryEntry(tenantId: string, entry: IAlternativeHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `alt_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `alt_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistoryByAlternativeId(tenantId: string, altId: string): Promise<IAlternativeHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "alt_hist:" } }
    });
    const list: IAlternativeHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.alternativeId === altId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHypothesisPair(tenantId: string, pair: IHypothesisPair): Promise<void> {
    verifyTenant(tenantId, pair.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `hypothesis:${pair.id}` },
      update: { value: pair as any },
      create: { id: `hypothesis:${pair.id}`, value: pair as any }
    });
  }

  public async getHypothesisPairs(tenantId: string, decisionId: string): Promise<IHypothesisPair[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "hypothesis:" } }
    });
    const list: IHypothesisPair[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 40. Decision Evaluation Repository
export class PrismaExecutiveDecisionEvaluationRepository extends BasePrismaRepository implements IExecutiveDecisionEvaluationRepository {
  public async saveEvaluation(tenantId: string, pkg: IEvaluationPackage): Promise<void> {
    verifyTenant(tenantId, pkg.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `eval:${pkg.id}` },
      update: { value: pkg as any },
      create: { id: `eval:${pkg.id}`, value: pkg as any }
    });
  }

  public async findEvaluationById(tenantId: string, id: string): Promise<IEvaluationPackage | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `eval:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findEvaluationByDecisionId(tenantId: string, decisionId: string): Promise<IEvaluationPackage | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "eval:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        return val;
      }
    }
    return null;
  }

  public async deleteEvaluation(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `eval:${id}` } });
  }

  public async getEvaluations(tenantId: string): Promise<IEvaluationPackage[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "eval:" } }
    });
    const list: IEvaluationPackage[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHistoryEntry(tenantId: string, entry: IEvaluationHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `eval_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `eval_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistoryByEvaluationId(tenantId: string, evalId: string): Promise<IEvaluationHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "eval_hist:" } }
    });
    const list: IEvaluationHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.evaluationId === evalId) {
        list.push(val);
      }
    }
    return list;
  }
}

// 41. Decision Selection Repository
export class PrismaExecutiveDecisionSelectionRepository extends BasePrismaRepository implements IExecutiveDecisionSelectionRepository {
  public async saveSelection(tenantId: string, selection: IExecutiveDecisionSelection): Promise<void> {
    verifyTenant(tenantId, selection.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `select:${selection.id}` },
      update: { value: selection as any },
      create: { id: `select:${selection.id}`, value: selection as any }
    });
  }

  public async findSelectionById(tenantId: string, id: string): Promise<IExecutiveDecisionSelection | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `select:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async getSelections(tenantId: string): Promise<IExecutiveDecisionSelection[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "select:" } }
    });
    const list: IExecutiveDecisionSelection[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveHistory(tenantId: string, entry: ISelectionHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `select_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `select_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, selectionId: string): Promise<ISelectionHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "select_hist:" } }
    });
    const list: ISelectionHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.selectionId === selectionId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, selectionId: string, snapshot: IExecutiveDecisionSelection): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `select_snap:${selectionId}` },
      update: { value: snapshot as any },
      create: { id: `select_snap:${selectionId}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, selectionId: string): Promise<IExecutiveDecisionSelection | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `select_snap:${selectionId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async deleteSelection(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `select:${id}` } });
  }
}

// 42. Decision Authorization Repository
export class PrismaExecutiveDecisionAuthorizationRepository extends BasePrismaRepository implements IExecutiveDecisionAuthorizationRepository {
  public async saveAuthorization(tenantId: string, auth: IExecutiveDecisionAuthorization): Promise<void> {
    verifyTenant(tenantId, auth.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `auth:${auth.id}` },
      update: { value: auth as any },
      create: { id: `auth:${auth.id}`, value: auth as any }
    });
  }

  public async findAuthorizationById(tenantId: string, id: string): Promise<IExecutiveDecisionAuthorization | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `auth:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findAuthorizationByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionAuthorization | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "auth:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        return val;
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IAuthorizationHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `auth_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `auth_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, authorizationId: string): Promise<IAuthorizationHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "auth_hist:" } }
    });
    const list: IAuthorizationHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.authorizationId === authorizationId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, authorizationId: string, snapshot: IExecutiveDecisionAuthorization): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `auth_snap:${authorizationId}` },
      update: { value: snapshot as any },
      create: { id: `auth_snap:${authorizationId}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, authorizationId: string): Promise<IExecutiveDecisionAuthorization | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `auth_snap:${authorizationId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async deleteAuthorization(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `auth:${id}` } });
  }
}

// 43. Decision Dispatch Repository
export class PrismaExecutiveDecisionDispatchRepository extends BasePrismaRepository implements IExecutiveDecisionDispatchRepository {
  public async saveDispatch(tenantId: string, dispatch: IExecutiveDecisionDispatch): Promise<void> {
    verifyTenant(tenantId, dispatch.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `disp:${dispatch.id}` },
      update: { value: dispatch as any },
      create: { id: `disp:${dispatch.id}`, value: dispatch as any }
    });
  }

  public async findDispatchById(tenantId: string, id: string): Promise<IExecutiveDecisionDispatch | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `disp:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findDispatchByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionDispatch | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "disp:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        return val;
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IDispatchHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `disp_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `disp_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, dispatchId: string): Promise<IDispatchHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "disp_hist:" } }
    });
    const list: IDispatchHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.dispatchId === dispatchId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, dispatchId: string, snapshot: IExecutiveDecisionDispatch): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `disp_snap:${dispatchId}` },
      update: { value: snapshot as any },
      create: { id: `disp_snap:${dispatchId}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, dispatchId: string): Promise<IExecutiveDecisionDispatch | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `disp_snap:${dispatchId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async deleteDispatch(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `disp:${id}` } });
  }
}

// 44. Decision Monitoring Repository
export class PrismaExecutiveDecisionMonitoringRepository extends BasePrismaRepository implements IExecutiveDecisionMonitoringRepository {
  public async saveMonitoring(tenantId: string, monitoring: IExecutiveDecisionMonitoring): Promise<void> {
    verifyTenant(tenantId, monitoring.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `mon:${monitoring.id}` },
      update: { value: monitoring as any },
      create: { id: `mon:${monitoring.id}`, value: monitoring as any }
    });
  }

  public async findMonitoringById(tenantId: string, id: string): Promise<IExecutiveDecisionMonitoring | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `mon:${id}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async findMonitoringByDecisionId(tenantId: string, decisionId: string): Promise<IExecutiveDecisionMonitoring | null> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "mon:" } }
    });
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.decisionId === decisionId) {
        return val;
      }
    }
    return null;
  }

  public async saveHistory(tenantId: string, entry: IMonitoringHistoryEntry): Promise<void> {
    verifyTenant(tenantId, entry.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `mon_hist:${entry.id}` },
      update: { value: entry as any },
      create: { id: `mon_hist:${entry.id}`, value: entry as any }
    });
  }

  public async getHistory(tenantId: string, monitoringId: string): Promise<IMonitoringHistoryEntry[]> {
    const records = await this.db.systemKeyValueStore.findMany({
      where: { id: { startsWith: "mon_hist:" } }
    });
    const list: IMonitoringHistoryEntry[] = [];
    for (const r of records) {
      const val = r.value as any;
      if (val.tenantId === tenantId && val.monitoringId === monitoringId) {
        list.push(val);
      }
    }
    return list;
  }

  public async saveSnapshot(tenantId: string, monitoringId: string, snapshot: IExecutiveDecisionMonitoring): Promise<void> {
    verifyTenant(tenantId, snapshot.tenantId);
    await this.db.systemKeyValueStore.upsert({
      where: { id: `mon_snap:${monitoringId}` },
      update: { value: snapshot as any },
      create: { id: `mon_snap:${monitoringId}`, value: snapshot as any }
    });
  }

  public async getSnapshot(tenantId: string, monitoringId: string): Promise<IExecutiveDecisionMonitoring | null> {
    const record = await this.db.systemKeyValueStore.findUnique({
      where: { id: `mon_snap:${monitoringId}` }
    });
    if (!record) return null;
    const val = record.value as any;
    verifyTenant(tenantId, val.tenantId);
    return val;
  }

  public async deleteMonitoring(tenantId: string, id: string): Promise<void> {
    await this.db.systemKeyValueStore.delete({ where: { id: `mon:${id}` } });
  }
}
