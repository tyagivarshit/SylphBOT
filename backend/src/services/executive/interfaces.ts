export interface IMission {
  vision: string;
  directives: string[];
  alignmentTargets: string[];
}

export interface IMissionState {
  currentDirectives: string[];
  activeConstraints: string[];
  alignmentAdjustments: Record<string, number>; // weight adjustments for specific targets
  contextualVariables: Record<string, any>;
  lastUpdated: Date;
}

export interface IResponsibility {
  id: string;
  title: string;
  description: string;
  domain: string; // e.g. "finance", "operations", "growth"
  kpiIds: string[];
}

export interface IAuthority {
  id: string;
  action: string; // e.g. "resource:allocate", "budget:approve"
  description: string;
  maxBudgetThreshold?: number;
  hiringLimit?: number;
  approvalRequired: boolean;
}

export interface IBoundary {
  id: string;
  rule: string; // e.g. "no_cross_tenant_resource_sharing", "limit_consecutive_failures"
  description: string;
  isHardLimit: boolean;
  vetoRequired: boolean;
}

export interface IKPIOwnership {
  id: string;
  name: string;
  metricToken: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
}

export interface IDecisionScope {
  id: string;
  decisionType: "strategic" | "tactical" | "operational";
  allowedActions: string[];
  vetoRules: string[];
  jurisdiction: string;
}

export interface ICommunicationProfile {
  style: string; // e.g., "formal", "structured", "direct"
  tone: string; // e.g., "analytical", "objective", "concise"
  channels: string[]; // e.g., "internal_bus", "email", "teams"
  frequency: "realtime" | "batched" | "on_demand";
  protocols: string[];
}

export interface IDelegationProfile {
  allowedSubagentRoles: string[];
  delegableTaskTypes: string[];
  requiresApprovalAboveThreshold: number;
  autoDelegationEnabled: boolean;
}

export interface IEscalationProfile {
  escalationTriggers: string[];
  notificationTargets: string[];
  gracePeriodMs: number;
  fallbackStatus: ExecutiveLifecycleState; // Status to transition to upon breach
}

export interface ISuccessCriteria {
  id: string;
  description: string;
  kpiId: string;
  threshold: number;
  timeframeDays: number;
}

export interface IFailureCriteria {
  id: string;
  description: string;
  triggerMetric: string;
  breachThreshold: number;
  consecutiveOccurrences: number;
}

export interface IExecutivePersonality {
  traits: Record<string, number>; // e.g. { riskTolerance: 0.3, analyticalFocus: 0.9 }
  decisionStyle: "analytical" | "consensus" | "directive" | "conceptual";
  cognitiveBiasesToManage: string[];

  // Enterprise behavioral parameters (optional for backward-compatibility)
  analyticalDepth?: number; // 0.0 - 1.0
  creativity?: number; // 0.0 - 1.0
  riskAppetite?: number; // 0.0 - 1.0
  decisionSpeed?: number; // 0.0 - 1.0
  evidenceRequirement?: number; // 0.0 - 1.0
  collaborationTendency?: number; // 0.0 - 1.0
  communicationPreference?: "concise" | "detailed" | "exception_only";
  autonomyLevel?: number; // 0.0 - 1.0
  adaptability?: number; // 0.0 - 1.0
}

export interface IExecutiveCapabilityProfile {
  allowedDecisionCategories: ("operational" | "tactical" | "strategic")[];
  allowedReasoningDomains: string[];
  executableCapabilities: string[];
  collaborationCapabilities: string[];
  delegationCapabilities: string[];
  reviewCapabilities: string[];
  approvalCapabilities: string[];
}

export interface IDecisionAuthorityRule {
  action: string; // e.g., "budget:spend", "agent:hire"
  ownershipRole: string; // e.g., "CHIEF_OPERATIONS", "CEO"
  approvalRequired: boolean;
  approvalThreshold?: number; // threshold above which approval is required
  approverRoles?: string[]; // roles authorized to approve
  delegable: boolean;
  delegationRules?: string[]; // context or safety rules for delegation
  escalationThresholds?: Record<string, number>; // metrics that trigger escalation
  overrideRoles?: string[]; // roles authorized to override vetoes
  executionRoles?: string[]; // roles authorized to execute
}

