import crypto from "crypto";
import prisma from "../../config/prisma";

type JsonRecord = Record<string, unknown>;

type RuntimeOptimization = {
  decisionKey: string;
  decisionType: string;
  status: string;
  confidence: number;
  riskScore: number;
  adjustedBy: number;
  expectedUplift: number;
  updatedAt: Date | null;
};

type RuntimeOverride = {
  scope: string;
  action: string;
  reason: string;
  priority: number;
  expiresAt: Date;
  targetType: string;
  targetId: string | null;
};

export type IntelligenceRuntimeInfluence = {
  businessId: string;
  leadId: string | null;
  generatedAt: string;
  stale: boolean;
  staleMinutes: number;
  sourceSnapshotKey: string | null;
  policyVersion: number;
  overrideScopes: Record<string, RuntimeOverride>;
  predictions: Record<string, number>;
  forecasts: Record<string, number>;
  optimizations: Record<string, RuntimeOptimization>;
  anomalies: {
    open: string[];
    critical: string[];
    recent: string[];
  };
  experiments: {
    winners: Record<string, string | null>;
    assignments: Record<string, string | null>;
    states: Record<string, string>;
  };
  recommendations: {
    openCount: number;
    highPriorityActions: string[];
  };
  simulations: {
    bestScenarioType: string | null;
    bestRevenueDelta: number;
    queueDelta: number;
  };
  modelHealth: {
    warning: boolean;
    critical: boolean;
    rolloutPaused: boolean;
  };
  controls: {
    ai: {
      tone: string;
      urgencyBoost: number;
      offerTimingShiftMinutes: number;
      escalationAdvanceMinutes: number;
      forceHumanEscalation: boolean;
    };
    crm: {
      leadScoreDelta: number;
      priorityDelta: number;
      segmentShift: string | null;
    };
    reception: {
      spamThreshold: number;
      forceHumanQueue: boolean;
      escalationBias: number;
    };
    assignment: {
      loadBalanceBias: number;
      escalationBoost: number;
    };
    booking: {
      depositRequired: boolean;
      reminderIntensity: number;
      waitlistPriorityBoost: number;
      noShowMitigationLevel: number;
      slotStrategy: string;
    };
    commerce: {
      priceMultiplier: number;
      discountAutoApproveMaxPercent: number;
      renewalAdvanceHours: number;
      dunningRetryWindowHours: number;
      refundManualReviewThresholdMinor: number;
      chargebackRiskGate: number;
    };
    autonomous: {
      autoDispatchScoreFloor: number;
      cooldownHours: number;
      budgetMultiplier: number;
      channelBias: Record<string, number>;
      paused: boolean;
    };
  };
};

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const CACHE_TTL_MS = 15_000;

const runtimeCache = new Map<
  string,
  {
    expiresAt: number;
    value: IntelligenceRuntimeInfluence;
  }
>();

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const mean = (values: number[]) =>
  values.length
    ? values.reduce((acc, current) => acc + current, 0) / values.length
    : 0;

const hashStable = (value: unknown) => {
  const normalize = (input: unknown): unknown => {
    if (input instanceof Date) {
      return input.toISOString();
    }

    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }

    if (!input || typeof input !== "object") {
      return input;
    }

    return Object.keys(input as JsonRecord)
      .sort()
      .reduce<JsonRecord>((acc, key) => {
        acc[key] = normalize((input as JsonRecord)[key]);
        return acc;
      }, {});
  };

  return crypto
    .createHash("sha1")
    .update(JSON.stringify(normalize(value)))
    .digest("hex");
};

const assignExperimentVariant = ({
  experimentKey,
  assignmentVersion,
  entityId,
  variants,
}: {
  experimentKey: string;
  assignmentVersion: number;
  entityId: string;
  variants: string[];
}) => {
  if (!variants.length) {
    return null;
  }

  const hash = hashStable({
    experimentKey,
    assignmentVersion,
    entityId,
  });
  const bucket = parseInt(hash.slice(0, 8), 16);
  const index = Number.isFinite(bucket) ? bucket % variants.length : 0;

  return variants[Math.max(0, Math.min(variants.length - 1, index))];
};

const globalForIntelligence = globalThis as typeof globalThis & {
  __sylphIntelligenceStore?: {
    featureSnapshots: Map<string, any>;
    forecasts: Map<string, any>;
    predictions: Map<string, any>;
    optimizations: Map<string, any>;
    experiments: Map<string, any>;
    recommendations: Map<string, any>;
    anomalies: Map<string, any>;
    simulations: Map<string, any>;
    modelRegistry: Map<string, any>;
    policies: Map<string, any>;
    overrides: Map<string, any>;
    runMarkers: Set<string>;
    ownerFeed: any[];
  };
};

