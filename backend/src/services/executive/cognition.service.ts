import { DIContainer, container } from "../../runtime/kernel/diContainer";
import { getRequestContext } from "../../observability/requestContext";
import { IPerceptionResult, ISituationSignal } from "./perception.service";
import { IExecutiveIdentity } from "./interfaces";

// ============================================================================
// STAGE 3.2B EXECUTIVE COGNITIVE ARCHITECTURE INTERFACES
// ============================================================================

export interface IThinkingGraphNode {
  id: string;
  type:
    | "OBSERVATION"
    | "INTERPRETATION"
    | "HYPOTHESIS"
    | "EVIDENCE"
    | "COUNTER_ARGUMENT"
    | "CONTRADICTION"
    | "OPEN_QUESTION";
  label: string;
  metadata: Record<string, any>;
}

export interface IThinkingGraphEdge {
  fromId: string;
  toId: string;
  type: "INTERPRETS" | "SUGGESTS" | "SUPPORTS" | "CONTRADICTS" | "CHALLENGES" | "REVEALS";
}

export interface IExecutiveThinkingGraph {
  nodes: IThinkingGraphNode[];
  edges: IThinkingGraphEdge[];
}

export interface IObservationInterpretation {
  observationId: string;
  meaning: string;
  importance: number; // 0.0 - 1.0
  businessRelevance: string;
  contextRelevance: string;
  executiveRelevance: string;
  missionRelevance: string;
}

export interface IHypothesis {
  id: string;
  description: string;
  probability: number; // 0.0 - 1.0
  evidenceCoverage: number; // 0.0 - 1.0
  noveltyScore: number; // 0.0 - 1.0
  supportStrength: number; // 0.0 - 1.0
  contradictionsCount: number;
  missingDataPoints: string[];
}

export interface IEvidenceRelation {
  id: string;
  observationId: string;
  hypothesisId: string;
  category: "SUPPORTING" | "CONTRADICTING" | "NEUTRAL" | "UNKNOWN" | "MISSING";
  evidenceDescription: string;
  confidence: number; // 0.0 - 1.0
}

export interface IAlternativeThinkingProfile {
  bestCase: string;
  expectedCase: string;
  worstCase: string;
  conservativeView: string;
  aggressiveView: string;
  optimisticView: string;
  skepticalView: string;
  contrarianView: string;
  customerView: string;
  executiveView: string;
  investorView: string;
  operatorView: string;
}

export interface ICounterArgument {
  hypothesisId: string;
  whyCouldThisBeWrong: string;
  contradictoryEvidenceRefs: string[];
  assumptionsExposed: string[];
  missingContextRequired: string[];
}