export interface IDecisionAuthorityMatrix {
  rules: IDecisionAuthorityRule[];
}

export type BusinessOutcomeCategory =
  | "GROWTH"
  | "EFFICIENCY"
  | "CUSTOMER_SUCCESS"
  | "RISK_REDUCTION"
  | "OPERATIONAL_EXCELLENCE"
  | "COST_OPTIMIZATION"
  | "REVENUE_IMPROVEMENT"
  | "RETENTION_IMPROVEMENT"
  | "BUSINESS_HEALTH";

export interface IBusinessOutcome {
  id: string;
  category: BusinessOutcomeCategory;
  name: string;
  description: string;
  targetMetricToken: string; // links to a KPI metric
  targetValue: number;
  currentValue: number;
  unit: string;
  weight: number; // 0.0 - 1.0 (relative importance of this outcome)
  higherIsBetter: boolean;
  status: "ON_TRACK" | "AT_RISK" | "CRITICAL";
  atRiskThreshold?: number; // custom ratio or absolute threshold (e.g. 0.90 for 90% of target)
  criticalThreshold?: number; // custom ratio or absolute threshold (e.g. 0.75 for 75% of target)
}

export interface IExecutiveHealthSignals {
  decisionConsistency: number; // 0.0 - 1.0
  executionSuccessRate: number; // 0.0 - 1.0
  escalationCount: number;
  policyViolationCount: number;
  humanInterventionCount: number;
  confidenceScore: number; // 0.0 - 1.0
  recoveryStatus: "NONE" | "RECOVERING" | "RECOVERED" | "FAILED";
}

export type ExecutiveHealthStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface IExecutiveHealth {
  status: ExecutiveHealthStatus;
  score: number; // 0 - 100
  signals: IExecutiveHealthSignals;
  calculatedAt: Date;
  history?: Array<{
    timestamp: string;
    signalType: string;
    value: any;
  }>;
}

export type ExecutiveLifecycleState =
  | "DRAFT"
  | "CONFIGURED"
  | "LEARNING"
  | "ACTIVE"
  | "REVIEW"
  | "OPTIMIZING"
  | "SUSPENDED"
  | "RETIRED"
  | "STANDBY"
  | "WARNING"
  | "OBSERVATION"
  | "RECOVERY";

export interface IExecutiveDNA {
  role: string;
  version: string;
  mission: IMission;
  responsibilities: IResponsibility[];
  authorities: IAuthority[]; // Deprecated, kept for backward compatibility
  boundaries: IBoundary[];
  kpiOwnership: IKPIOwnership[];
  decisionScope: IDecisionScope[];
  communicationProfile: ICommunicationProfile;
  delegationProfile: IDelegationProfile;
  escalationProfile: IEscalationProfile;
  successCriteria: ISuccessCriteria[];
  failureCriteria: IFailureCriteria[];
  personalityModel: IExecutivePersonality;

  // Sprint 4 Phase 7 Versioning Fields
  dnaId?: string;
  revision?: number;
  checksum?: string;
  compatibilityVersion?: string;
  schemaVersion?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;

  // Hardened & Enterprise fields (optional for backward compatibility)
  capabilityProfile?: IExecutiveCapabilityProfile;
  decisionAuthorityMatrix?: IDecisionAuthorityMatrix;
  businessOutcomes?: IBusinessOutcome[];
  goalAlignment?: IGoalAlignmentProfile;
  evolutionMetadata?: IExecutiveEvolutionMetadata;
}

