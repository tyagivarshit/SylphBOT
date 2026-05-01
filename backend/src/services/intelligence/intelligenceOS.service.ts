
import crypto from "crypto";
import prisma from "../../config/prisma";
import { appointmentProjectionService } from "../appointmentProjection.service";
import { commerceProjectionService } from "../commerceProjection.service";
import { createDurableOutboxEvent } from "../eventOutbox.service";
import { resetIntelligenceRuntimeInfluenceCache } from "./intelligenceRuntimeInfluence.service";
import { getQueueHealth } from "../queueHealth.service";
import { getReceptionMetricsSnapshot } from "../receptionMetrics.service";
import { enforceSecurityGovernanceInfluence } from "../security/securityGovernanceOS.service";

export const INTELLIGENCE_FORECAST_METRICS = [
  "revenue_forecast",
  "lead_inflow_forecast",
  "booking_demand_forecast",
  "staffing_forecast",
  "renewal_forecast",
  "churn_forecast",
  "support_load_forecast",
  "slot_demand_forecast",
] as const;

export const INTELLIGENCE_PREDICTION_TYPES = [
  "close_probability",
  "churn_risk",
  "upsell_likelihood",
  "cross_sell_likelihood",
  "no_show_probability",
  "refund_risk",
  "chargeback_risk",
  "payment_default_risk",
  "escalation_probability",
  "fraud_risk",
  "vip_potential",
  "ltv_score",
] as const;

export const INTELLIGENCE_OPTIMIZATION_TYPES = [
  "pricing",
  "discounting",
  "followup_timing",
  "slot_allocation",
  "rep_assignment",
  "staffing",
  "reminder_cadence",
  "dunning_cadence",
  "renewal_timing",
  "offer_timing",
  "queue_prioritization",
] as const;

export const INTELLIGENCE_ANOMALY_TYPES = [
  "booking_drop",
  "conversion_drop",
  "refund_spike",
  "chargeback_spike",
  "queue_lag",
  "worker_lag",
  "calendar_sync_failure_spike",
  "payment_failure_spike",
  "churn_spike",
  "staff_overload",
  "spam_anomaly",
  "provider_outage_anomaly",
] as const;

export const INTELLIGENCE_SIMULATION_TYPES = [
  "pricing_changes",
  "headcount_changes",
  "deposit_policy",
  "reminder_policy",
  "discount_policy",
  "capacity_changes",
  "calendar_changes",
  "routing_changes",
] as const;

export type IntelligenceHorizon = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

const HORIZON_DAYS: Record<IntelligenceHorizon, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
};

const MODEL_VERSION = "phase5e.v1";
const FEATURE_SCHEMA_VERSION = 1;

type JsonRecord = Record<string, unknown>;

type LeadSignal = {
  leadId: string;
  stage: string;
  compositeScore: number;
  churnScore: number;
  valueScore: number;
  followupCount: number;
  unreadCount: number;
  hoursSinceLastEngagement: number;
  bookedCount: number;
  paymentCount: number;
  noShowCount: number;
  refundCount: number;
  chargebackCount: number;
  escalationCount: number;
  spamScore: number;
};

export type IntelligenceDomainSnapshot = {
  businessId: string;
  asOf: Date;
  ownerUserId: string | null;
  timezone: string | null;
  signals: Record<string, number>;
  reception: Record<string, number>;
  queueHealth: Record<string, number>;
  projections: {
    appointment: JsonRecord;
    commerce: JsonRecord;
  };
  leads: LeadSignal[];
};

export type IntelligenceRunResult = {
  runId: string;
  businessId: string;
  snapshotKey: string;
  forecasts: number;
  predictions: number;
  optimizations: number;
  recommendations: number;
  anomalies: number;
  experiments: number;
  simulations: number;
  rolledBack: number;
  autoApplied: number;
  drift: {
    feature: number;
    prediction: number;
    outcome: number;
    status: "STABLE" | "WARNING" | "CRITICAL";
  };
};

const shouldUseInMemory =
  process.env.NODE_ENV === "test" ||
  process.argv.some((value) => value.includes("run-tests"));

const toRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);

const round = (value: number, digits = 6) =>
  Number(value.toFixed(Math.max(0, digits)));

const safeRatio = (numerator: number, denominator: number, fallback = 0) =>
  denominator > 0 ? numerator / denominator : fallback;

const stableHash = (value: unknown) => {
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

const scoreBand = (value: number) => {
  if (value >= 0.8) return "HIGH";
  if (value >= 0.6) return "MEDIUM";
  if (value >= 0.4) return "LOW";
  return "VERY_LOW";
};

export const assignExperimentVariant = ({
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

  const hash = stableHash({
    experimentKey,
    assignmentVersion,
    entityId,
  });
  const bucket = parseInt(hash.slice(0, 8), 16);
  const index = Number.isFinite(bucket) ? bucket % variants.length : 0;
  return variants[Math.max(0, Math.min(variants.length - 1, index))];
};

const nowIso = () => new Date().toISOString();

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
    loopState: Map<
      string,
      {
        lastRunAt: number;
        windowStart: number;
        runCount: number;
      }
    >;
    ownerFeed: any[];
  };
};

const getStore = () => {
  if (!globalForIntelligence.__sylphIntelligenceStore) {
    globalForIntelligence.__sylphIntelligenceStore = {
      featureSnapshots: new Map(),
      forecasts: new Map(),
      predictions: new Map(),
      optimizations: new Map(),
      experiments: new Map(),
      recommendations: new Map(),
      anomalies: new Map(),
      simulations: new Map(),
      modelRegistry: new Map(),
      policies: new Map(),
      overrides: new Map(),
      runMarkers: new Set(),
      loopState: new Map(),
      ownerFeed: [],
    };
  }

  return globalForIntelligence.__sylphIntelligenceStore;
};

const loopRuntimeState = new Map<
  string,
  {
    lastRunAt: number;
    windowStart: number;
    runCount: number;
  }
>();

const getLoopStateMap = () =>
  shouldUseInMemory ? getStore().loopState : loopRuntimeState;

const shouldThrottleIntelligenceLoop = ({
  businessId,
  asOf,
  minLoopIntervalSeconds,
  maxRunsPerHour,
  bypassThrottle = false,
}: {
  businessId: string;
  asOf: Date;
  minLoopIntervalSeconds: number;
  maxRunsPerHour: number;
  bypassThrottle?: boolean;
}) => {
  if (bypassThrottle) {
    return {
      blocked: false,
      reason: null as string | null,
    };
  }

  const map = getLoopStateMap();
  const state = map.get(businessId);
  const nowMs = asOf.getTime();
  const minIntervalMs = Math.max(1, minLoopIntervalSeconds) * 1000;
  const hourWindowMs = 60 * 60 * 1000;

  if (
    state &&
    Number.isFinite(state.lastRunAt) &&
    nowMs - state.lastRunAt < minIntervalMs
  ) {
    return {
      blocked: true,
      reason: "min_interval_guard",
    };
  }

  if (state && nowMs - state.windowStart < hourWindowMs) {
    if (state.runCount >= Math.max(1, maxRunsPerHour)) {
      return {
        blocked: true,
        reason: "hourly_run_cap_guard",
      };
    }

    map.set(businessId, {
      ...state,
      lastRunAt: nowMs,
      runCount: state.runCount + 1,
    });
  } else {
    map.set(businessId, {
      lastRunAt: nowMs,
      windowStart: nowMs,
      runCount: 1,
    });
  }

  return {
    blocked: false,
    reason: null as string | null,
  };
};

const db: any = prisma as any;

const toOutboxDedupe = (parts: Array<string | null | undefined>) =>
  parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(":");

const createOwnerFeed = async ({
  businessId,
  title,
  message,
  payload,
}: {
  businessId: string;
  title: string;
  message: string;
  payload?: JsonRecord;
}) => {
  if (shouldUseInMemory) {
    getStore().ownerFeed.push({
      id: `owner_feed_${crypto.randomUUID()}`,
      businessId,
      title,
      message,
      payload: payload || null,
      createdAt: new Date(),
    });
    return;
  }

  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      ownerId: true,
    },
  });

  if (!business?.ownerId) {
    return;
  }

  await prisma.notification.create({
    data: {
      userId: business.ownerId,
      businessId,
      type: "SYSTEM",
      title,
      message,
      read: false,
    },
  });

  await createDurableOutboxEvent({
    businessId,
    eventType: "intelligence.owner.feed",
    aggregateType: "intelligence_owner_feed",
    aggregateId: businessId,
    dedupeKey: toOutboxDedupe(["owner", businessId, title, nowIso().slice(0, 16)]),
    payload: {
      businessId,
      title,
      message,
      payload: payload || null,
    },
  });
};

