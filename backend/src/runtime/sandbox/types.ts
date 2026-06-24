export interface SyntheticScenario {
  id: string;
  name: string;
  description: string;
  initialState: Record<string, any>;
  steps: Array<{
    eventId: string;
    payload: Record<string, any>;
  }>;
  expectedOutcomes: Record<string, any>;
}

export interface ReplaySession {
  sessionId: string;
  historicalTraceId: string;
  eventsReplayed: number;
  decisionsMatched: number;
  mismatchLogs: string[];
}

export interface ExperimentVariant {
  variantId: string;
  name: string;
  promptTemplateId: string;
  weight: number; // A/B traffic split (0.0 to 1.0)
  metrics: {
    invocations: number;
    successes: number;
    latencyMsSum: number;
    estimatedCostUsd: number;
  };
}

export interface SafetyReport {
  isSafe: boolean;
  riskScore: number; // Range 0.0 (safe) to 1.0 (critical)
  violations: string[];
  hallucinationIndicators: string[];
  permissionsChecked: number;
}

export interface DecisionComparison {
  similarityScore: number; // Range 0.0 to 1.0
  intentMatch: boolean;
  actionMatch: boolean;
  rawDiff: string;
}

export interface CertificationReport {
  eligible: boolean;
  tenantId: string;
  variantId: string;
  metrics: {
    successRate: number;
    safetyScore: number;
    averageLatencyMs: number;
    totalCostUsd: number;
  };
  rejectionReasons: string[];
  certifiedAt: Date;
  approverId: string;
}