const getStore = () => globalForIntelligence.__sylphIntelligenceStore;

const reducePredictionMap = ({
  rows,
}: {
  rows: any[];
}) => {
  const grouped = rows.reduce<Record<string, number[]>>((acc, row) => {
    const key = String(row.predictionType || "").trim();

    if (!key) {
      return acc;
    }

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(toNumber(row.score));
    return acc;
  }, {});

  return Object.keys(grouped).reduce<Record<string, number>>((acc, key) => {
    acc[key] = clamp(mean(grouped[key]), 0, 1);
    return acc;
  }, {});
};

const normalizeOptimizationRow = (row: any): RuntimeOptimization => {
  const recommendedValue = toRecord(row.recommendedValue);

  return {
    decisionKey: String(row.decisionKey || ""),
    decisionType: String(row.decisionType || ""),
    status: String(row.status || "RECOMMENDED"),
    confidence: clamp(toNumber(row.confidence, 0), 0, 1),
    riskScore: clamp(toNumber(row.riskScore, 1), 0, 1),
    adjustedBy: clamp(toNumber(recommendedValue.adjustedBy, 0), -0.5, 0.5),
    expectedUplift: clamp(toNumber(row.expectedUplift, 0), -1, 1),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt
        : row.createdAt instanceof Date
        ? row.createdAt
        : null,
  };
};

const statusRank = (status: string) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "APPLIED") return 4;
  if (normalized === "APPROVED") return 3;
  if (normalized === "RECOMMENDED") return 2;
  if (normalized === "ROLLED_BACK") return 1;
  return 0;
};

const reduceOptimizationMap = (rows: any[]) => {
  const map: Record<string, RuntimeOptimization> = {};

  for (const row of rows) {
    const normalized = normalizeOptimizationRow(row);

    if (!normalized.decisionType) {
      continue;
    }

    const current = map[normalized.decisionType];

    if (!current) {
      map[normalized.decisionType] = normalized;
      continue;
    }

    if (statusRank(normalized.status) > statusRank(current.status)) {
      map[normalized.decisionType] = normalized;
      continue;
    }

    if (statusRank(normalized.status) === statusRank(current.status)) {
      const normalizedUpdated = normalized.updatedAt?.getTime() || 0;
      const currentUpdated = current.updatedAt?.getTime() || 0;

      if (
        normalized.confidence > current.confidence ||
        normalizedUpdated > currentUpdated
      ) {
        map[normalized.decisionType] = normalized;
      }
    }
  }

  return map;
};

const reduceForecastMap = (rows: any[]) => {
  const byMetric: Record<
    string,
    {
      createdAt: number;
      predictedValue: number;
    }
  > = {};

  for (const row of rows) {
    const metric = String(row.metric || "").trim();

    if (!metric) {
      continue;
    }

    const createdAt =
      row.createdAt instanceof Date
        ? row.createdAt.getTime()
        : row.windowStart instanceof Date
        ? row.windowStart.getTime()
        : 0;

    const current = byMetric[metric];

    if (!current || createdAt >= current.createdAt) {
      byMetric[metric] = {
        createdAt,
        predictedValue: toNumber(row.predictedValue),
      };
    }
  }

  return Object.keys(byMetric).reduce<Record<string, number>>((acc, key) => {
    acc[key] = byMetric[key].predictedValue;
    return acc;
  }, {});
};

const reduceAnomalyState = (rows: any[]) => {
  const open = new Set<string>();
  const critical = new Set<string>();
  const recent = new Set<string>();

  for (const row of rows) {
    const type = String(row.anomalyType || "").trim();

    if (!type) {
      continue;
    }

    if (String(row.status || "").toUpperCase() !== "RESOLVED") {
      open.add(type);
    }

    if (["HIGH", "CRITICAL"].includes(String(row.severity || "").toUpperCase())) {
      critical.add(type);
    }

    recent.add(type);
  }

  return {
    open: Array.from(open),
    critical: Array.from(critical),
    recent: Array.from(recent),
  };
};