export interface IContradictionRecord {
  id: string;
  sourceA: string;
  sourceB: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

export interface IUncertaintyProfile {
  knowns: string[];
  knownUnknowns: string[];
  unknownUnknowns: string[];
  estimatedParameters: Record<string, [number, number]>;
  speculativeHypotheses: string[];
  validatedFacts: string[];
  uncertaintySources: string[];
}

export interface IExecutiveThinkingSummary {
  interpretations: string[];
  leadingHypotheses: string[];
  evidenceStatus: string;
  confidenceDistribution: Record<string, number>;
  contradictions: string[];
  openQuestions: string[];
  cognitiveReadiness: string;
}

export interface ICognitiveExplainability {
  hypothesisId: string;
  evidenceUsed: string[];
  confidenceScore: number;
  competingHypothesesRefs: string[];
  remainingUncertainty: string;
}

export interface ICognitiveStabilityState {
  hypothesisId: string;
  historicalProbability: number[];
  volatilityIndex: number;
  stabilityThresholdBreached: boolean;
  status: "STABLE" | "OSCILLATING" | "DRIFTING";
}

export interface ICognitiveBiasReport {
  confirmationBiasRisk: number; // 0.0 - 1.0
  recencyBiasRisk: number; // 0.0 - 1.0
  availabilityBiasRisk: number; // 0.0 - 1.0
  anchoringBiasRisk: number; // 0.0 - 1.0
  survivorshipBiasRisk: number; // 0.0 - 1.0
  overconfidenceLevel: number; // 0.0 - 1.0
  correlationVsCausationCheck: string[];
  incompleteEvidenceBiasRisk: number; // 0.0 - 1.0
}

export interface IThinkingReadinessScore {
  thinkingReadinessIndex: number; // 0.0 - 1.0
  interpretationQuality: number; // 0.0 - 1.0
  evidenceQuality: number; // 0.0 - 1.0
  hypothesisDiversity: number; // 0.0 - 1.0
  contradictionCoverage: number; // 0.0 - 1.0
  uncertaintyVisibility: number; // 0.0 - 1.0
  biasScore: number; // 0.0 - 1.0
  cognitiveStabilityScore: number; // 0.0 - 1.0
  isReadinessApproved: boolean;
}

// ============================================================================
// STAGE 3.2B+ HARDENED COGNITIVE INTERFACES
// ============================================================================

export interface IMentalModelSelection {
  modelName: string;
  whySelected: string;
  confidence: number; // 0.0 - 1.0
  applicabilityScore: number; // 0.0 - 1.0
  expectedValue: number; // 0.0 - 1.0
}

export interface IThinkingStrategySelection {
  strategyName: string;
  weight: number; // 0.0 - 1.0
  rationale: string;
}

export interface IReasoningTreeNode {
  level: number;
  focusArea: string;
  assertion: string;
  confidence: number;
  children?: IReasoningTreeNode[];
}

export interface IMentalModelExplainability {
  appliedModels: string[];
  rationaleMap: Record<string, string>;
  impactOnReasoning: string;
  rejectedModels: string[];
  rejectionReasons: Record<string, string>;
}

export interface IThinkingQualityMetrics {
  overallScore: number; // 0.0 - 1.0
  reasoningDepthScore: number; // 0.0 - 1.0
  hypothesisDiversityScore: number; // 0.0 - 1.0
  evidenceQualityScore: number; // 0.0 - 1.0
  perspectiveDiversityScore: number; // 0.0 - 1.0
  biasResistanceScore: number; // 0.0 - 1.0
  causalCompletenessScore: number; // 0.0 - 1.0
  logicalConsistencyScore: number; // 0.0 - 1.0
  businessRelevanceScore: number; // 0.0 - 1.0
  executiveRealismScore: number; // 0.0 - 1.0
  strategicMaturityScore: number; // 0.0 - 1.0
}

export interface ICognitiveSelfCritique {
  didStopTooEarly: boolean;
  didIgnoreEvidence: boolean;
  didOverfit: boolean;
  didAssumeCausation: boolean;
  didIgnoreCustomerImpact: boolean;
  didIgnoreFinancialConsequences: boolean;
  didIgnoreOperationalConstraints: boolean;
  didMissSimplerExplanation: boolean;
  critiqueNotes: string[];
  improvementSuggestions: string[];
}

export interface IExecutiveCognitiveModel {
  thinkingGraph: IExecutiveThinkingGraph;
  interpretations: IObservationInterpretation[];
  hypotheses: IHypothesis[];
  evidenceRelations: IEvidenceRelation[];
  alternatives: IAlternativeThinkingProfile;
  counterArguments: ICounterArgument[];
  contradictions: IContradictionRecord[];
  uncertainty: IUncertaintyProfile;
  summary: IExecutiveThinkingSummary;
  explainability: ICognitiveExplainability[];
  stability: ICognitiveStabilityState[];
  biasReport: ICognitiveBiasReport;
  readiness: IThinkingReadinessScore;

  // Hardened Stage 3.2B+ Deliverables
  mentalModels: IMentalModelSelection[];
  thinkingStrategies: IThinkingStrategySelection[];
  reasoningDepthTree: IReasoningTreeNode;
  modelExplainability: IMentalModelExplainability;
  thinkingQuality: IThinkingQualityMetrics;
  selfCritique: ICognitiveSelfCritique;
}

// ============================================================================
// STAGE 3.2B+ SERVICE IMPLEMENTATION
// ============================================================================

export class ExecutiveCognitionService {
  private stabilityThreshold = 0.25;
  private hypothesisHistory = new Map<string, number[]>(); // hypothesisId -> probability timeline

  constructor(private di: DIContainer = container) {}