export interface IExecutiveIdentity {
  id: string;
  tenantId: string;
  role: string;
  name: string;
  status: ExecutiveLifecycleState;
  dna: IExecutiveDNA;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  // Hardened & Enterprise fields (optional for backward compatibility)
  missionState?: IMissionState;
  businessOutcomes?: IBusinessOutcome[];
  healthSignals?: IExecutiveHealthSignals;
  health?: IExecutiveHealth;
  version?: number;
  goalAlignment?: IGoalAlignmentProfile;
  evolutionMetadata?: IExecutiveEvolutionMetadata;
  diagnostics?: IExecutiveDiagnostics;
}

export interface IGoalAlignmentProfile {
  longTermMissionId: string;
  strategicObjectiveIds: string[];
  tacticalObjectiveIds: string[];
  operationalObjectiveIds: string[];
  currentPriorityIds: string[];
  businessOutcomeIds: string[];
  organizationNodeId: string;
}

export interface ICapabilityRequest {
  requestId: string;
  requesterId: string;
  targetCapability: string;
  context: Record<string, any>;
  timestamp: string;
}

export interface ICapabilityResponse {
  requestId: string;
  status: "GRANTED" | "DENIED" | "DELEGATED" | "ESCALATED";
  reason?: string;
  delegationDetails?: IDelegationRequest;
  escalationDetails?: IEscalationRequest;
  authorityNegotiationMetadata?: Record<string, any>;
}

export interface IDelegationRequest {
  delegationId: string;
  delegateeId: string;
  delegatedCapability: string;
  constraints: Record<string, any>;
  expiresAt?: string;
}

export interface IEscalationRequest {
  escalationId: string;
  targetRole: string;
  reason: string;
  context: Record<string, any>;
}

export interface IExecutiveDiagnostics {
  decisionQualityIndex: number; // 0.0 - 1.0
  executionSuccessRate: number; // 0.0 - 1.0
  averageConfidenceScore: number; // 0.0 - 1.0
  policyComplianceScore: number; // 0.0 - 1.0
  authorityUtilizationRatio: number; // 0.0 - 1.0
  healthScore: number; // 0 - 100
  outcomeOwnershipCount: number;
  capabilityCoverageRatio: number; // 0.0 - 1.0
  lifecycleState: ExecutiveLifecycleState;
  calculatedAt: string;
}

export interface IExecutiveEvolutionMetadata {
  dnaVersion: string;
  identityVersion: number;
  compatibilityVersion: string;
  migrationHistory: Array<{
    fromVersion: string;
    toVersion: string;
    migratedAt: string;
    status: "SUCCESS" | "FAILED";
  }>;
  rollbackMetadata?: {
    targetVersion: string;
    canRollback: boolean;
    rollbackScriptReference?: string;
  };
  upgradePath?: string[];
  deprecationState?: {
    isDeprecated: boolean;
    deprecatedAt?: string;
    supersededByDnaVersion?: string;
  };
}

export interface IDecisionExplainability {
  decisionId: string;
  executiveId: string;
  authoritySourceId: string;
  capabilitySourceId: string;
  missionSourceId: string;
  goalSourceId: string;
  policySourceId: string;
  evidenceReferences: string[];
  confidenceMetadata: {
    score: number;
    uncertaintyRange: [number, number];
    confidenceLevel: "low" | "medium" | "high";
  };
  executionTraceReference: string;
  timestamp: string;
}

export interface IExecutiveRepository {
  getDNA(role: string): Promise<IExecutiveDNA | null>;
  saveDNA(dna: IExecutiveDNA): Promise<void>;
  getExecutive(tenantId: string, id: string): Promise<IExecutiveIdentity | null>;
  saveExecutive(executive: IExecutiveIdentity, expectedVersion?: number): Promise<IExecutiveIdentity>;
  listExecutives(tenantId: string): Promise<IExecutiveIdentity[]>;
  deleteExecutive(tenantId: string, id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface IDNARepository {
  getDNA(role: string): Promise<IExecutiveDNA | null>;
  saveDNA(dna: IExecutiveDNA): Promise<void>;
  listAllDNA(): Promise<IExecutiveDNA[]>;
}