const reduceExperimentState = ({
  rows,
  leadId,
}: {
  rows: any[];
  leadId: string | null;
}) => {
  const winners: Record<string, string | null> = {};
  const assignments: Record<string, string | null> = {};
  const states: Record<string, string> = {};

  for (const row of rows) {
    const key = String(row.experimentKey || "").trim();

    if (!key) {
      continue;
    }

    const objective = String(row.objective || key).toLowerCase();
    const label = objective.includes("followup")
      ? "followup_timing"
      : objective.includes("discount")
      ? "discount_policy"
      : key;

    winners[label] = String(row.winnerVariant || "").trim() || null;
    states[label] = String(row.status || "RUNNING").toUpperCase();

    if (leadId) {
      const options = Array.isArray(toRecord(row.variants).options)
        ? (toRecord(row.variants).options as unknown[])
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      const assignmentVersion = Math.max(1, Math.floor(toNumber(row.assignmentVersion, 1)));

      assignments[label] =
        assignExperimentVariant({
          experimentKey: key,
          assignmentVersion,
          entityId: leadId,
          variants: options,
        }) || null;
    }
  }

  return {
    winners,
    assignments,
    states,
  };
};

const reduceSimulationState = (rows: any[]) => {
  if (!rows.length) {
    return {
      bestScenarioType: null,
      bestRevenueDelta: 0,
      queueDelta: 0,
    };
  }

  const best = [...rows]
    .map((row) => ({
      scenarioType: String(row.scenarioType || "").trim() || null,
      revenueDelta: toNumber(toRecord(row.delta).revenue, 0),
      queueDelta: toNumber(toRecord(row.delta).queueLag, 0),
      confidence: clamp(toNumber(row.confidence, 0), 0, 1),
    }))
    .sort((left, right) => {
      const leftScore = left.revenueDelta * (0.5 + left.confidence);
      const rightScore = right.revenueDelta * (0.5 + right.confidence);
      return rightScore - leftScore;
    })[0];

  return {
    bestScenarioType: best.scenarioType,
    bestRevenueDelta: best.revenueDelta,
    queueDelta: best.queueDelta,
  };
};

const reduceOverrideMap = (rows: any[], asOf: Date) => {
  const scoped: Record<string, RuntimeOverride> = {};

  for (const row of rows) {
    const scope = String(row.scope || "").trim().toUpperCase();

    if (!scope) {
      continue;
    }

    const expiresAt =
      row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);

    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
      continue;
    }

    if (expiresAt.getTime() <= asOf.getTime()) {
      continue;
    }

    const candidate: RuntimeOverride = {
      scope,
      action: String(row.action || "").trim().toUpperCase() || "NONE",
      reason: String(row.reason || "").trim() || "runtime_override",
      priority: Math.max(1, Math.floor(toNumber(row.priority, 1))),
      expiresAt,
      targetType: String(row.targetType || "BUSINESS").trim().toUpperCase(),
      targetId: String(row.targetId || "").trim() || null,
    };

    const existing = scoped[scope];

    if (!existing) {
      scoped[scope] = candidate;
      continue;
    }

    if (candidate.priority > existing.priority) {
      scoped[scope] = candidate;
      continue;
    }

    if (candidate.priority === existing.priority) {
      if (candidate.expiresAt.getTime() > existing.expiresAt.getTime()) {
        scoped[scope] = candidate;
      }
    }
  }

  return scoped;
};

const readRuntimeRowsFromMemory = ({
  businessId,
  leadId,
}: {
  businessId: string;
  leadId: string | null;
}) => {
  const store = getStore();

  if (!store) {
    return {
      policy: null,
      overrides: [],
      featureSnapshot: null,
      forecasts: [],
      predictions: [],
      businessPredictions: [],
      optimizations: [],
      recommendations: [],
      anomalies: [],
      experiments: [],
      simulations: [],
      modelRegistry: [],
    };
  }

  const now = Date.now();
  const predictions = Array.from(store.predictions.values()).filter((row) => {
    if (row.businessId !== businessId) {
      return false;
    }

    if (leadId && row.entityType === "LEAD" && row.entityId === leadId) {
      if (row.validUntil instanceof Date && row.validUntil.getTime() <= now) {
        return false;
      }

      return true;
    }

    return false;
  });

  const businessPredictions = Array.from(store.predictions.values()).filter((row) => {
    if (row.businessId !== businessId) {
      return false;
    }

    if (row.entityType !== "LEAD") {
      return false;
    }

    if (row.validUntil instanceof Date && row.validUntil.getTime() <= now) {
      return false;
    }

    return true;
  });

  const policies = Array.from(store.policies.values())
    .filter((row) => row.businessId === businessId && row.isActive)
    .sort((left, right) => {
      if (toNumber(right.version) !== toNumber(left.version)) {
        return toNumber(right.version) - toNumber(left.version);
      }

      return (
        (right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0) -
        (left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0)
      );
    });

  const featureSnapshot = Array.from(store.featureSnapshots.values())
    .filter((row) => row.businessId === businessId)
    .sort((left, right) => {
      const leftTime = left.snapshotAt instanceof Date ? left.snapshotAt.getTime() : 0;
      const rightTime = right.snapshotAt instanceof Date ? right.snapshotAt.getTime() : 0;
      return rightTime - leftTime;
    })[0];

  return {
    policy: policies[0] || null,
    overrides: Array.from(store.overrides.values()).filter(
      (row) => row.businessId === businessId && row.isActive
    ),
    featureSnapshot: featureSnapshot || null,
    forecasts: Array.from(store.forecasts.values()).filter(
      (row) => row.businessId === businessId
    ),
    predictions,
    businessPredictions,
    optimizations: Array.from(store.optimizations.values()).filter(
      (row) => row.businessId === businessId
    ),
    recommendations: Array.from(store.recommendations.values()).filter(
      (row) => row.businessId === businessId
    ),
    anomalies: Array.from(store.anomalies.values()).filter(
      (row) => row.businessId === businessId
    ),
    experiments: Array.from(store.experiments.values()).filter(
      (row) => row.businessId === businessId
    ),
    simulations: Array.from(store.simulations.values()).filter(
      (row) => row.businessId === businessId
    ),
    modelRegistry: Array.from(store.modelRegistry.values()).filter(
      (row) => row.businessId === businessId
    ),
  };
};