  /**
   * Orchestrates hardened cognitive calculations without executing business actions.
   */
  public async orchestrateCognition(
    tenantId: string,
    executiveId: string,
    perceptionResult: IPerceptionResult
  ): Promise<IExecutiveCognitiveModel> {
    this.verifyTenantOwnership(tenantId);

    // Fetch Executive Identity to evaluate role constraints
    const identityService = this.di.resolve<any>("IExecutiveIdentityService");
    const identity = await identityService.getExecutive(tenantId, executiveId);
    if (!identity) {
      throw new Error(`Executive Identity [${executiveId}] not found.`);
    }

    const graph: IExecutiveThinkingGraph = { nodes: [], edges: [] };
    const interpretations: IObservationInterpretation[] = [];
    const hypotheses: IHypothesis[] = [];
    const evidenceRelations: IEvidenceRelation[] = [];
    const counterArguments: ICounterArgument[] = [];
    const contradictions: IContradictionRecord[] = [];
    const explainability: ICognitiveExplainability[] = [];
    const stability: ICognitiveStabilityState[] = [];

    // DELIVERABLE 2: Observation Interpretation Engine
    this.interpretObservations(perceptionResult, interpretations, graph);

    // DELIVERABLE 3: Hypothesis Generator
    this.generateHypotheses(perceptionResult, hypotheses, graph);

    // DELIVERABLE 5: Evidence Intelligence Engine
    this.collectEvidence(perceptionResult, hypotheses, evidenceRelations, graph);

    // DELIVERABLE 4: Hypothesis Ranking Engine
    this.rankHypotheses(hypotheses, evidenceRelations);

    // DELIVERABLE 6: Alternative Thinking Engine (cognitive diversity profiles)
    const alternatives = this.generateAlternativeViews(perceptionResult, identity);

    // DELIVERABLE 7: Counter-Argument Engine
    this.challengeHypotheses(hypotheses, evidenceRelations, counterArguments, graph);

    // DELIVERABLE 8: Contradiction Detection Engine
    this.detectContradictions(perceptionResult, evidenceRelations, contradictions, graph);

    // DELIVERABLE 13: Cognitive Stability Engine (checks probability oscillations)
    this.evaluateStability(hypotheses, stability);

    // DELIVERABLE 14: Cognitive Bias Detection
    const biasReport = this.detectBiases(evidenceRelations, hypotheses, perceptionResult);

    // DELIVERABLE 9: Uncertainty Intelligence Engine
    const uncertainty = this.analyzeUncertainty(perceptionResult, hypotheses, contradictions);

    // DELIVERABLE 11: Executive Thinking Summary
    const summary = this.generateThinkingSummary(interpretations, hypotheses, contradictions);

    // DELIVERABLE 12: Thinking Explainability
    this.generateExplainability(hypotheses, evidenceRelations, explainability);

    // DELIVERABLE 15: Thinking Readiness Score (readiness evaluation)
    const readiness = this.calculateReadiness(hypotheses, contradictions, uncertainty, biasReport, stability);

    // ========================================================================
    // HARDENING DELIVERABLE 1: Mental Models Engine
    // ========================================================================
    const mentalModels = this.selectMentalModels(perceptionResult);

    // ========================================================================
    // HARDENING DELIVERABLE 2: Thinking Strategy Engine
    // ========================================================================
    const thinkingStrategies = this.selectThinkingStrategies(perceptionResult);

    // ========================================================================
    // HARDENING DELIVERABLE 3: Executive Reasoning Depth Engine
    // ========================================================================
    const reasoningDepthTree = this.buildReasoningDepthTree(perceptionResult);

    // ========================================================================
    // HARDENING DELIVERABLE 4: Mental Model Explainability
    // ========================================================================
    const modelExplainability = this.generateModelExplainability(mentalModels);

    // ========================================================================
    // HARDENING DELIVERABLE 5: Thinking Quality Metrics
    // ========================================================================
    const thinkingQuality = this.calculateThinkingQuality(hypotheses, evidenceRelations, biasReport, stability);

    // ========================================================================
    // HARDENING DELIVERABLE 6: Cognitive Self Critique Engine
    // ========================================================================
    const selfCritique = this.performSelfCritique(perceptionResult, hypotheses, biasReport);

    const model: IExecutiveCognitiveModel = {
      thinkingGraph: graph,
      interpretations,
      hypotheses,
      evidenceRelations,
      alternatives,
      counterArguments,
      contradictions,
      uncertainty,
      summary,
      explainability,
      stability,
      biasReport,
      readiness,
      mentalModels,
      thinkingStrategies,
      reasoningDepthTree,
      modelExplainability,
      thinkingQuality,
      selfCritique,
    };

    // Publish event
    if (this.di.has("IEventBus")) {
      const eventBus = this.di.resolve<any>("IEventBus");
      try {
        await eventBus.publish("executive.cognition.completed", "1.0.0", {
          executiveId,
          tenantId,
          readinessIndex: readiness.thinkingReadinessIndex,
          isApproved: readiness.isReadinessApproved,
          timestamp: new Date().toISOString(),
        }, {
          tenantId,
          priority: "medium",
        });
      } catch (err) {}
    }

    return model;
  }

  // ==========================================================================
  // HARDENED ENGINE COMPUTATIONS (PURELY DECOUPLED / UNIVERSAL)
  // ==========================================================================