const getDefaultPolicyPayload = (businessId: string) => ({
  policyKey: `${businessId}:default`,
  version: 1,
  autoApplyEnabled: false,
  forecastPolicy: {
    maxTrendAmplification: 0.5,
  },
  predictionPolicy: {
    minConfidence: 0.4,
  },
  optimizationPolicy: {
    autoApplyMinConfidence: 0.75,
    autoApplyMaxRisk: 0.35,
  },
  experimentPolicy: {
    minSampleSize: 100,
    winnerLiftThreshold: 0.05,
  },
  anomalyPolicy: {
    suppressionMinutes: 90,
    dropThreshold: 0.3,
    spikeThreshold: 0.3,
  },
  driftPolicy: {
    warningThreshold: 0.12,
    criticalThreshold: 0.2,
    autoRollbackOnCritical: true,
  },
  guardrails: {
    maxNegativeUpliftBeforeRollback: -0.03,
    maxAutoApplyPerRun: 4,
    minLoopIntervalSeconds: 45,
    deadConsumerWaitingThreshold: 80,
    queueLagPauseThreshold: 120,
    maxOptimizationShift: 0.18,
  },
  effectiveFrom: new Date(),
  isActive: true,
  metadata: {
    source: "phase5e_bootstrap",
  },
});

const getActivePolicy = async (businessId: string) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const key = `${businessId}:default`;
    const existing = store.policies.get(key);

    if (existing) {
      return existing;
    }

    const created = {
      id: `int_policy_${crypto.randomUUID()}`,
      businessId,
      ...getDefaultPolicyPayload(businessId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.policies.set(key, created);
    return created;
  }

  const existing = await db.intelligencePolicy.findFirst({
    where: {
      businessId,
      isActive: true,
      effectiveFrom: {
        lte: new Date(),
      },
    },
    orderBy: [
      {
        version: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  if (existing) {
    return existing;
  }

  const defaults = getDefaultPolicyPayload(businessId);

  return db.intelligencePolicy.create({
    data: {
      businessId,
      ...defaults,
    },
  });
};

const listActiveManualOverrides = async (businessId: string, asOf: Date) => {
  if (shouldUseInMemory) {
    return Array.from(getStore().overrides.values())
      .filter(
        (row) =>
          row.businessId === businessId &&
          row.isActive &&
          row.expiresAt instanceof Date &&
          row.expiresAt > asOf
      )
      .sort((left, right) => {
        const priorityDelta =
          toNumber(right.priority, 0) - toNumber(left.priority, 0);

        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return (
          (right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0) -
          (left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0)
        );
      });
  }

  return db.manualIntelligenceOverride.findMany({
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
  });
};

const resolveHighestPriorityOverride = ({
  overrides,
  scope,
}: {
  overrides: any[];
  scope: string;
}) =>
  [...overrides]
    .filter(
      (override) =>
        String(override.scope || "").toUpperCase() === scope.toUpperCase()
    )
    .sort((left, right) => {
      const priorityDelta = toNumber(right.priority, 0) - toNumber(left.priority, 0);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (
        (right.updatedAt instanceof Date ? right.updatedAt.getTime() : 0) -
        (left.updatedAt instanceof Date ? left.updatedAt.getTime() : 0)
      );
    })[0] || null;

const hasOverride = ({
  overrides,
  scope,
}: {
  overrides: any[];
  scope: string;
}) => Boolean(resolveHighestPriorityOverride({ overrides, scope }));

export const applyManualIntelligenceOverride = async ({
  businessId,
  scope,
  action,
  reason,
  expiresAt,
  createdBy,
  targetType = "BUSINESS",
  targetId = null,
  priority = 100,
  metadata,
}: {
  businessId: string;
  scope: string;
  action: string;
  reason: string;
  expiresAt: Date;
  createdBy?: string | null;
  targetType?: string;
  targetId?: string | null;
  priority?: number;
  metadata?: JsonRecord;
}) => {
  const overrideKey = stableHash({
    businessId,
    scope,
    action,
    reason,
    expiresAt: expiresAt.toISOString(),
    targetType,
    targetId,
  });

  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.overrides.get(overrideKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `manual_int_override_${crypto.randomUUID()}`,
      businessId,
      overrideKey,
      scope,
      action,
      reason,
      expiresAt,
      isActive: true,
      targetType,
      targetId,
      priority,
      createdBy: createdBy || null,
      metadata: metadata || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    store.overrides.set(overrideKey, created);
    resetIntelligenceRuntimeInfluenceCache();
    return created;
  }

  const existing = await db.manualIntelligenceOverride.findUnique({
    where: {
      overrideKey,
    },
  });

  if (existing) {
    return existing;
  }

  const created = await db.manualIntelligenceOverride.create({
    data: {
      businessId,
      overrideKey,
      scope,
      action,
      reason,
      expiresAt,
      isActive: true,
      targetType,
      targetId,
      priority,
      createdBy: createdBy || null,
      metadata: metadata || null,
    },
  });
  resetIntelligenceRuntimeInfluenceCache();
  return created;
};
const buildSnapshotSignals = ({
  leadCount,
  newLeadCount7,
  newLeadCount30,
  bookingsRequested,
  bookingsConfirmed,
  noShowCount,
  renewalsDue30,
  churnedSubscriptions30,
  supportVolume7,
  slotReservations7,
  revenueRecognizedMinor30,
  paymentFailures7,
  refundCount30,
  chargebackCount30,
  escalationCount7,
  spamScore7,
  queueLagScore,
  outboxPendingCount,
  outboxFailedCount,
  workerLagSignal,
  calendarSyncFailureSignal,
  providerOutageSignal,
}: {
  leadCount: number;
  newLeadCount7: number;
  newLeadCount30: number;
  bookingsRequested: number;
  bookingsConfirmed: number;
  noShowCount: number;
  renewalsDue30: number;
  churnedSubscriptions30: number;
  supportVolume7: number;
  slotReservations7: number;
  revenueRecognizedMinor30: number;
  paymentFailures7: number;
  refundCount30: number;
  chargebackCount30: number;
  escalationCount7: number;
  spamScore7: number;
  queueLagScore: number;
  outboxPendingCount: number;
  outboxFailedCount: number;
  workerLagSignal: number;
  calendarSyncFailureSignal: number;
  providerOutageSignal: number;
}) => {
  const dailyRevenue = revenueRecognizedMinor30 / 30;
  const dailyLeadInflow = newLeadCount30 / 30;
  const dailyBookingDemand = bookingsRequested / 30;
  const staffingLoad = supportVolume7 / 7 + queueLagScore;
  const dailyRenewalDemand = renewalsDue30 / 30;
  const dailyChurnSignal = churnedSubscriptions30 / 30;
  const supportLoad = supportVolume7 / 7;
  const slotDemand = slotReservations7 / 7;
  const conversionRate = safeRatio(bookingsConfirmed, Math.max(1, bookingsRequested));

  return {
    lead_count: leadCount,
    new_leads_7d: newLeadCount7,
    new_leads_30d: newLeadCount30,
    bookings_requested_30d: bookingsRequested,
    bookings_confirmed_30d: bookingsConfirmed,
    no_show_count_30d: noShowCount,
    renewals_due_30d: renewalsDue30,
    churned_subscriptions_30d: churnedSubscriptions30,
    support_volume_7d: supportVolume7,
    slot_reservations_7d: slotReservations7,
    revenue_recognized_minor_30d: revenueRecognizedMinor30,
    payment_failures_7d: paymentFailures7,
    refund_count_30d: refundCount30,
    chargeback_count_30d: chargebackCount30,
    escalation_count_7d: escalationCount7,
    spam_score_7d: spamScore7,
    queue_lag_score: queueLagScore,
    outbox_pending_count: outboxPendingCount,
    outbox_failed_count: outboxFailedCount,
    worker_lag_signal: workerLagSignal,
    calendar_sync_failure_signal: calendarSyncFailureSignal,
    provider_outage_signal: providerOutageSignal,
    conversion_rate: conversionRate,
    forecast_signal_revenue: dailyRevenue / 100,
    forecast_signal_lead_inflow: dailyLeadInflow,
    forecast_signal_booking_demand: dailyBookingDemand,
    forecast_signal_staffing: staffingLoad,
    forecast_signal_renewal: dailyRenewalDemand,
    forecast_signal_churn: dailyChurnSignal,
    forecast_signal_support_load: supportLoad,
    forecast_signal_slot_demand: slotDemand,
  };
};

export const collectIntelligenceDomainSnapshot = async ({
  businessId,
  asOf = new Date(),
}: {
  businessId: string;
  asOf?: Date;
}): Promise<IntelligenceDomainSnapshot> => {
  const window30 = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);
  const window7 = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    business,
    leadRows,
    leadCount,
    newLeadCount7,
    newLeadCount30,
    appointmentRows,
    renewalsDue30,
    churnedSubscriptions30,
    inboundRows,
    queueRows,
    slotReservations7,
    revenueRows,
    paymentFailures7,
    refundCount30,
    chargebackCount30,
    outboxPendingCount,
    outboxFailedCount,
    queueHealth,
  ] = await Promise.all([
    prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        ownerId: true,
        timezone: true,
      },
    }),
    prisma.lead.findMany({
      where: {
        businessId,
        deletedAt: null,
      },
      orderBy: [
        {
          intelligenceUpdatedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 40,
      select: {
        id: true,
        stage: true,
        followupCount: true,
        unreadCount: true,
        lastEngagedAt: true,
        leadScore: true,
      },
    }),
    prisma.lead.count({ where: { businessId, deletedAt: null } }),
    prisma.lead.count({
      where: {
        businessId,
        deletedAt: null,
        createdAt: { gte: window7, lte: asOf },
      },
    }),
    prisma.lead.count({
      where: {
        businessId,
        deletedAt: null,
        createdAt: { gte: window30, lte: asOf },
      },
    }),
    prisma.appointmentLedger.findMany({
      where: {
        businessId,
        createdAt: { gte: window30, lte: asOf },
      },
      select: {
        leadId: true,
        status: true,
      },
    }),
    prisma.subscriptionLedger.count({
      where: {
        businessId,
        renewAt: {
          gte: asOf,
          lte: new Date(asOf.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.subscriptionLedger.count({
      where: {
        businessId,
        status: "CANCELLED",
        updatedAt: { gte: window30, lte: asOf },
      },
    }),
    prisma.inboundInteraction.findMany({
      where: {
        businessId,
        createdAt: { gte: window7, lte: asOf },
      },
      select: {
        spamScore: true,
        routeDecision: true,
      },
    }),
    prisma.humanWorkQueue.findMany({
      where: {
        businessId,
        createdAt: { gte: window7, lte: asOf },
      },
      select: {
        state: true,
        priority: true,
      },
    }),
    prisma.slotReservationLedger.count({
      where: {
        businessId,
        createdAt: { gte: window7, lte: asOf },
      },
    }),
    prisma.revenueRecognitionLedger.findMany({
      where: {
        businessId,
        stage: {
          in: ["RECOGNIZED", "COLLECTED"],
        },
        createdAt: { gte: window30, lte: asOf },
      },
      select: {
        amountMinor: true,
      },
    }),
    prisma.paymentAttemptLedger.count({
      where: {
        businessId,
        status: "FAILED",
        createdAt: { gte: window7, lte: asOf },
      },
    }),
    prisma.refundLedger.count({
      where: {
        businessId,
        createdAt: { gte: window30, lte: asOf },
      },
    }),
    prisma.chargebackLedger.count({
      where: {
        businessId,
        createdAt: { gte: window30, lte: asOf },
      },
    }),
    prisma.eventOutbox.count({
      where: {
        businessId,
        publishedAt: null,
        failedAt: null,
      },
    }),
    prisma.eventOutbox.count({
      where: {
        businessId,
        failedAt: {
          not: null,
        },
      },
    }),
    getQueueHealth().catch(() => []),
  ]);

  const appointmentProjection = await appointmentProjectionService
    .getOpsProjection({
      businessId,
      from: window30,
      to: asOf,
    })
    .catch(() => ({}));
  const commerceProjection = await commerceProjectionService
    .buildProjection({
      businessId,
      from: window30,
      to: asOf,
    })
    .catch(() => ({}));

  const bookingsRequested = appointmentRows.filter(
    (row) => row.status === "REQUESTED"
  ).length;
  const bookingsConfirmed = appointmentRows.filter((row) =>
    [
      "CONFIRMED",
      "IN_PROGRESS",
      "CHECKED_IN",
      "COMPLETED",
      "FOLLOWUP_BOOKED",
      "REMINDER_SENT",
    ].includes(row.status)
  ).length;
  const noShowCount = appointmentRows.filter(
    (row) => row.status === "NO_SHOW"
  ).length;

  const supportVolume7 = inboundRows.length;
  const queueLagScore = queueRows.filter(
    (row) => row.state === "PENDING" || row.state === "ESCALATED"
  ).length;

  const escalationCount7 = queueRows.filter(
    (row) => row.state === "ESCALATED"
  ).length;

  const spamScore7 = mean(inboundRows.map((row) => Number(row.spamScore || 0)));

  const revenueRecognizedMinor30 = sum(
    revenueRows.map((row) => Number(row.amountMinor || 0))
  );

  const receptionSnapshot = getReceptionMetricsSnapshot();
  const queueHealthRecord = (queueHealth || []).reduce<Record<string, number>>(
    (acc, row: any) => {
      acc[`${row.name}:waiting`] = toNumber(row.waiting);
      acc[`${row.name}:failed`] = toNumber(row.failed);
      acc[`${row.name}:active`] = toNumber(row.active);
      return acc;
    },
    {}
  );
  const workerLagSignal = Object.entries(queueHealthRecord)
    .filter(([key]) => key.endsWith(":waiting"))
    .reduce((sumWaiting, [, value]) => sumWaiting + toNumber(value), 0);
  const calendarSyncFailureSignal = Object.entries(queueHealthRecord)
    .filter(([key]) => key.includes("calendarSync") && key.endsWith(":failed"))
    .reduce((sumFailed, [, value]) => sumFailed + toNumber(value), 0);
  const providerOutageSignal =
    paymentFailures7 + outboxFailedCount + calendarSyncFailureSignal;

  const leadAppointmentMap = new Map<string, { booked: number; noShow: number }>();

  for (const row of appointmentRows) {
    const current = leadAppointmentMap.get(row.leadId) || {
      booked: 0,
      noShow: 0,
    };

    if (
      ["CONFIRMED", "COMPLETED", "FOLLOWUP_BOOKED", "NO_SHOW"].includes(
        row.status
      )
    ) {
      current.booked += 1;
    }

    if (row.status === "NO_SHOW") {
      current.noShow += 1;
    }

    leadAppointmentMap.set(row.leadId, current);
  }

  const leads: LeadSignal[] = leadRows.map((row) => {
    const leadAppointments = leadAppointmentMap.get(row.id) || {
      booked: 0,
      noShow: 0,
    };

    return {
      leadId: row.id,
      stage: row.stage || "UNKNOWN",
      compositeScore: toNumber(row.leadScore) * 0.8,
      churnScore: 40,
      valueScore: 45,
      followupCount: toNumber(row.followupCount),
      unreadCount: toNumber(row.unreadCount),
      hoursSinceLastEngagement: row.lastEngagedAt
        ? Math.max(0, (asOf.getTime() - row.lastEngagedAt.getTime()) / (60 * 60 * 1000))
        : 240,
      bookedCount: leadAppointments.booked,
      paymentCount: 0,
      noShowCount: leadAppointments.noShow,
      refundCount: 0,
      chargebackCount: 0,
      escalationCount: escalationCount7 > 0 ? 1 : 0,
      spamScore: spamScore7,
    };
  });

  const signals = buildSnapshotSignals({
    leadCount,
    newLeadCount7,
    newLeadCount30,
    bookingsRequested,
    bookingsConfirmed,
    noShowCount,
    renewalsDue30,
    churnedSubscriptions30,
    supportVolume7,
    slotReservations7,
    revenueRecognizedMinor30,
    paymentFailures7,
    refundCount30,
    chargebackCount30,
    escalationCount7,
    spamScore7,
    queueLagScore,
    outboxPendingCount,
    outboxFailedCount,
    workerLagSignal,
    calendarSyncFailureSignal,
    providerOutageSignal,
  });

  return {
    businessId,
    asOf,
    ownerUserId: business?.ownerId || null,
    timezone: business?.timezone || null,
    signals,
    reception: {
      inbound_received_total: toNumber(receptionSnapshot.inbound_received_total),
      routed_total: toNumber(receptionSnapshot.routed_total),
      sla_breach_total: toNumber(receptionSnapshot.sla_breach_total),
      avg_first_response_time: toNumber(receptionSnapshot.avg_first_response_time),
      avg_resolution_time: toNumber(receptionSnapshot.avg_resolution_time),
    },
    queueHealth: queueHealthRecord,
    projections: {
      appointment: toRecord(appointmentProjection),
      commerce: toRecord(commerceProjection),
    },
    leads,
  };
};
const persistFeatureSnapshot = async ({
  snapshot,
}: {
  snapshot: IntelligenceDomainSnapshot;
}) => {
  const snapshotKey = stableHash({
    businessId: snapshot.businessId,
    entityType: "BUSINESS",
    entityId: snapshot.businessId,
    asOf: snapshot.asOf.toISOString(),
    schemaVersion: FEATURE_SCHEMA_VERSION,
  });

  const payload = {
    businessId: snapshot.businessId,
    snapshotKey,
    entityType: "BUSINESS",
    entityId: snapshot.businessId,
    schemaVersion: FEATURE_SCHEMA_VERSION,
    sourceVersion: MODEL_VERSION,
    snapshotAt: snapshot.asOf,
    pointInTimeWindowStart: new Date(
      snapshot.asOf.getTime() - 30 * 24 * 60 * 60 * 1000
    ),
    pointInTimeWindowEnd: snapshot.asOf,
    features: {
      signals: snapshot.signals,
      reception: snapshot.reception,
      queueHealth: snapshot.queueHealth,
      projections: snapshot.projections,
      leadCount: snapshot.leads.length,
    },
    metadata: {
      replaySafe: true,
      generatedAt: nowIso(),
    },
  };

  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.featureSnapshots.get(snapshotKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `feature_snapshot_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
    };

    store.featureSnapshots.set(snapshotKey, created);
    return created;
  }

  return db.featureSnapshotLedger.upsert({
    where: {
      snapshotKey,
    },
    update: {},
    create: payload,
  });
};

const listRecentFeatureSnapshots = async (businessId: string, limit = 24) => {
  if (shouldUseInMemory) {
    return Array.from(getStore().featureSnapshots.values())
      .filter((row) => row.businessId === businessId)
      .sort((left, right) => right.snapshotAt.getTime() - left.snapshotAt.getTime())
      .slice(0, limit);
  }

  return db.featureSnapshotLedger.findMany({
    where: {
      businessId,
      entityType: "BUSINESS",
    },
    orderBy: {
      snapshotAt: "desc",
    },
    take: Math.max(1, Math.min(limit, 120)),
  });
};

const computeForecast = ({
  metric,
  horizon,
  currentSignals,
  history,
}: {
  metric: string;
  horizon: IntelligenceHorizon;
  currentSignals: Record<string, number>;
  history: any[];
}) => {
  const map: Record<string, string> = {
    revenue_forecast: "forecast_signal_revenue",
    lead_inflow_forecast: "forecast_signal_lead_inflow",
    booking_demand_forecast: "forecast_signal_booking_demand",
    staffing_forecast: "forecast_signal_staffing",
    renewal_forecast: "forecast_signal_renewal",
    churn_forecast: "forecast_signal_churn",
    support_load_forecast: "forecast_signal_support_load",
    slot_demand_forecast: "forecast_signal_slot_demand",
  };

  const signalKey = map[metric];
  const samples = history
    .map((row) => toNumber(toRecord(toRecord(row.features).signals)[signalKey]))
    .filter((value) => Number.isFinite(value));

  const current = toNumber(currentSignals[signalKey]);
  const recent = samples.slice(0, 7);
  const prior = samples.slice(7, 14);
  const recentMean = recent.length ? mean(recent) : current;
  const priorMean = prior.length ? mean(prior) : recentMean;
  const trend = priorMean > 0 ? (recentMean - priorMean) / priorMean : 0;
  const volatility = recent.length > 1
    ? Math.sqrt(mean(recent.map((value) => (value - recentMean) ** 2)))
    : 0;
  const units = HORIZON_DAYS[horizon];
  const trendAmplification = clamp(1 + trend * 0.5, 0.6, 1.5);
  const predictedValue = Math.max(0, recentMean * units * trendAmplification);
  const confidence = clamp(
    1 - safeRatio(volatility, Math.max(1, recentMean)) * 0.4 - Math.abs(trend) * 0.08,
    0.35,
    0.97
  );
  const uncertainty = Math.max(0.05, 1 - confidence);

  return {
    predictedValue: round(predictedValue, 4),
    lowerBound: round(Math.max(0, predictedValue * (1 - uncertainty)), 4),
    upperBound: round(predictedValue * (1 + uncertainty), 4),
    confidence: round(confidence, 6),
    trend: round(trend, 6),
    reason: `signal:${signalKey};trend:${round(trend, 4)}`,
    explanation: {
      signalKey,
      current,
      recentMean,
      priorMean,
      volatility,
      units,
    },
  };
};

const buildPredictionScores = ({
  signal,
  businessSignals,
}: {
  signal: LeadSignal;
  businessSignals: Record<string, number>;
}) => {
  const engagementDecay = clamp(signal.hoursSinceLastEngagement / 168, 0, 1);
  const conversionRate = clamp(toNumber(businessSignals.conversion_rate), 0, 1);

  const closeProbability = clamp(
    (signal.compositeScore / 100) * 0.55 +
      (signal.valueScore / 100) * 0.2 +
      conversionRate * 0.15 +
      (1 - engagementDecay) * 0.1
  );

  const churnRisk = clamp(
    (signal.churnScore / 100) * 0.55 +
      engagementDecay * 0.2 +
      clamp(signal.followupCount / 10, 0, 1) * 0.15 +
      clamp(signal.noShowCount / 3, 0, 1) * 0.1
  );

  const upsell = clamp((signal.valueScore / 100) * 0.5 + closeProbability * 0.35 + (1 - churnRisk) * 0.15);
  const crossSell = clamp((signal.valueScore / 100) * 0.4 + closeProbability * 0.3 + conversionRate * 0.3);
  const noShow = clamp(
    clamp(signal.noShowCount / Math.max(1, signal.bookedCount), 0, 1) * 0.6 +
      engagementDecay * 0.2 +
      clamp(signal.unreadCount / 5, 0, 1) * 0.2
  );
  const refundRisk = clamp(churnRisk * 0.45 + clamp(signal.refundCount / 2, 0, 1) * 0.3 + noShow * 0.25);
  const chargebackRisk = clamp(refundRisk * 0.6 + clamp(signal.chargebackCount / 2, 0, 1) * 0.4);
  const paymentDefault = clamp(churnRisk * 0.4 + engagementDecay * 0.25 + clamp(signal.followupCount / 8, 0, 1) * 0.35);
  const escalation = clamp(clamp(signal.escalationCount / 2, 0, 1) * 0.5 + clamp(signal.unreadCount / 5, 0, 1) * 0.2 + engagementDecay * 0.3);
  const fraud = clamp(chargebackRisk * 0.45 + clamp(signal.spamScore, 0, 1) * 0.45 + clamp(signal.unreadCount / 6, 0, 1) * 0.1);
  const vip = clamp((signal.valueScore / 100) * 0.55 + closeProbability * 0.25 + upsell * 0.2);
  const ltv = clamp((signal.valueScore / 100) * 0.45 + closeProbability * 0.25 + upsell * 0.2 + (1 - churnRisk) * 0.1);

  return {
    close_probability: closeProbability,
    churn_risk: churnRisk,
    upsell_likelihood: upsell,
    cross_sell_likelihood: crossSell,
    no_show_probability: noShow,
    refund_risk: refundRisk,
    chargeback_risk: chargebackRisk,
    payment_default_risk: paymentDefault,
    escalation_probability: escalation,
    fraud_risk: fraud,
    vip_potential: vip,
    ltv_score: ltv,
  } as Record<(typeof INTELLIGENCE_PREDICTION_TYPES)[number], number>;
};

const determineAnomalySeverity = (delta: number) => {
  const absDelta = Math.abs(delta);
  if (absDelta >= 0.6) return "CRITICAL";
  if (absDelta >= 0.4) return "HIGH";
  if (absDelta >= 0.25) return "MEDIUM";
  return "LOW";
};

export const rollbackOptimizationDecision = async ({
  businessId,
  decisionKey,
  reason,
}: {
  businessId: string;
  decisionKey: string;
  reason: string;
}) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const row = store.optimizations.get(decisionKey);

    if (!row) {
      return null;
    }

    if (row.status === "ROLLED_BACK") {
      return row;
    }

    row.status = "ROLLED_BACK";
    row.rolledBackAt = new Date();
    row.rollbackReason = reason;
    row.updatedAt = new Date();
    row.version = Math.max(1, Number(row.version || 1)) + 1;
    store.optimizations.set(decisionKey, row);
    resetIntelligenceRuntimeInfluenceCache();
    return row;
  }

  const row = await db.optimizationDecisionLedger.findUnique({
    where: {
      decisionKey,
    },
  });

  if (!row || row.businessId !== businessId) {
    return null;
  }

  if (row.status === "ROLLED_BACK") {
    return row;
  }

  await db.optimizationDecisionLedger.updateMany({
    where: {
      decisionKey,
      businessId,
      version: row.version,
      NOT: {
        status: "ROLLED_BACK",
      },
    },
    data: {
      status: "ROLLED_BACK",
      rolledBackAt: new Date(),
      rollbackReason: reason,
      version: {
        increment: 1,
      },
    },
  });
  const updated = await db.optimizationDecisionLedger.findUnique({
    where: {
      decisionKey,
    },
  });
  resetIntelligenceRuntimeInfluenceCache();
  return updated;
};

export const trackRecommendationOutcome = async ({
  businessId,
  recommendationKey,
  adopted,
  outcome,
}: {
  businessId: string;
  recommendationKey: string;
  adopted: boolean;
  outcome?: JsonRecord | null;
}) => {
  const realizedUplift = toNumber(toRecord(outcome).realizedUplift, 0);

  if (shouldUseInMemory) {
    const store = getStore();
    const row = store.recommendations.get(recommendationKey);

    if (!row || row.businessId !== businessId) {
      return null;
    }

    row.status = adopted ? "ADOPTED" : "REJECTED";
    row.adoptedAt = adopted ? new Date() : row.adoptedAt || null;
    row.rejectedAt = adopted ? null : new Date();
    row.outcome = outcome || row.outcome || null;
    row.updatedAt = new Date();
    store.recommendations.set(recommendationKey, row);

    if (adopted && row.optimizationDecisionKey) {
      const policy = await getActivePolicy(businessId);
      const rollbackThreshold = toNumber(
        toRecord(policy.guardrails).maxNegativeUpliftBeforeRollback,
        -0.03
      );

      if (realizedUplift <= rollbackThreshold) {
        await rollbackOptimizationDecision({
          businessId,
          decisionKey: row.optimizationDecisionKey,
          reason: "outcome_harm_guardrail",
        });
      }
    }

    resetIntelligenceRuntimeInfluenceCache();
    return row;
  }

  const row = await db.recommendationLedger.findUnique({
    where: {
      recommendationKey,
    },
  });

  if (!row || row.businessId !== businessId) {
    return null;
  }

  const updated = await db.recommendationLedger.update({
    where: {
      recommendationKey,
    },
    data: {
      status: adopted ? "ADOPTED" : "REJECTED",
      adoptedAt: adopted ? new Date() : row.adoptedAt,
      rejectedAt: adopted ? null : new Date(),
      outcome: outcome || row.outcome || null,
    },
  });

  if (adopted && updated.optimizationDecisionKey) {
    const policy = await getActivePolicy(businessId);
    const rollbackThreshold = toNumber(
      toRecord(policy.guardrails).maxNegativeUpliftBeforeRollback,
      -0.03
    );

    if (realizedUplift <= rollbackThreshold) {
      await rollbackOptimizationDecision({
        businessId,
        decisionKey: updated.optimizationDecisionKey,
        reason: "outcome_harm_guardrail",
      });
    }
  }

  resetIntelligenceRuntimeInfluenceCache();
  return updated;
};

const persistModelRegistry = async ({
  businessId,
  modelDomain,
  modelName,
}: {
  businessId: string;
  modelDomain: string;
  modelName: string;
}) => {
  const modelKey = `${businessId}:${modelDomain}:${modelName}:${MODEL_VERSION}`;

  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.modelRegistry.get(modelKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `model_registry_${crypto.randomUUID()}`,
      businessId,
      modelKey,
      modelDomain,
      modelName,
      modelVersion: MODEL_VERSION,
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      driftStatus: "STABLE",
      deploymentState: "ACTIVE",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    store.modelRegistry.set(modelKey, created);
    return created;
  }

  return db.modelRegistryLedger.upsert({
    where: {
      modelKey,
    },
    update: {},
    create: {
      businessId,
      modelKey,
      modelDomain,
      modelName,
      modelVersion: MODEL_VERSION,
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      driftStatus: "STABLE",
      deploymentState: "ACTIVE",
      isActive: true,
    },
  });
};

const upsertForecast = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const conflicting = Array.from(store.forecasts.values()).find(
      (row) =>
        row.businessId === payload.businessId &&
        row.metric === payload.metric &&
        row.horizon === payload.horizon &&
        row.windowStart instanceof Date &&
        payload.windowStart instanceof Date &&
        row.windowStart.getTime() === payload.windowStart.getTime() &&
        Number(row.version || 0) !== Number(payload.version || 0)
    );

    if (conflicting) {
      throw new Error(
        `forecast_version_conflict:${payload.metric}:${payload.horizon}:${payload.windowStart.toISOString()}`
      );
    }

    const existing = store.forecasts.get(payload.forecastKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `forecast_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
    };
    store.forecasts.set(payload.forecastKey, created);
    return created;
  }

  const conflicting = await db.forecastLedger.findFirst({
    where: {
      businessId: payload.businessId,
      metric: payload.metric,
      horizon: payload.horizon,
      windowStart: payload.windowStart,
      NOT: {
        version: payload.version,
      },
    },
    select: {
      id: true,
      version: true,
    },
  });

  if (conflicting) {
    throw new Error(
      `forecast_version_conflict:${payload.metric}:${payload.horizon}:${payload.windowStart.toISOString()}`
    );
  }

  return db.forecastLedger.upsert({
    where: {
      forecastKey: payload.forecastKey,
    },
    update: {},
    create: payload,
  });
};

const upsertPrediction = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.predictions.get(payload.predictionKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `prediction_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
    };
    store.predictions.set(payload.predictionKey, created);
    return created;
  }

  return db.predictionLedger.upsert({
    where: {
      predictionKey: payload.predictionKey,
    },
    update: {},
    create: payload,
  });
};

const upsertOptimization = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.optimizations.get(payload.decisionKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `optimization_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.optimizations.set(payload.decisionKey, created);
    return created;
  }

  return db.optimizationDecisionLedger.upsert({
    where: {
      decisionKey: payload.decisionKey,
    },
    update: {},
    create: payload,
  });
};

const upsertRecommendation = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.recommendations.get(payload.recommendationKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `recommendation_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.recommendations.set(payload.recommendationKey, created);
    return created;
  }

  return db.recommendationLedger.upsert({
    where: {
      recommendationKey: payload.recommendationKey,
    },
    update: {},
    create: payload,
  });
};

const upsertAnomaly = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.anomalies.get(payload.anomalyKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `anomaly_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.anomalies.set(payload.anomalyKey, created);
    return created;
  }

  return db.anomalyLedger.upsert({
    where: {
      anomalyKey: payload.anomalyKey,
    },
    update: {},
    create: payload,
  });
};

const upsertSimulation = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.simulations.get(payload.simulationKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `simulation_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
    };
    store.simulations.set(payload.simulationKey, created);
    return created;
  }

  return db.simulationLedger.upsert({
    where: {
      simulationKey: payload.simulationKey,
    },
    update: {},
    create: payload,
  });
};

const upsertExperiment = async (payload: any) => {
  if (shouldUseInMemory) {
    const store = getStore();
    const existing = store.experiments.get(payload.experimentKey);

    if (existing) {
      return existing;
    }

    const created = {
      id: `experiment_${crypto.randomUUID()}`,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.experiments.set(payload.experimentKey, created);
    return created;
  }

  return db.experimentLedger.upsert({
    where: {
      experimentKey: payload.experimentKey,
    },
    update: {},
    create: payload,
  });
};
export const runIntelligenceSimulation = async ({
  businessId,
  scenarioType,
  assumptions,
  asOf = new Date(),
  snapshotOverride,
}: {
  businessId: string;
  scenarioType: string;
  assumptions: JsonRecord;
  asOf?: Date;
  snapshotOverride?: IntelligenceDomainSnapshot;
}) => {
  const snapshot =
    snapshotOverride ||
    (await collectIntelligenceDomainSnapshot({
      businessId,
      asOf,
    }));
  const baselineRevenue = toNumber(snapshot.signals.revenue_recognized_minor_30d) / 100;
  const baselineBookings = toNumber(snapshot.signals.bookings_confirmed_30d);
  const baselineQueueLag = toNumber(snapshot.signals.queue_lag_score);

  const priceDelta = toNumber(assumptions.priceDeltaPercent, 0);
  const capacityDelta = toNumber(assumptions.capacityDeltaPercent, 0);
  const staffingDelta = toNumber(assumptions.staffingDeltaPercent, 0);

  const projection = {
    revenue: round(baselineRevenue * (1 + priceDelta * 0.6 + capacityDelta * 0.2)),
    bookings: round(
      baselineBookings *
        (1 - priceDelta * 0.35 + capacityDelta * 0.5 + staffingDelta * 0.15)
    ),
    queueLag: round(Math.max(0, baselineQueueLag * (1 - staffingDelta * 0.5))),
  };

  const delta = {
    revenue: round(projection.revenue - baselineRevenue),
    bookings: round(projection.bookings - baselineBookings),
    queueLag: round(projection.queueLag - baselineQueueLag),
  };

  const simulationKey = stableHash({
    businessId,
    scenarioType,
    assumptions,
    asOf: asOf.toISOString(),
  });

  return upsertSimulation({
    businessId,
    simulationKey,
    scenarioType,
    assumptions,
    baseline: {
      revenue: baselineRevenue,
      bookings: baselineBookings,
      queueLag: baselineQueueLag,
    },
    projection,
    delta,
    confidence: clamp(
      0.62 + Math.min(0.2, Math.abs(capacityDelta) * 0.1),
      0.4,
      0.92
    ),
    reason: "deterministic_simulation",
    featureSnapshotKey: null,
    metadata: {
      generatedAt: nowIso(),
    },
  });
};

export const runIntelligenceLoop = async ({
  businessId,
  asOf = new Date(),
  replayToken,
  snapshotOverride,
}: {
  businessId: string;
  asOf?: Date;
  replayToken?: string | null;
  snapshotOverride?: IntelligenceDomainSnapshot;
}): Promise<IntelligenceRunResult> => {
  const runId =
    replayToken ||
    stableHash({
      businessId,
      asOf: asOf.toISOString(),
      version: MODEL_VERSION,
    });

  if (shouldUseInMemory) {
    const store = getStore();

    if (store.runMarkers.has(runId)) {
      return {
        runId,
        businessId,
        snapshotKey: "replay",
        forecasts: 0,
        predictions: 0,
        optimizations: 0,
        recommendations: 0,
        anomalies: 0,
        experiments: 0,
        simulations: 0,
        rolledBack: 0,
        autoApplied: 0,
        drift: {
          feature: 0,
          prediction: 0,
          outcome: 0,
          status: "STABLE",
        },
      };
    }

    store.runMarkers.add(runId);
  }

  await enforceSecurityGovernanceInfluence({
    domain: "INTELLIGENCE",
    action: "analytics:view",
    businessId,
    tenantId: businessId,
    actorId: "intelligence_os",
    actorType: "SERVICE",
    role: "SERVICE",
    permissions: ["analytics:view"],
    scopes: ["READ_ONLY"],
    resourceType: "INTELLIGENCE_LOOP",
    resourceId: runId,
    resourceTenantId: businessId,
    purpose: "INTELLIGENCE_RUNTIME",
    metadata: {
      replayToken: replayToken || null,
    },
  });

  const policy = await getActivePolicy(businessId);
  const overrides = await listActiveManualOverrides(businessId, asOf);
  const guardrails = toRecord(policy.guardrails);
  const minLoopIntervalSeconds = Math.max(
    5,
    Math.floor(toNumber(guardrails.minLoopIntervalSeconds, 45))
  );
  const maxRunPerHour = Math.max(
    1,
    Math.floor(toNumber(guardrails.maxRunPerHour, 24))
  );
  const throttleBypass =
    Boolean(replayToken) ||
    hasOverride({ overrides, scope: "LOOP_THROTTLE_BYPASS" });
  const throttleState = shouldThrottleIntelligenceLoop({
    businessId,
    asOf,
    minLoopIntervalSeconds,
    maxRunsPerHour: maxRunPerHour,
    bypassThrottle: throttleBypass,
  });

  if (throttleState.blocked) {
    return {
      runId,
      businessId,
      snapshotKey: `throttled:${throttleState.reason}`,
      forecasts: 0,
      predictions: 0,
      optimizations: 0,
      recommendations: 0,
      anomalies: 0,
      experiments: 0,
      simulations: 0,
      rolledBack: 0,
      autoApplied: 0,
      drift: {
        feature: 0,
        prediction: 0,
        outcome: 0,
        status: "STABLE",
      },
    };
  }

  const snapshot =
    snapshotOverride ||
    (await collectIntelligenceDomainSnapshot({
      businessId,
      asOf,
    }));
  const featureSnapshot = await persistFeatureSnapshot({ snapshot });
  const history = await listRecentFeatureSnapshots(businessId, 28);

  await Promise.all([
    persistModelRegistry({
      businessId,
      modelDomain: "forecast",
      modelName: "deterministic_trend",
    }),
    persistModelRegistry({
      businessId,
      modelDomain: "prediction",
      modelName: "deterministic_scoring",
    }),
    persistModelRegistry({
      businessId,
      modelDomain: "optimization",
      modelName: "rule_optimizer",
    }),
    persistModelRegistry({
      businessId,
      modelDomain: "anomaly",
      modelName: "delta_detector",
    }),
  ]);

  const horizons: IntelligenceHorizon[] = [
    "DAILY",
    "WEEKLY",
    "MONTHLY",
    "QUARTERLY",
  ];
  const forecastRows: any[] = [];

  for (const metric of INTELLIGENCE_FORECAST_METRICS) {
    for (const horizon of horizons) {
      const computed = computeForecast({
        metric,
        horizon,
        currentSignals: snapshot.signals,
        history,
      });
      const windowEnd = new Date(
        asOf.getTime() + HORIZON_DAYS[horizon] * 24 * 60 * 60 * 1000
      );
      const forecastKey = stableHash({
        businessId,
        metric,
        horizon,
        windowStart: asOf.toISOString(),
        windowEnd: windowEnd.toISOString(),
        version: MODEL_VERSION,
      });

      const row = await upsertForecast({
        businessId,
        forecastKey,
        featureSnapshotKey: featureSnapshot.snapshotKey,
        modelKey: `${businessId}:forecast:deterministic_trend:${MODEL_VERSION}`,
        metric,
        horizon,
        version: 1,
        windowStart: asOf,
        windowEnd,
        predictedValue: computed.predictedValue,
        lowerBound: computed.lowerBound,
        upperBound: computed.upperBound,
        confidence: computed.confidence,
        trend: computed.trend,
        reason: computed.reason,
        explanation: computed.explanation,
      });

      forecastRows.push(row);
    }
  }

  const predictionRows: any[] = [];

  for (const lead of snapshot.leads) {
    const scoreMap = buildPredictionScores({
      signal: lead,
      businessSignals: snapshot.signals,
    });

    for (const predictionType of INTELLIGENCE_PREDICTION_TYPES) {
      const score = round(scoreMap[predictionType], 6);
      const confidence = round(
        clamp(
          0.58 +
            lead.compositeScore / 250 +
            (1 - Math.abs(0.5 - score) * 0.3),
          0.35,
          0.96
        ),
        6
      );
      const predictionKey = stableHash({
        businessId,
        leadId: lead.leadId,
        predictionType,
        snapshot: featureSnapshot.snapshotKey,
        model: MODEL_VERSION,
      });

      const row = await upsertPrediction({
        businessId,
        predictionKey,
        featureSnapshotKey: featureSnapshot.snapshotKey,
        modelKey: `${businessId}:prediction:deterministic_scoring:${MODEL_VERSION}`,
        entityType: "LEAD",
        entityId: lead.leadId,
        predictionType,
        score,
        confidence,
        scoreBand: scoreBand(score),
        validUntil: new Date(asOf.getTime() + 7 * 24 * 60 * 60 * 1000),
        reason: `deterministic_score:${predictionType}`,
        explanation: {
          lead,
          businessSignals: snapshot.signals,
          score,
        },
      });

      predictionRows.push(row);
    }
  }

  const avgCloseProbability = mean(
    predictionRows
      .filter((row) => row.predictionType === "close_probability")
      .map((row) => toNumber(row.score))
  );

  const avgChurnRisk = mean(
    predictionRows
      .filter((row) => row.predictionType === "churn_risk")
      .map((row) => toNumber(row.score))
  );

  const optimizationRows: any[] = [];

  for (const decisionType of INTELLIGENCE_OPTIMIZATION_TYPES) {
    const confidence = round(
      clamp(
        0.62 + avgCloseProbability * 0.2 + (1 - avgChurnRisk) * 0.15,
        0.35,
        0.95
      ),
      6
    );
    const riskScore = round(
      clamp(
        avgChurnRisk * 0.6 +
          (1 - avgCloseProbability) * 0.3 +
          toNumber(snapshot.signals.queue_lag_score) / 100,
        0.05,
        0.95
      ),
      6
    );

    const recommendedValue = {
      strategy: decisionType,
      adjustedBy: round((avgCloseProbability - avgChurnRisk) * 0.12, 6),
    };

    const decisionKey = stableHash({
      businessId,
      decisionType,
      snapshot: featureSnapshot.snapshotKey,
      model: MODEL_VERSION,
    });

    const row = await upsertOptimization({
      businessId,
      decisionKey,
      featureSnapshotKey: featureSnapshot.snapshotKey,
      modelKey: `${businessId}:optimization:rule_optimizer:${MODEL_VERSION}`,
      decisionType,
      targetType: "BUSINESS",
      targetId: businessId,
      currentValue: {
        queueLag: snapshot.signals.queue_lag_score,
        conversionRate: snapshot.signals.conversion_rate,
      },
      recommendedValue,
      expectedUplift: round((avgCloseProbability - avgChurnRisk) * 0.15, 6),
      confidence,
      riskScore,
      reason: `rule_optimizer:${decisionType}`,
      rollbackPlan: {
        strategy: "restore_previous_policy",
        scope: decisionType,
        trigger: "harm_detected_or_manual_override",
      },
      status: "RECOMMENDED",
      version: 1,
    });

    optimizationRows.push(row);
  }

  const recommendationRows: any[] = [];
  const maxAutoApplyPerRun = Math.max(
    1,
    Math.floor(toNumber(guardrails.maxAutoApplyPerRun, 4))
  );
  const maxOptimizationShift = Math.abs(
    toNumber(guardrails.maxOptimizationShift, 0.18)
  );
  const queueLagPauseThreshold = Math.max(
    1,
    Math.floor(toNumber(guardrails.queueLagPauseThreshold, 120))
  );
  const deadConsumerWaitingThreshold = Math.max(
    1,
    Math.floor(toNumber(guardrails.deadConsumerWaitingThreshold, 80))
  );
  const queueLagPauseTriggered =
    toNumber(snapshot.signals.worker_lag_signal) >= queueLagPauseThreshold ||
    toNumber(snapshot.signals.outbox_pending_count) >= deadConsumerWaitingThreshold ||
    toNumber(snapshot.signals.queue_lag_score) >= deadConsumerWaitingThreshold;
  const prioritizedOptimizations = [...optimizationRows].sort(
    (left, right) =>
      toNumber(right.expectedUplift) * toNumber(right.confidence) -
      toNumber(left.expectedUplift) * toNumber(left.confidence)
  );
  let remainingAutoApplyBudget = maxAutoApplyPerRun;

  for (const optimization of prioritizedOptimizations) {
    const autoApplyEnabled =
      Boolean(policy.autoApplyEnabled) &&
      !hasOverride({ overrides, scope: "AUTO_OPTIMIZATION_PAUSE" }) &&
      !hasOverride({ overrides, scope: "GLOBAL_PAUSE" });
    const autoApplyThreshold = toNumber(
      toRecord(policy.optimizationPolicy).autoApplyMinConfidence,
      0.75
    );
    const autoApplyMaxRisk = toNumber(
      toRecord(policy.optimizationPolicy).autoApplyMaxRisk,
      0.35
    );
    const shouldAutoApply =
      autoApplyEnabled &&
      toNumber(optimization.confidence) >= autoApplyThreshold &&
      toNumber(optimization.riskScore) <= autoApplyMaxRisk &&
      Math.abs(toNumber(toRecord(optimization.recommendedValue).adjustedBy, 0)) <=
        maxOptimizationShift &&
      !queueLagPauseTriggered &&
      remainingAutoApplyBudget > 0;

    const recommendationKey = stableHash({
      businessId,
      optimizationDecisionKey: optimization.decisionKey,
      snapshot: featureSnapshot.snapshotKey,
    });

    const recommendation = await upsertRecommendation({
      businessId,
      recommendationKey,
      optimizationDecisionKey: optimization.decisionKey,
      action: `apply_${optimization.decisionType}`,
      targetType: optimization.targetType,
      targetId: optimization.targetId,
      expectedUplift: optimization.expectedUplift,
      confidence: optimization.confidence,
      riskScore: optimization.riskScore,
      reason: optimization.reason,
      rollbackPlan: optimization.rollbackPlan,
      status: shouldAutoApply ? "AUTO_APPLIED" : "OPEN",
      autoAppliedAt: shouldAutoApply ? asOf : null,
      metadata: {
        snapshotKey: featureSnapshot.snapshotKey,
      },
    });

    recommendationRows.push(recommendation);

    if (shouldAutoApply) {
      remainingAutoApplyBudget -= 1;
      if (shouldUseInMemory) {
        const row = getStore().optimizations.get(optimization.decisionKey);
        if (row) {
          row.status = "APPLIED";
          row.appliedAt = asOf;
          row.approvalSource = "AUTO_POLICY";
          row.updatedAt = new Date();
          row.version = Math.max(1, Number(row.version || 1)) + 1;
          getStore().optimizations.set(optimization.decisionKey, row);
        }
      } else {
        await db.optimizationDecisionLedger.updateMany({
          where: {
            decisionKey: optimization.decisionKey,
            businessId,
            NOT: {
              status: "ROLLED_BACK",
            },
          },
          data: {
            status: "APPLIED",
            appliedAt: asOf,
            approvalSource: "AUTO_POLICY",
            version: {
              increment: 1,
            },
          },
        });
      }

      await createDurableOutboxEvent({
        businessId,
        eventType: "intelligence.optimization.applied",
        aggregateType: "optimization_decision_ledger",
        aggregateId: optimization.decisionKey,
        dedupeKey: toOutboxDedupe([
          "intelligence",
          "optimization",
          optimization.decisionKey,
          "applied",
        ]),
        payload: {
          businessId,
          decisionKey: optimization.decisionKey,
          recommendationKey,
          decisionType: optimization.decisionType,
          expectedUplift: optimization.expectedUplift,
          confidence: optimization.confidence,
        },
      });
    }
  }

  const baselineConversion = mean(
    history
      .slice(1, 8)
      .map((row) => toNumber(toRecord(toRecord(row.features).signals).conversion_rate))
      .filter((value) => Number.isFinite(value))
  );
  const currentConversion = toNumber(snapshot.signals.conversion_rate);
  const conversionDelta =
    baselineConversion > 0
      ? (currentConversion - baselineConversion) / baselineConversion
      : 0;

  const anomalyCandidates = [
    {
      type: "booking_drop",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).bookings_requested_30d))
      ),
      current: toNumber(snapshot.signals.bookings_requested_30d),
      trigger: "drop",
    },
    {
      type: "conversion_drop",
      baseline: baselineConversion,
      current: currentConversion,
      trigger: "drop",
    },
    {
      type: "refund_spike",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).refund_count_30d))
      ),
      current: toNumber(snapshot.signals.refund_count_30d),
      trigger: "spike",
    },
    {
      type: "chargeback_spike",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).chargeback_count_30d))
      ),
      current: toNumber(snapshot.signals.chargeback_count_30d),
      trigger: "spike",
    },
    {
      type: "queue_lag",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).queue_lag_score))
      ),
      current: toNumber(snapshot.signals.queue_lag_score),
      trigger: "spike",
    },
    {
      type: "worker_lag",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).worker_lag_signal))
      ),
      current: toNumber(snapshot.signals.worker_lag_signal),
      trigger: "spike",
    },
    {
      type: "calendar_sync_failure_spike",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).calendar_sync_failure_signal))
      ),
      current: toNumber(snapshot.signals.calendar_sync_failure_signal),
      trigger: "spike",
    },
    {
      type: "payment_failure_spike",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).payment_failures_7d))
      ),
      current: toNumber(snapshot.signals.payment_failures_7d),
      trigger: "spike",
    },
    {
      type: "churn_spike",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).churned_subscriptions_30d))
      ),
      current: toNumber(snapshot.signals.churned_subscriptions_30d),
      trigger: "spike",
    },
    {
      type: "staff_overload",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).forecast_signal_staffing))
      ),
      current: toNumber(snapshot.signals.forecast_signal_staffing),
      trigger: "spike",
    },
    {
      type: "spam_anomaly",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).spam_score_7d))
      ),
      current: toNumber(snapshot.signals.spam_score_7d),
      trigger: "spike",
    },
    {
      type: "provider_outage_anomaly",
      baseline: mean(
        history
          .slice(1, 8)
          .map((row) => toNumber(toRecord(toRecord(row.features).signals).provider_outage_signal))
      ),
      current: toNumber(snapshot.signals.provider_outage_signal),
      trigger: "spike",
    },
  ];

  let anomalyCount = 0;

  for (const candidate of anomalyCandidates) {
    if (candidate.baseline <= 0 && candidate.current <= 0) {
      continue;
    }

    const delta =
      candidate.baseline > 0
        ? (candidate.current - candidate.baseline) /
          Math.max(candidate.baseline, 0.0001)
        : candidate.current;

    const triggered =
      candidate.trigger === "drop"
        ? delta <= -toNumber(toRecord(policy.anomalyPolicy).dropThreshold, 0.3)
        : delta >= toNumber(toRecord(policy.anomalyPolicy).spikeThreshold, 0.3);

    if (!triggered) {
      continue;
    }

    const anomalyKey = stableHash({
      businessId,
      type: candidate.type,
      windowStart: asOf.toISOString().slice(0, 13),
    });

    const anomaly = await upsertAnomaly({
      businessId,
      anomalyKey,
      anomalyType: candidate.type,
      severity: determineAnomalySeverity(delta),
      status: "OPEN",
      detectedAt: asOf,
      baselineValue: round(candidate.baseline, 6),
      observedValue: round(candidate.current, 6),
      delta: round(delta, 6),
      threshold:
        candidate.trigger === "drop"
          ? -toNumber(toRecord(policy.anomalyPolicy).dropThreshold, 0.3)
          : toNumber(toRecord(policy.anomalyPolicy).spikeThreshold, 0.3),
      reason: `anomaly:${candidate.type}`,
      dedupeWindowStart: new Date(asOf.getTime() - 60 * 60 * 1000),
      dedupeWindowEnd: new Date(asOf.getTime() + 60 * 60 * 1000),
    });

    anomalyCount += anomaly ? 1 : 0;

    await createDurableOutboxEvent({
      businessId,
      eventType: "intelligence.anomaly.detected",
      aggregateType: "anomaly_ledger",
      aggregateId: anomaly.anomalyKey,
      dedupeKey: toOutboxDedupe(["anomaly", anomaly.anomalyKey]),
      payload: {
        businessId,
        anomalyKey: anomaly.anomalyKey,
        anomalyType: anomaly.anomalyType,
        severity: anomaly.severity,
        baselineValue: anomaly.baselineValue,
        observedValue: anomaly.observedValue,
        delta: anomaly.delta,
      },
    });
  }

  const experimentPayloads = [
    {
      experimentKey: `${businessId}:followup_timing:v1`,
      objective: "followup_timing_lift",
      variants: ["A_2H", "B_6H", "C_12H"],
    },
    {
      experimentKey: `${businessId}:discount_policy:v1`,
      objective: "discount_uplift",
      variants: ["A_5PCT", "B_8PCT"],
    },
  ];

  for (const experiment of experimentPayloads) {
    const variantExposure = experiment.variants.reduce<Record<string, number>>(
      (acc, key) => {
        acc[key] = 0;
        return acc;
      },
      {}
    );

    for (const lead of snapshot.leads) {
      const assigned = assignExperimentVariant({
        experimentKey: experiment.experimentKey,
        assignmentVersion: 1,
        entityId: lead.leadId,
        variants: experiment.variants,
      });

      if (!assigned) {
        continue;
      }

      variantExposure[assigned] = (variantExposure[assigned] || 0) + 1;
    }

    await upsertExperiment({
      businessId,
      experimentKey: experiment.experimentKey,
      experimentType: experiment.variants.length > 2 ? "MULTIVARIATE" : "A_B",
      objective: experiment.objective,
      assignmentVersion: 1,
      assignmentSeed: stableHash({ businessId, experiment: experiment.experimentKey }),
      variants: {
        options: experiment.variants,
      },
      guardrails: {
        maxNegativeLift: -0.03,
      },
      stopRules: {
        minSampleSize: toNumber(toRecord(policy.experimentPolicy).minSampleSize, 100),
      },
      status: "RUNNING",
      startedAt: asOf,
      exposures: snapshot.leads.length,
      conversions: Math.round(snapshot.leads.length * currentConversion),
      sampleSize: snapshot.leads.length,
      causalAttribution: {
        conversionRate: currentConversion,
        confidence: clamp(0.55 + snapshot.leads.length / 400, 0.4, 0.95),
        variantExposure,
      },
      metadata: {
        deterministicAssignment: true,
      },
    });
  }

  const featureDrift = Math.abs(
    safeRatio(
      toNumber(snapshot.signals.forecast_signal_revenue) -
        mean(
          history
            .slice(1, 8)
            .map((row) => toNumber(toRecord(toRecord(row.features).signals).forecast_signal_revenue))
        ),
      Math.max(
        1,
        mean(
          history
            .slice(1, 8)
            .map((row) => toNumber(toRecord(toRecord(row.features).signals).forecast_signal_revenue))
        )
      )
    )
  );

  const predictionDrift = Math.abs(avgCloseProbability - baselineConversion);
  const outcomeDrift = Math.abs(conversionDelta);
  const driftScore = Math.max(featureDrift, predictionDrift, outcomeDrift);
  const driftWarningThreshold = toNumber(
    toRecord(policy.driftPolicy).warningThreshold,
    0.12
  );
  const driftCriticalThreshold = toNumber(
    toRecord(policy.driftPolicy).criticalThreshold,
    0.2
  );
  const driftStatus: "STABLE" | "WARNING" | "CRITICAL" =
    driftScore >= driftCriticalThreshold
      ? "CRITICAL"
      : driftScore >= driftWarningThreshold
      ? "WARNING"
      : "STABLE";

  let rolledBack = 0;

  if (
    driftStatus === "CRITICAL" &&
    !hasOverride({ overrides, scope: "DRIFT_AUTO_ROLLBACK_DISABLE" }) &&
    toRecord(policy.driftPolicy).autoRollbackOnCritical !== false
  ) {
    const applied = optimizationRows.filter((row) => row.status === "APPLIED");

    for (const decision of applied) {
      const rolled = await rollbackOptimizationDecision({
        businessId,
        decisionKey: decision.decisionKey,
        reason: "critical_drift_detected",
      });

      if (rolled) {
        rolledBack += 1;
      }
    }
  }

  if (driftStatus !== "STABLE") {
    await createOwnerFeed({
      businessId,
      title: "Intelligence drift signal",
      message: `Drift status ${driftStatus} detected for intelligence policy.`,
      payload: {
        featureDrift,
        predictionDrift,
        outcomeDrift,
      },
    });
  }

  await createDurableOutboxEvent({
    businessId,
    eventType: "intelligence.loop.completed",
    aggregateType: "intelligence_loop",
    aggregateId: runId,
    dedupeKey: toOutboxDedupe(["intelligence", "loop", runId]),
    payload: {
      businessId,
      runId,
      snapshotKey: featureSnapshot.snapshotKey,
      counts: {
        forecasts: forecastRows.length,
        predictions: predictionRows.length,
        optimizations: optimizationRows.length,
        recommendations: recommendationRows.length,
        anomalies: anomalyCount,
      },
      drift: {
        featureDrift,
        predictionDrift,
        outcomeDrift,
        driftStatus,
      },
    },
  });

  return {
    runId,
    businessId,
    snapshotKey: featureSnapshot.snapshotKey,
    forecasts: forecastRows.length,
    predictions: predictionRows.length,
    optimizations: optimizationRows.length,
    recommendations: recommendationRows.length,
    anomalies: anomalyCount,
    experiments: experimentPayloads.length,
    simulations: 0,
    rolledBack,
    autoApplied: recommendationRows.filter((row) => row.status === "AUTO_APPLIED")
      .length,
    drift: {
      feature: round(featureDrift, 6),
      prediction: round(predictionDrift, 6),
      outcome: round(outcomeDrift, 6),
      status: driftStatus,
    },
  };
};

export const __intelligencePhase5ETestInternals = {
  getStore,
  stableHash,
  assignExperimentVariant,
  buildPredictionScores,
  computeForecast,
  buildSnapshotSignals,
};