const readRuntimeRowsFromDb = async ({
  businessId,
  leadId,
  asOf,
}: {
  businessId: string;
  leadId: string | null;
  asOf: Date;
}) => {
  const [
    policy,
    overrides,
    featureSnapshot,
    forecasts,
    predictions,
    businessPredictions,
    optimizations,
    recommendations,
    anomalies,
    experiments,
    simulations,
    modelRegistry,
  ] = await Promise.all([
    prisma.intelligencePolicy.findFirst({
      where: {
        businessId,
        isActive: true,
        effectiveFrom: {
          lte: asOf,
        },
      },
      orderBy: [
        {
          version: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
    }),
    prisma.manualIntelligenceOverride.findMany({
      where: {
        businessId,
        isActive: true,
        expiresAt: {
          gt: asOf,
        },
      },
      orderBy: [
        {
          priority: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      take: 80,
    }),
    prisma.featureSnapshotLedger.findFirst({
      where: {
        businessId,
      },
      orderBy: {
        snapshotAt: "desc",
      },
    }),
    prisma.forecastLedger.findMany({
      where: {
        businessId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 120,
    }),
    leadId
      ? prisma.predictionLedger.findMany({
          where: {
            businessId,
            entityType: "LEAD",
            entityId: leadId,
            OR: [
              {
                validUntil: null,
              },
              {
                validUntil: {
                  gt: asOf,
                },
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 80,
        })
      : Promise.resolve([]),
    prisma.predictionLedger.findMany({
      where: {
        businessId,
        entityType: "LEAD",
        OR: [
          {
            validUntil: null,
          },
          {
            validUntil: {
              gt: asOf,
            },
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    }),
    prisma.optimizationDecisionLedger.findMany({
      where: {
        businessId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 120,
    }),
    prisma.recommendationLedger.findMany({
      where: {
        businessId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 120,
    }),
    prisma.anomalyLedger.findMany({
      where: {
        businessId,
        status: {
          in: ["OPEN", "SUPPRESSED"],
        },
      },
      orderBy: {
        detectedAt: "desc",
      },
      take: 120,
    }),
    prisma.experimentLedger.findMany({
      where: {
        businessId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 30,
    }),
    prisma.simulationLedger.findMany({
      where: {
        businessId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 60,
    }),
    prisma.modelRegistryLedger.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 20,
    }),
  ]);

  return {
    policy,
    overrides,
    featureSnapshot,
    forecasts,
    predictions,
    businessPredictions,
    optimizations,
    recommendations,
    anomalies,
    experiments,
    simulations,
    modelRegistry,
  };
};

const offerShiftFromOptimization = (optimization?: RuntimeOptimization) => {
  if (!optimization) {
    return 0;
  }

  return clamp(optimization.adjustedBy * -600, -180, 240);
};

const deriveControls = ({
  asOf,
  policy,
  overrides,
  predictions,
  forecasts,
  optimizations,
  anomalies,
  simulations,
  modelRegistry,
  stale,
}: {
  asOf: Date;
  policy: any | null;
  overrides: Record<string, RuntimeOverride>;
  predictions: Record<string, number>;
  forecasts: Record<string, number>;
  optimizations: Record<string, RuntimeOptimization>;
  anomalies: {
    open: string[];
    critical: string[];
    recent: string[];
  };
  simulations: {
    bestScenarioType: string | null;
    bestRevenueDelta: number;
    queueDelta: number;
  };
  modelRegistry: any[];
  stale: boolean;
}) => {
  const closeProbability = clamp(
    toNumber(predictions.close_probability, 0.5),
    0,
    1
  );
  const churnRisk = clamp(toNumber(predictions.churn_risk, 0.45), 0, 1);
  const noShowRisk = clamp(
    toNumber(predictions.no_show_probability, 0.25),
    0,
    1
  );
  const refundRisk = clamp(toNumber(predictions.refund_risk, 0.2), 0, 1);
  const chargebackRisk = clamp(
    toNumber(predictions.chargeback_risk, 0.16),
    0,
    1
  );
  const escalationRisk = clamp(
    toNumber(predictions.escalation_probability, 0.2),
    0,
    1
  );
  const fraudRisk = clamp(toNumber(predictions.fraud_risk, 0.1), 0, 1);
  const vipPotential = clamp(toNumber(predictions.vip_potential, 0.22), 0, 1);
  const pricingOptimization = optimizations.pricing;
  const discountingOptimization = optimizations.discounting;
  const followupTimingOptimization = optimizations.followup_timing;
  const reminderCadenceOptimization = optimizations.reminder_cadence;
  const dunningCadenceOptimization = optimizations.dunning_cadence;
  const renewalTimingOptimization = optimizations.renewal_timing;
  const repAssignmentOptimization = optimizations.rep_assignment;
  const staffingOptimization = optimizations.staffing;
  const queueOptimization = optimizations.queue_prioritization;

  const hasAnomaly = (type: string) => anomalies.open.includes(type);
  const hasCriticalAnomaly = (type: string) => anomalies.critical.includes(type);

  const modelCritical = modelRegistry.some(
    (row) =>
      String(row.driftStatus || "").toUpperCase() === "CRITICAL" ||
      String(row.deploymentState || "").toUpperCase() === "ROLLED_BACK"
  );
  const modelWarning = modelRegistry.some(
    (row) => String(row.driftStatus || "").toUpperCase() === "WARNING"
  );

  const bookingDemandForecast = toNumber(forecasts.booking_demand_forecast, 0);
  const staffingForecast = toNumber(forecasts.staffing_forecast, 0);
  const churnForecast = toNumber(forecasts.churn_forecast, 0);

  const aiTone =
    escalationRisk >= 0.65 || hasAnomaly("conversion_drop")
      ? "confident-proof"
      : closeProbability >= 0.72
      ? "decisive-closer"
      : churnRisk >= 0.62
      ? "supportive-next-step"
      : "human-confident";

  const aiUrgencyBoost = Math.round(
    clamp(
      closeProbability * 30 +
        (1 - churnRisk) * 8 -
        (hasCriticalAnomaly("queue_lag") ? 10 : 0),
      -10,
      35
    )
  );

  const aiOfferTimingShiftMinutes = Math.round(
    clamp(
      toNumber(offerShiftFromOptimization(optimizations.offer_timing), 0) +
        toNumber(followupTimingOptimization?.adjustedBy, 0) * -320,
      -180,
      240
    )
  );

  const crmLeadScoreDelta = Math.round(
    clamp(
      (closeProbability - churnRisk) * 24 +
        vipPotential * 10 -
        fraudRisk * 14 +
        toNumber(repAssignmentOptimization?.adjustedBy, 0) * 40,
      -20,
      24
    )
  );

  const crmPriorityDelta = Math.round(
    clamp(
      escalationRisk * 22 +
        Number(hasAnomaly("conversion_drop")) * 10 +
        Number(hasAnomaly("booking_drop")) * 8 +
        Number(hasAnomaly("queue_lag")) * 4,
      0,
      35
    )
  );

  const crmSegmentShift =
    churnRisk >= 0.68 || hasAnomaly("churn_spike")
      ? "at_risk_recovery"
      : closeProbability >= 0.74
      ? "hot_conversion"
      : vipPotential >= 0.78
      ? "vip_growth"
      : null;

  const baseSpamThreshold = clamp(
    hasAnomaly("spam_anomaly") ? 0.72 : 0.85,
    0.55,
    0.95
  );

  const receptionForceHumanQueue =
    hasCriticalAnomaly("provider_outage_anomaly") ||
    hasCriticalAnomaly("payment_failure_spike") ||
    String(overrides.RECEPTION_FORCE_HUMAN?.action || "") === "ENABLE";

  const bookingDepositRequired =
    noShowRisk >= 0.6 ||
    hasAnomaly("booking_drop") ||
    String(overrides.BOOKING_DEPOSIT_FORCE?.action || "") === "ENABLE";

  const reminderIntensity = Math.round(
    clamp(
      noShowRisk * 2 + toNumber(reminderCadenceOptimization?.adjustedBy, 0) * 4,
      0,
      3
    )
  );

  const waitlistPriorityBoost = Math.round(
    clamp(
      closeProbability * 16 + vipPotential * 12 + Number(hasAnomaly("booking_drop")) * 10,
      0,
      35
    )
  );

  const priceMultiplier = clamp(
    1 +
      toNumber(pricingOptimization?.adjustedBy, 0) * 0.8 +
      (simulations.bestRevenueDelta > 0 ? 0.02 : -0.01) +
      (churnForecast > 1.2 ? -0.03 : 0),
    0.8,
    1.25
  );

  const policyThreshold = clamp(
    toNumber(toRecord(policy?.optimizationPolicy).discountAutoApprovePercent, 10),
    1,
    35
  );

  const discountAutoApproveMaxPercent = clamp(
    policyThreshold +
      toNumber(discountingOptimization?.adjustedBy, 0) * 20 -
      refundRisk * 4 -
      chargebackRisk * 6,
    1,
    30
  );

  const renewalAdvanceHours = Math.round(
    clamp(
      toNumber(renewalTimingOptimization?.adjustedBy, 0) * 240 +
        churnRisk * 18 +
        (hasAnomaly("churn_spike") ? 12 : 0),
      0,
      72
    )
  );

  const dunningRetryWindowHours = Math.round(
    clamp(
      24 +
        toNumber(dunningCadenceOptimization?.adjustedBy, 0) * -80 +
        (hasAnomaly("payment_failure_spike") ? 6 : 0),
      6,
      72
    )
  );

  const refundManualReviewThresholdMinor = Math.round(
    clamp(
      120000 -
        refundRisk * 70000 -
        chargebackRisk * 50000 -
        (hasAnomaly("refund_spike") ? 25000 : 0),
      20000,
      180000
    )
  );

  const chargebackRiskGate = clamp(
    0.72 -
      chargebackRisk * 0.25 -
      fraudRisk * 0.25 -
      (hasAnomaly("chargeback_spike") ? 0.2 : 0),
    0.2,
    0.88
  );

  const baseDispatchFloor = clamp(
    68 +
      (hasAnomaly("queue_lag") ? 12 : 0) +
      (hasAnomaly("staff_overload") ? 10 : 0) -
      closeProbability * 8,
    55,
    90
  );

  const autonomousBudgetMultiplier = clamp(
    1 +
      (simulations.bestRevenueDelta > 0 ? 0.2 : -0.15) +
      (hasAnomaly("conversion_drop") ? -0.2 : 0) +
      toNumber(queueOptimization?.adjustedBy, 0) * 0.4,
    0.5,
    1.8
  );

  const autonomousPaused =
    stale ||
    modelCritical ||
    hasCriticalAnomaly("provider_outage_anomaly") ||
    String(overrides.GLOBAL_PAUSE?.action || "") === "PAUSE" ||
    String(overrides.AUTONOMOUS_PAUSE?.action || "") === "PAUSE";

  const controls: IntelligenceRuntimeInfluence["controls"] = {
    ai: {
      tone: aiTone,
      urgencyBoost: aiUrgencyBoost,
      offerTimingShiftMinutes: aiOfferTimingShiftMinutes,
      escalationAdvanceMinutes: Math.round(
        clamp(escalationRisk * 70 + (hasAnomaly("queue_lag") ? 20 : 0), 0, 90)
      ),
      forceHumanEscalation:
        escalationRisk >= 0.7 ||
        hasCriticalAnomaly("provider_outage_anomaly") ||
        String(overrides.AI_FORCE_ESCALATION?.action || "") === "ENABLE",
    },
    crm: {
      leadScoreDelta: crmLeadScoreDelta,
      priorityDelta: crmPriorityDelta,
      segmentShift: crmSegmentShift,
    },
    reception: {
      spamThreshold: baseSpamThreshold,
      forceHumanQueue: receptionForceHumanQueue,
      escalationBias: Math.round(
        clamp(crmPriorityDelta + toNumber(queueOptimization?.adjustedBy, 0) * 50, 0, 45)
      ),
    },
    assignment: {
      loadBalanceBias: Math.round(
        clamp(
          toNumber(staffingOptimization?.adjustedBy, 0) * 100 +
            (hasAnomaly("staff_overload") ? 25 : 0),
          -35,
          45
        )
      ),
      escalationBoost: Math.round(clamp(escalationRisk * 30, 0, 30)),
    },
    booking: {
      depositRequired: bookingDepositRequired,
      reminderIntensity,
      waitlistPriorityBoost,
      noShowMitigationLevel: Math.round(clamp(noShowRisk * 3.2, 0, 3)),
      slotStrategy:
        bookingDemandForecast > staffingForecast + 2
          ? "capacity_balanced"
          : hasAnomaly("booking_drop")
          ? "conversion_recovery"
          : "earliest_available",
    },
    commerce: {
      priceMultiplier,
      discountAutoApproveMaxPercent,
      renewalAdvanceHours,
      dunningRetryWindowHours,
      refundManualReviewThresholdMinor,
      chargebackRiskGate,
    },
    autonomous: {
      autoDispatchScoreFloor: Math.round(baseDispatchFloor),
      cooldownHours: Math.round(
        clamp(
          24 +
            toNumber(followupTimingOptimization?.adjustedBy, 0) * -80 +
            (hasAnomaly("conversion_drop") ? 8 : 0),
          6,
          48
        )
      ),
      budgetMultiplier: autonomousBudgetMultiplier,
      channelBias: {
        WHATSAPP: clamp(
          1 + toNumber(queueOptimization?.adjustedBy, 0) * 0.7,
          0.7,
          1.5
        ),
        INSTAGRAM: clamp(
          1 - toNumber(queueOptimization?.adjustedBy, 0) * 0.5,
          0.7,
          1.5
        ),
      },
      paused: autonomousPaused,
    },
  };

  if (String(overrides.SPAM_GATE_STRICT?.action || "") === "ENABLE") {
    controls.reception.spamThreshold = Math.min(controls.reception.spamThreshold, 0.68);
  }

  if (String(overrides.AUTO_OPTIMIZATION_PAUSE?.action || "") === "PAUSE") {
    controls.autonomous.paused = true;
  }

  if (String(overrides.COMMERCE_MANUAL_REVIEW?.action || "") === "ENABLE") {
    controls.commerce.refundManualReviewThresholdMinor = Math.min(
      controls.commerce.refundManualReviewThresholdMinor,
      25_000
    );
    controls.commerce.chargebackRiskGate = Math.min(
      controls.commerce.chargebackRiskGate,
      0.45
    );
  }

  if (stale || modelCritical) {
    controls.ai.forceHumanEscalation = true;
    controls.reception.forceHumanQueue = true;
    controls.autonomous.paused = true;
  }

  if (String(overrides.GLOBAL_PAUSE?.action || "") === "PAUSE") {
    controls.autonomous.paused = true;
    controls.ai.forceHumanEscalation = true;
    controls.reception.forceHumanQueue = true;
  }

  return {
    controls,
    modelHealth: {
      warning: modelWarning,
      critical: modelCritical,
      rolloutPaused: stale || modelCritical,
    },
    generatedAt: asOf.toISOString(),
  };
};

const buildDefaultInfluence = ({
  businessId,
  leadId,
  now,
}: {
  businessId: string;
  leadId: string | null;
  now: Date;
}): IntelligenceRuntimeInfluence => ({
  businessId,
  leadId,
  generatedAt: now.toISOString(),
  stale: true,
  staleMinutes: 999,
  sourceSnapshotKey: null,
  policyVersion: 1,
  overrideScopes: {},
  predictions: {},
  forecasts: {},
  optimizations: {},
  anomalies: {
    open: [],
    critical: [],
    recent: [],
  },
  experiments: {
    winners: {},
    assignments: {},
    states: {},
  },
  recommendations: {
    openCount: 0,
    highPriorityActions: [],
  },
  simulations: {
    bestScenarioType: null,
    bestRevenueDelta: 0,
    queueDelta: 0,
  },
  modelHealth: {
    warning: false,
    critical: false,
    rolloutPaused: true,
  },
  controls: {
    ai: {
      tone: "human-confident",
      urgencyBoost: 0,
      offerTimingShiftMinutes: 0,
      escalationAdvanceMinutes: 0,
      forceHumanEscalation: true,
    },
    crm: {
      leadScoreDelta: 0,
      priorityDelta: 0,
      segmentShift: null,
    },
    reception: {
      spamThreshold: 0.85,
      forceHumanQueue: true,
      escalationBias: 0,
    },
    assignment: {
      loadBalanceBias: 0,
      escalationBoost: 0,
    },
    booking: {
      depositRequired: false,
      reminderIntensity: 0,
      waitlistPriorityBoost: 0,
      noShowMitigationLevel: 0,
      slotStrategy: "earliest_available",
    },
    commerce: {
      priceMultiplier: 1,
      discountAutoApproveMaxPercent: 10,
      renewalAdvanceHours: 0,
      dunningRetryWindowHours: 24,
      refundManualReviewThresholdMinor: 100_000,
      chargebackRiskGate: 0.72,
    },
    autonomous: {
      autoDispatchScoreFloor: 72,
      cooldownHours: 24,
      budgetMultiplier: 0.8,
      channelBias: {
        WHATSAPP: 1,
        INSTAGRAM: 1,
      },
      paused: true,
    },
  },
});

export const resetIntelligenceRuntimeInfluenceCache = () => {
  runtimeCache.clear();
};

export const getIntelligenceRuntimeInfluence = async ({
  businessId,
  leadId = null,
  asOf = new Date(),
  forceRefresh = false,
}: {
  businessId: string;
  leadId?: string | null;
  asOf?: Date;
  forceRefresh?: boolean;
}): Promise<IntelligenceRuntimeInfluence> => {
  const cacheKey = `${businessId}:${leadId || "business"}`;
  const nowMs = Date.now();

  if (!forceRefresh) {
    const cached = runtimeCache.get(cacheKey);

    if (cached && cached.expiresAt > nowMs) {
      return cached.value;
    }
  }

  try {
    const rows = shouldUseInMemory
      ? readRuntimeRowsFromMemory({
          businessId,
          leadId,
        })
      : await readRuntimeRowsFromDb({
          businessId,
          leadId,
          asOf,
        });

    const predictionRows = rows.predictions.length
      ? rows.predictions
      : rows.businessPredictions;
    const predictions = reducePredictionMap({
      rows: predictionRows,
    });
    const forecasts = reduceForecastMap(rows.forecasts);
    const optimizations = reduceOptimizationMap(rows.optimizations);
    const anomalies = reduceAnomalyState(rows.anomalies);
    const experiments = reduceExperimentState({
      rows: rows.experiments,
      leadId,
    });
    const simulations = reduceSimulationState(rows.simulations);
    const overrides = reduceOverrideMap(rows.overrides, asOf);

    const snapshotAt =
      rows.featureSnapshot?.snapshotAt instanceof Date
        ? rows.featureSnapshot.snapshotAt
        : null;
    const staleMinutes = snapshotAt
      ? Math.max(0, Math.round((asOf.getTime() - snapshotAt.getTime()) / 60_000))
      : 9_999;
    const staleThresholdMinutes = clamp(
      toNumber(toRecord(rows.policy?.metadata).staleThresholdMinutes, 180),
      30,
      720
    );
    const stale = staleMinutes > staleThresholdMinutes;
    const modelRegistry = rows.modelRegistry || [];

    const derived = deriveControls({
      asOf,
      policy: rows.policy,
      overrides,
      predictions,
      forecasts,
      optimizations,
      anomalies,
      simulations,
      modelRegistry,
      stale,
    });

    const highPriorityActions = rows.recommendations
      .filter((row) => ["OPEN", "AUTO_APPLIED"].includes(String(row.status || "").toUpperCase()))
      .sort((left, right) => {
        const leftScore = toNumber(left.confidence) - toNumber(left.riskScore);
        const rightScore = toNumber(right.confidence) - toNumber(right.riskScore);
        return rightScore - leftScore;
      })
      .slice(0, 6)
      .map((row) => String(row.action || "").trim())
      .filter(Boolean);

    const influence: IntelligenceRuntimeInfluence = {
      businessId,
      leadId,
      generatedAt: asOf.toISOString(),
      stale,
      staleMinutes,
      sourceSnapshotKey:
        String(rows.featureSnapshot?.snapshotKey || "").trim() || null,
      policyVersion: Math.max(1, Math.floor(toNumber(rows.policy?.version, 1))),
      overrideScopes: overrides,
      predictions,
      forecasts,
      optimizations,
      anomalies,
      experiments,
      recommendations: {
        openCount: rows.recommendations.filter((row) =>
          ["OPEN", "AUTO_APPLIED"].includes(String(row.status || "").toUpperCase())
        ).length,
        highPriorityActions,
      },
      simulations,
      modelHealth: derived.modelHealth,
      controls: derived.controls,
    };

    runtimeCache.set(cacheKey, {
      expiresAt: nowMs + CACHE_TTL_MS,
      value: influence,
    });

    return influence;
  } catch {
    const fallback = buildDefaultInfluence({
      businessId,
      leadId,
      now: asOf,
    });

    runtimeCache.set(cacheKey, {
      expiresAt: nowMs + Math.min(CACHE_TTL_MS, 2_000),
      value: fallback,
    });

    return fallback;
  }
};

export const __intelligenceRuntimeInfluenceTestInternals = {
  resetIntelligenceRuntimeInfluenceCache,
  assignExperimentVariant,
  reduceOverrideMap,
  reduceOptimizationMap,
  reduceAnomalyState,
};