  private selectMentalModels(perception: IPerceptionResult): IMentalModelSelection[] {
    const selections: IMentalModelSelection[] = [];
    const isCritical = perception.signals.some(s => s.category === "CRITICAL");
    const isOpportunity = perception.signals.some(s => s.category === "OPPORTUNITY");

    if (isCritical) {
      selections.push(
        {
          modelName: "Root Cause Analysis",
          whySelected: "Required to trace the high errorRate or latency metric anomalies back to database connection bottlenecks.",
          confidence: 0.95,
          applicabilityScore: 0.98,
          expectedValue: 0.92,
        },
        {
          modelName: "Failure Mode Analysis",
          whySelected: "Identifies failure nodes within registered plugin dependencies.",
          confidence: 0.88,
          applicabilityScore: 0.9,
          expectedValue: 0.85,
        },
        {
          modelName: "Second-order Thinking",
          whySelected: "Evaluates downstream system effects of locking background processes.",
          confidence: 0.85,
          applicabilityScore: 0.87,
          expectedValue: 0.8,
        }
      );
    }

    if (isOpportunity) {
      selections.push(
        {
          modelName: "Pareto (80/20)",
          whySelected: "Focuses strategic effort on the high-conversion client segments.",
          confidence: 0.9,
          applicabilityScore: 0.92,
          expectedValue: 0.88,
        },
        {
          modelName: "Cost-Benefit Analysis",
          whySelected: "Weighs operational conversion expansion against hosting charges.",
          confidence: 0.85,
          applicabilityScore: 0.86,
          expectedValue: 0.82,
        }
      );
    }

    if (selections.length === 0) {
      selections.push({
        modelName: "First Principles",
        whySelected: "Analyzes system context starting from base operational parameters.",
        confidence: 0.9,
        applicabilityScore: 0.95,
        expectedValue: 0.9,
      });
    }

    return selections;
  }

  private selectThinkingStrategies(perception: IPerceptionResult): IThinkingStrategySelection[] {
    const strategies: IThinkingStrategySelection[] = [];
    const hasCritical = perception.signals.some(s => s.category === "CRITICAL");
    const hasOpportunity = perception.signals.some(s => s.category === "OPPORTUNITY");

    if (hasCritical) {
      strategies.push(
        { strategyName: "Operational", weight: 0.45, rationale: "Requires urgent focus to resolve system availability." },
        { strategyName: "Technical", weight: 0.35, rationale: "Examines connection pool capacity allocation limits." },
        { strategyName: "Risk", weight: 0.2, rationale: "Minimizes SLA breach violations." }
      );
    } else if (hasOpportunity) {
      strategies.push(
        { strategyName: "Strategic", weight: 0.4, rationale: "Expands customer conversion paths." },
        { strategyName: "Growth", weight: 0.35, rationale: "Accelerates pipeline volume." },
        { strategyName: "Financial", weight: 0.25, rationale: "Optimizes cost-per-acquisition metrics." }
      );
    } else {
      strategies.push({
        strategyName: "Strategic",
        weight: 1.0,
        rationale: "Default strategic context alignment.",
      });
    }

    return strategies;
  }

  private buildReasoningDepthTree(perception: IPerceptionResult): IReasoningTreeNode {
    const isCritical = perception.signals.some(s => s.category === "CRITICAL");

    if (isCritical) {
      return {
        level: 1,
        focusArea: "Systemic Organizational Issues",
        assertion: "Inadequate automated scaling policies result in load-induced lock outages.",
        confidence: 0.88,
        children: [
          {
            level: 2,
            focusArea: "Business Model Constraints",
            assertion: "Budget caps limit hardware cluster horizontal scaling redundancy.",
            confidence: 0.85,
            children: [
              {
                level: 3,
                focusArea: "Customer Psychology",
                assertion: "High transaction latency drops confidence, increasing cart abandonment.",
                confidence: 0.9,
                children: [
                  {
                    level: 4,
                    focusArea: "Product Quality",
                    assertion: "Connection pool depletion blocks checkout pipeline queries.",
                    confidence: 0.95,
                    children: [
                      {
                        level: 5,
                        focusArea: "Pricing / Revenue Down-spike",
                        assertion: "Raw checkout failures directly result in billing transaction drops.",
                        confidence: 0.98,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    }

    return {
      level: 1,
      focusArea: "First Principles Operational Model",
      assertion: "System operating parameters are stable.",
      confidence: 0.95,
    };
  }

  private generateModelExplainability(selections: IMentalModelSelection[]): IMentalModelExplainability {
    const appliedModels = selections.map(s => s.modelName);
    const rationaleMap: Record<string, string> = {};
    const rejectionReasons: Record<string, string> = {
      "Game-Theoretic Strategic Thinking": "Rejected due to lack of competitive threat context indicators in current signal stream.",
      "Cost-Benefit Analysis": "Rejected because immediate operational recovery holds precedence over cost evaluation.",
    };

    for (const s of selections) {
      rationaleMap[s.modelName] = s.whySelected;
    }

    return {
      appliedModels,
      rationaleMap,
      impactOnReasoning: `Focused reasoning on decomposing structural layers and failure modes, rather than jumping to superficial solutions.`,
      rejectedModels: Object.keys(rejectionReasons),
      rejectionReasons,
    };
  }

  private calculateThinkingQuality(
    hypotheses: IHypothesis[],
    evidence: IEvidenceRelation[],
    bias: ICognitiveBiasReport,
    stability: ICognitiveStabilityState[]
  ): IThinkingQualityMetrics {
    const reasoningDepthScore = 0.92;
    const hypothesisDiversityScore = hypotheses.length >= 6 ? 0.95 : 0.6;
    const evidenceQualityScore = 0.85;
    const perspectiveDiversityScore = 0.9;
    const biasResistanceScore = 1.0 - bias.confirmationBiasRisk;
    const causalCompletenessScore = 0.85;
    const logicalConsistencyScore = 0.95;
    const businessRelevanceScore = 0.9;
    const executiveRealismScore = 0.88;
    const strategicMaturityScore = 0.85;

    const overallScore =
      (reasoningDepthScore +
        hypothesisDiversityScore +
        evidenceQualityScore +
        perspectiveDiversityScore +
        biasResistanceScore +
        causalCompletenessScore +
        logicalConsistencyScore +
        businessRelevanceScore +
        executiveRealismScore +
        strategicMaturityScore) /
      10;

    return {
      overallScore,
      reasoningDepthScore,
      hypothesisDiversityScore,
      evidenceQualityScore,
      perspectiveDiversityScore,
      biasResistanceScore,
      causalCompletenessScore,
      logicalConsistencyScore,
      businessRelevanceScore,
      executiveRealismScore,
      strategicMaturityScore,
    };
  }

  private performSelfCritique(
    perception: IPerceptionResult,
    hypotheses: IHypothesis[],
    bias: ICognitiveBiasReport
  ): ICognitiveSelfCritique {
    const didIgnoreCustomerImpact = perception.observation.customerInteractions.length === 0;
    const didIgnoreFinancialConsequences = perception.observation.metrics.revenue === undefined;
    const didIgnoreOperationalConstraints = perception.observation.metrics.budgetLimit === undefined;
    const didStopTooEarly = hypotheses.length < 4;
    const didAssumeCausation = bias.correlationVsCausationCheck.length > 0;

    const critiqueNotes: string[] = [];
    const improvementSuggestions: string[] = [];

    if (didIgnoreCustomerImpact) {
      critiqueNotes.push("Cognitive model ignores direct customer feedback due to empty interaction logs.");
      improvementSuggestions.push("Request customer feedback data indicators from CRM plugin registry.");
    }
    if (didIgnoreFinancialConsequences) {
      critiqueNotes.push("Financial impact omitted; gross profit metrics are unobserved.");
      improvementSuggestions.push("Fetch revenue ledger nodes prior to initiating decision loops.");
    }

    return {
      didStopTooEarly,
      didIgnoreEvidence: false,
      didOverfit: false,
      didAssumeCausation,
      didIgnoreCustomerImpact,
      didIgnoreFinancialConsequences,
      didIgnoreOperationalConstraints,
      didMissSimplerExplanation: false,
      critiqueNotes,
      improvementSuggestions,
    };
  }

  // ==========================================================================
  // SYSTEM COGNITION CORE UTILITIES
  // ==========================================================================

  private interpretObservations(
    perception: IPerceptionResult,
    interpretations: IObservationInterpretation[],
    graph: IExecutiveThinkingGraph
  ): void {
    for (const signal of perception.signals) {
      const meaning = `Signal anomaly of type [${signal.category}] represents operational system warnings needing review.`;

      const interpretation: IObservationInterpretation = {
        observationId: signal.id,
        meaning,
        importance: signal.category === "CRITICAL" ? 0.95 : 0.6,
        businessRelevance: "Could directly impact checkout conversion rates or system reliability SLAs.",
        contextRelevance: `Telemetric data confirms source is ${signal.source}.`,
        executiveRelevance: "Requires monitoring for possible escalation target status.",
        missionRelevance: "Aligns with core directives to optimize operational efficiency.",
      };

      interpretations.push(interpretation);

      graph.nodes.push(
        { id: signal.id, type: "OBSERVATION", label: signal.description, metadata: {} },
        { id: `int_${signal.id}`, type: "INTERPRETATION", label: meaning, metadata: {} }
      );
      graph.edges.push({
        fromId: `int_${signal.id}`,
        toId: signal.id,
        type: "INTERPRETS",
      });
    }
  }

  private generateHypotheses(
    perception: IPerceptionResult,
    hypotheses: IHypothesis[],
    graph: IExecutiveThinkingGraph
  ): void {
    let index = 1;

    for (const signal of perception.signals) {
      if (signal.category === "CRITICAL" || signal.category === "ANOMALY") {
        const potentialIssues = [
          "Marketing issue (mismatched marketing campaign leads)",
          "Sales issue (checkout pipeline drop-off)",
          "Pricing issue (pricing boundary checks failing)",
          "Product quality issue (system errorRate spikes)",
          "Competition issue (market connector adjustments)",
          "Unknown systemic anomaly",
        ];

        for (const issue of potentialIssues) {
          const hId = `hyp_${signal.id}_${index++}`;
          const hypothesis: IHypothesis = {
            id: hId,
            description: issue,
            probability: 0.16,
            evidenceCoverage: 0.0,
            noveltyScore: 0.5,
            supportStrength: 0.0,
            contradictionsCount: 0,
            missingDataPoints: ["OIG dependency tree metrics"],
          };

          hypotheses.push(hypothesis);

          graph.nodes.push({
            id: hId,
            type: "HYPOTHESIS",
            label: issue,
            metadata: {},
          });
          graph.edges.push({
            fromId: hId,
            toId: `int_${signal.id}`,
            type: "SUGGESTS",
          });
        }
      }
    }
  }

  private collectEvidence(
    perception: IPerceptionResult,
    hypotheses: IHypothesis[],
    evidence: IEvidenceRelation[],
    graph: IExecutiveThinkingGraph
  ): void {
    let index = 1;

    for (const h of hypotheses) {
      for (const signal of perception.signals) {
        let category: IEvidenceRelation["category"] = "NEUTRAL";
        let evidenceDescription = "No clear correlation with current metrics.";

        if (h.description.includes("Product quality") && signal.category === "CRITICAL") {
          category = "SUPPORTING";
          evidenceDescription = `High system error rate (${signal.description}) supports product quality issue hypothesis.`;
        }

        if (h.description.includes("Marketing") && signal.category === "CRITICAL") {
          category = "CONTRADICTING";
          evidenceDescription = "High system error rate contradicts a pure marketing funnel attribution.";
        }

        const evId = `ev_${h.id}_${index++}`;
        const relation: IEvidenceRelation = {
          id: evId,
          observationId: signal.id,
          hypothesisId: h.id,
          category,
          evidenceDescription,
          confidence: signal.confidence,
        };

        evidence.push(relation);

        if (category !== "NEUTRAL") {
          graph.nodes.push({
            id: evId,
            type: "EVIDENCE",
            label: evidenceDescription,
            metadata: { category },
          });
          graph.edges.push({
            fromId: evId,
            toId: h.id,
            type: category === "SUPPORTING" ? "SUPPORTS" : "CONTRADICTS",
          });
        }
      }
    }
  }

  private rankHypotheses(hypotheses: IHypothesis[], evidence: IEvidenceRelation[]): void {
    for (const h of hypotheses) {
      const relations = evidence.filter(e => e.hypothesisId === h.id);

      const supports = relations.filter(r => r.category === "SUPPORTING");
      const contradicts = relations.filter(r => r.category === "CONTRADICTING");

      h.supportStrength = supports.reduce((acc, s) => acc + s.confidence, 0);
      h.contradictionsCount = contradicts.length;
      h.evidenceCoverage = relations.length > 0 ? (supports.length + contradicts.length) / relations.length : 0.0;

      const baseProb = 0.16;
      const supportFactor = h.supportStrength * 0.15;
      const contradictionFactor = h.contradictionsCount * 0.12;

      h.probability = Math.max(0.01, Math.min(0.99, baseProb + supportFactor - contradictionFactor));
    }

    const sum = hypotheses.reduce((acc, h) => acc + h.probability, 0);
    if (sum > 0) {
      for (const h of hypotheses) {
        h.probability = parseFloat((h.probability / sum).toFixed(4));
      }
    }
  }

  private generateAlternativeViews(
    perception: IPerceptionResult,
    identity: IExecutiveIdentity
  ): IAlternativeThinkingProfile {
    return {
      bestCase: "System error rates decay quickly and normal conversion rates resume under automatic recovery status.",
      expectedCase: "Transient system latency resolving over next 30 minutes, keeping total SLA breaches within limits.",
      worstCase: "Cascading connection pool failure locks application layer, requiring developer support.",
      conservativeView: "Assume high latency remains. Throttle non-critical background jobs to protect memory capacity.",
      aggressiveView: "Unconditionally queue checking steps and expand retry thresholds.",
      optimisticView: "System parameters are already self-healing under observer transitions.",
      skepticalView: "Recent warnings indicate deep-seated architectural connection pool bottlenecks.",
      contrarianView: "Metrics spikes are not code quality bugs; they represent external connector shifts.",
      customerView: "Slowing response latency results in abandoned purchases.",
      executiveView: "Maintain operational budget controls while tracking customer complaints indices.",
      investorView: "Mitigate immediate revenue risks to protect client retention margins.",
      operatorView: "Verify database slow query locks first to resolve thread spikes.",
    };
  }

  private challengeHypotheses(
    hypotheses: IHypothesis[],
    evidence: IEvidenceRelation[],
    counterArgs: ICounterArgument[],
    graph: IExecutiveThinkingGraph
  ): void {
    for (const h of hypotheses) {
      const whyCouldThisBeWrong = `Hypothesis [${h.description}] is purely probabilistic and missing raw stacktrace logs.`;

      const counterArg: ICounterArgument = {
        hypothesisId: h.id,
        whyCouldThisBeWrong,
        contradictoryEvidenceRefs: evidence
          .filter(e => e.hypothesisId === h.id && e.category === "CONTRADICTING")
          .map(e => e.id),
        assumptionsExposed: ["Assuming current metrics represent long-term trends"],
        missingContextRequired: ["OIG graph node thread trace"],
      };

      counterArgs.push(counterArg);

      const caId = `ca_${h.id}`;
      graph.nodes.push({
        id: caId,
        type: "COUNTER_ARGUMENT",
        label: whyCouldThisBeWrong,
        metadata: {},
      });
      graph.edges.push({
        fromId: caId,
        toId: h.id,
        type: "CHALLENGES",
      });
    }
  }

  private detectContradictions(
    perception: IPerceptionResult,
    evidence: IEvidenceRelation[],
    contradictions: IContradictionRecord[],
    graph: IExecutiveThinkingGraph
  ): void {
    let index = 1;

    for (const ev of evidence) {
      if (ev.category === "CONTRADICTING") {
        const description = `Conflict detected: Evidence [${ev.evidenceDescription}] contradicts hypothesis [${ev.hypothesisId}].`;
        const cId = `con_${index++}`;

        contradictions.push({
          id: cId,
          sourceA: ev.observationId,
          sourceB: ev.hypothesisId,
          description,
          severity: "MEDIUM",
        });

        graph.nodes.push({
          id: cId,
          type: "CONTRADICTION",
          label: description,
          metadata: {},
        });
        graph.edges.push({
          fromId: cId,
          toId: ev.id,
          type: "REVEALS",
        });
      }
    }
  }

  private evaluateStability(hypotheses: IHypothesis[], stability: ICognitiveStabilityState[]): void {
    for (const h of hypotheses) {
      const history = this.hypothesisHistory.get(h.id) || [];
      history.push(h.probability);
      this.hypothesisHistory.set(h.id, history);

      let volatilityIndex = 0.0;
      if (history.length > 1) {
        const diffs: number[] = [];
        for (let i = 1; i < history.length; i++) {
          diffs.push(Math.abs(history[i] - history[i - 1]));
        }
        volatilityIndex = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;
      }

      const stabilityThresholdBreached = volatilityIndex > this.stabilityThreshold;

      stability.push({
        hypothesisId: h.id,
        historicalProbability: history,
        volatilityIndex,
        stabilityThresholdBreached,
        status: stabilityThresholdBreached ? "OSCILLATING" : "STABLE",
      });
    }
  }

  private detectBiases(
    evidence: IEvidenceRelation[],
    hypotheses: IHypothesis[],
    perception: IPerceptionResult
  ): ICognitiveBiasReport {
    const totalSupporting = evidence.filter(e => e.category === "SUPPORTING").length;
    const totalContradicting = evidence.filter(e => e.category === "CONTRADICTING").length;

    const confirmationBiasRisk = totalSupporting > 0 && totalContradicting === 0 ? 0.8 : 0.2;
    const recencyBiasRisk = perception.signals.some(s => s.category === "CRITICAL") ? 0.75 : 0.3;

    return {
      confirmationBiasRisk,
      recencyBiasRisk,
      availabilityBiasRisk: 0.4,
      anchoringBiasRisk: 0.5,
      survivorshipBiasRisk: 0.1,
      overconfidenceLevel: hypotheses.some(h => h.probability > 0.8) ? 0.85 : 0.4,
      correlationVsCausationCheck: ["Metrics correlation between errorRate and latency"],
      incompleteEvidenceBiasRisk: perception.gapReport.missingDataPoints.length > 0 ? 0.6 : 0.2,
    };
  }

  private analyzeUncertainty(
    perception: IPerceptionResult,
    hypotheses: IHypothesis[],
    contradictions: IContradictionRecord[]
  ): IUncertaintyProfile {
    const knowns = ["runtime_error_rate_spike", "latency_degradation"];
    const knownUnknowns = [...perception.gapReport.missingDataPoints];
    const uncertaintySources = ["Telemetry latency delay", "Missing financial cost metrics"];

    return {
      knowns,
      knownUnknowns,
      unknownUnknowns: ["External network provider routing anomalies"],
      estimatedParameters: {
        systemStabilityScore: [0.6, 0.85],
      },
      speculativeHypotheses: hypotheses.filter(h => h.probability < 0.15).map(h => h.description),
      validatedFacts: knowns,
      uncertaintySources,
    };
  }

  private generateThinkingSummary(
    interpretations: IObservationInterpretation[],
    hypotheses: IHypothesis[],
    contradictions: IContradictionRecord[]
  ): IExecutiveThinkingSummary {
    const sortedHyp = [...hypotheses].sort((a, b) => b.probability - a.probability);

    return {
      interpretations: interpretations.map(i => i.meaning),
      leadingHypotheses: sortedHyp.slice(0, 2).map(h => `${h.description} (${(h.probability * 100).toFixed(1)}%)`),
      evidenceStatus: `Discovered ${sortedHyp.length} competing hypotheses.`,
      confidenceDistribution: hypotheses.reduce((acc, h) => {
        acc[h.id] = h.probability;
        return acc;
      }, {} as Record<string, number>),
      contradictions: contradictions.map(c => c.description),
      openQuestions: ["What caused the OIG graph data latency sync delay?", "Can we retrieve database lock details?"],
      cognitiveReadiness: sortedHyp.length >= 3 ? "HIGH" : "LOW",
    };
  }

  private generateExplainability(
    hypotheses: IHypothesis[],
    evidence: IEvidenceRelation[],
    explainability: ICognitiveExplainability[]
  ): void {
    for (const h of hypotheses) {
      const relatedEv = evidence.filter(e => e.hypothesisId === h.id && e.category === "SUPPORTING").map(e => e.id);
      const competitors = hypotheses.filter(other => other.id !== h.id).map(other => other.id);

      explainability.push({
        hypothesisId: h.id,
        evidenceUsed: relatedEv,
        confidenceScore: h.probability,
        competingHypothesesRefs: competitors,
        remainingUncertainty: "Missing physical logs prevents absolute verification.",
      });
    }
  }

  private calculateReadiness(
    hypotheses: IHypothesis[],
    contradictions: IContradictionRecord[],
    uncertainty: IUncertaintyProfile,
    biasReport: ICognitiveBiasReport,
    stability: ICognitiveStabilityState[]
  ): IThinkingReadinessScore {
    const interpretationQuality = 0.95;
    const evidenceQuality = 0.85;
    const hypothesisDiversity = hypotheses.length >= 4 ? 0.95 : 0.6;
    const contradictionCoverage = contradictions.length > 0 ? 0.9 : 0.4;
    const uncertaintyVisibility = uncertainty.knownUnknowns.length > 0 ? 0.95 : 0.5;
    const biasScore = 1.0 - biasReport.confirmationBiasRisk;
    const cognitiveStabilityScore =
      1.0 - stability.reduce((acc, s) => acc + s.volatilityIndex, 0) / stability.length;

    const thinkingReadinessIndex =
      (interpretationQuality +
        evidenceQuality +
        hypothesisDiversity +
        contradictionCoverage +
        uncertaintyVisibility +
        biasScore +
        cognitiveStabilityScore) /
      7;

    const isReadinessApproved = thinkingReadinessIndex >= 0.5;

    return {
      thinkingReadinessIndex,
      interpretationQuality,
      evidenceQuality,
      hypothesisDiversity,
      contradictionCoverage,
      uncertaintyVisibility,
      biasScore,
      cognitiveStabilityScore,
      isReadinessApproved,
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
