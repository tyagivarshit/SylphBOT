import crypto from "crypto";
import { isQueueRedisWritable } from "../config/redis";
import prisma from "../config/prisma";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
import { getRedisCircuitState, isRedisCircuitOpen } from "../redis/redisSafety";
import { recordObservabilityEvent } from "./reliability/reliabilityOS.service";
import {
  enqueueIntegrationOnboardingProjectionReconcile,
  type IntegrationOnboardingProjectionJobPayload,
} from "../queues/integrationOnboardingProjection.queue";

const RECOVERY_AUTHORITY = "INTEGRATION_ONBOARDING_ISOLATION";
const RECOVERY_SUBSYSTEM = "PROJECTION_RECONCILE";
const RECOVERY_ENGINE = "INTEGRATION_ONBOARDING_PROJECTION";
const RECOVERY_STATUS_PENDING = "PENDING";
const RECOVERY_STATUS_COMPLETED = "COMPLETED";

const RECOVERY_REPLAY_LIMIT = Math.max(
  1,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_REPLAY_LIMIT || 20)
);
const RECOVERY_REPLAY_MAX_ATTEMPTS = Math.max(
  3,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_MAX_ATTEMPTS || 16)
);
const RECOVERY_REPLAY_BASE_BACKOFF_MS = Math.max(
  250,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_BACKOFF_BASE_MS || 2_000)
);
const RECOVERY_REPLAY_MAX_BACKOFF_MS = Math.max(
  RECOVERY_REPLAY_BASE_BACKOFF_MS,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_BACKOFF_MAX_MS || 900_000)
);
const RECOVERY_REPLAY_JITTER_MS = Math.max(
  0,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_BACKOFF_JITTER_MS || 1_500)
);
const RECOVERY_REPLAY_DEDUPE_WINDOW_MS = Math.max(
  250,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_DEDUPE_WINDOW_MS || 10_000)
);
const RECOVERY_REPLAY_MIN_CADENCE_MS = Math.max(
  250,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_MIN_CADENCE_MS || 20_000)
);
const RECOVERY_REPLAY_SUSPEND_MS = Math.max(
  RECOVERY_REPLAY_MIN_CADENCE_MS,
  Number(process.env.INTEGRATION_PROJECTION_RECOVERY_SUSPEND_MS || 60_000)
);

const normalizeIdentifier = (value: unknown) => String(value || "").trim();

const isMongoObjectId = (value: string) => /^[a-f0-9]{24}$/i.test(value);

const stableHash = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toPositiveInt = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const toTimestampMs = (value: unknown) => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const getReplayAttemptForBackoff = (attempt: number) =>
  Math.min(RECOVERY_REPLAY_MAX_ATTEMPTS, Math.max(1, Math.floor(attempt)));

const computeReplayBackoffPlan = (attempt: number) => {
  const boundedAttempt = getReplayAttemptForBackoff(attempt);
  const exponentialBackoffMs = Math.min(
    RECOVERY_REPLAY_BASE_BACKOFF_MS * 2 ** Math.max(0, boundedAttempt - 1),
    RECOVERY_REPLAY_MAX_BACKOFF_MS
  );
  const jitterMs =
    RECOVERY_REPLAY_JITTER_MS > 0
      ? Math.floor(Math.random() * (RECOVERY_REPLAY_JITTER_MS + 1))
      : 0;
  const backoffMs = Math.min(
    RECOVERY_REPLAY_MAX_BACKOFF_MS,
    exponentialBackoffMs + jitterMs
  );
  return {
    boundedAttempt,
    backoffMs,
    jitterMs,
  };
};

const buildRecoveryIdentity = (input: {
  businessId: string;
  tenantId: string;
  reason: string;
}) => {
  const deterministicPlanHash = stableHash({
    authority: RECOVERY_AUTHORITY,
    subsystem: RECOVERY_SUBSYSTEM,
    businessId: input.businessId,
    tenantId: input.tenantId,
    reason: input.reason,
    jobType: "ONBOARDING_RECONCILE",
  });

  const replayToken = `projection_recovery_${deterministicPlanHash.slice(0, 32)}`;
  const recoveryKey = `projection_recovery:${deterministicPlanHash.slice(0, 28)}`;

  return {
    deterministicPlanHash,
    replayToken,
    recoveryKey,
  };
};

export type DeferredProjectionRecoveryResult = {
  recoveryKey: string;
  replayToken: string;
  retryAttempt: number;
  queueDepth: number | null;
};

export const getIntegrationProjectionRecoveryQueueDepth = async () =>
  prisma.infrastructureRecoveryLedger.count({
    where: {
      authority: RECOVERY_AUTHORITY,
      subsystem: RECOVERY_SUBSYSTEM,
      status: RECOVERY_STATUS_PENDING,
    },
  });

export const scheduleDeferredIntegrationProjectionReconcile = async (input: {
  businessId: string;
  tenantId?: string | null;
  reason?: string | null;
  source?: string | null;
  queueError?: string | null;
  includeQueueDepth?: boolean;
}): Promise<DeferredProjectionRecoveryResult> => {
  const businessId = normalizeIdentifier(input.businessId);
  const tenantId = normalizeIdentifier(input.tenantId || input.businessId) || businessId;
  const reason = normalizeIdentifier(input.reason) || "projection_refresh";
  const source = normalizeIdentifier(input.source) || "runtime_degraded";
  const queueError = normalizeIdentifier(input.queueError) || "queue_unavailable";

  const identity = buildRecoveryIdentity({
    businessId,
    tenantId,
    reason,
  });

  const existing = await prisma.infrastructureRecoveryLedger.findUnique({
    where: {
      recoveryKey: identity.recoveryKey,
    },
    select: {
      metadata: true,
      replayToken: true,
      status: true,
    },
  });

  const existingMetadata = toRecord(existing?.metadata);
  const nowMs = Date.now();
  const deferredAtMs = toTimestampMs(existingMetadata.deferredAtIso);
  const replayRequestedAtMs = toTimestampMs(existingMetadata.lastReplayRequestedAtIso);
  const mostRecentScheduleMs = Math.max(deferredAtMs || 0, replayRequestedAtMs || 0);
  const currentRetryAttempt = toPositiveInt(existingMetadata.retryAttempt, 0);

  if (
    existing?.status === RECOVERY_STATUS_PENDING &&
    mostRecentScheduleMs > 0 &&
    nowMs - mostRecentScheduleMs < RECOVERY_REPLAY_DEDUPE_WINDOW_MS
  ) {
    const dedupeQueueDepth =
      input.includeQueueDepth !== false
        ? await getIntegrationProjectionRecoveryQueueDepth().catch(() => null)
        : null;
    emitPerformanceMetric({
      name: "replay_suppressed_count",
      value: 1,
      businessId,
      route: "integrations_onboarding_recovery",
      metadata: {
        recoveryKey: identity.recoveryKey,
        reason,
        source,
        suppression: "dedupe_window",
        dedupeWindowMs: RECOVERY_REPLAY_DEDUPE_WINDOW_MS,
      },
    });
    return {
      recoveryKey: identity.recoveryKey,
      replayToken: existing?.replayToken || identity.replayToken,
      retryAttempt: currentRetryAttempt,
      queueDepth: dedupeQueueDepth,
    };
  }

  const retryAttempt = Math.min(
    RECOVERY_REPLAY_MAX_ATTEMPTS,
    Math.max(1, currentRetryAttempt + 1)
  );
  const backoffPlan = computeReplayBackoffPlan(retryAttempt);
  const nextReplayAtIso = new Date(nowMs + backoffPlan.backoffMs).toISOString();
  const now = new Date(nowMs);
  const payload: IntegrationOnboardingProjectionJobPayload = {
    type: "ONBOARDING_RECONCILE",
    businessId,
    tenantId,
    reason,
    source: `${source}_deferred`,
  };

  await prisma.infrastructureRecoveryLedger.upsert({
    where: {
      recoveryKey: identity.recoveryKey,
    },
    create: {
      recoveryKey: identity.recoveryKey,
      businessId: isMongoObjectId(businessId) ? businessId : null,
      tenantId,
      authority: RECOVERY_AUTHORITY,
      subsystem: RECOVERY_SUBSYSTEM,
      engine: RECOVERY_ENGINE,
      trigger: "QUEUE_UNAVAILABLE",
      status: RECOVERY_STATUS_PENDING,
      replayToken: existing?.replayToken || identity.replayToken,
      deterministicPlanHash: identity.deterministicPlanHash,
      actions: [payload],
      reason,
      metadata: {
        source,
        queueError,
        retryAttempt,
        replayBackoffMs: backoffPlan.backoffMs,
        replayJitterMs: backoffPlan.jitterMs,
        nextReplayAtIso,
        deferredAtIso: now.toISOString(),
        lastReplayRequestedAtIso: now.toISOString(),
        replaySafe: true,
        resumable: true,
      },
    },
    update: {
      status: RECOVERY_STATUS_PENDING,
      trigger: "QUEUE_UNAVAILABLE",
      replayToken: existing?.replayToken || identity.replayToken,
      actions: [payload],
      reason,
      metadata: {
        ...existingMetadata,
        source,
        queueError,
        retryAttempt,
        replayBackoffMs: backoffPlan.backoffMs,
        replayJitterMs: backoffPlan.jitterMs,
        nextReplayAtIso,
        deferredAtIso: now.toISOString(),
        lastReplayRequestedAtIso: now.toISOString(),
        replaySafe: true,
        resumable: true,
      },
      completedAt: null,
      updatedAt: now,
    },
  });

  emitPerformanceMetric({
    name: "replay_backoff_ms",
    value: backoffPlan.backoffMs,
    businessId,
    route: "integrations_onboarding_recovery",
    metadata: {
      recoveryKey: identity.recoveryKey,
      retryAttempt,
      source,
      reason,
      nextReplayAtIso,
    },
  });
  emitPerformanceMetric({
    name: "replay_retry_jitter_ms",
    value: backoffPlan.jitterMs,
    businessId,
    route: "integrations_onboarding_recovery",
    metadata: {
      recoveryKey: identity.recoveryKey,
      retryAttempt,
      source,
      reason,
    },
  });

  const includeQueueDepth = input.includeQueueDepth !== false;
  const queueDepth = includeQueueDepth
    ? await getIntegrationProjectionRecoveryQueueDepth().catch(() => null)
    : null;
  if (queueDepth !== null) {
    emitPerformanceMetric({
      name: "projection_recovery_queue_depth",
      value: queueDepth,
      businessId,
      route: "integrations_onboarding_recovery",
      metadata: {
        recoveryKey: identity.recoveryKey,
        reason,
        source,
        retryAttempt,
      },
    });
  }
  void recordObservabilityEvent({
    businessId,
    tenantId,
    eventType: "onboarding_replay_started",
    message: "onboarding_replay_started:deferred_projection_reconcile",
    severity: "info",
    context: {
      component: "integrations_onboarding_recovery",
      phase: "deferred_schedule",
    },
    metadata: {
      recoveryKey: identity.recoveryKey,
      reason,
      source,
      retryAttempt,
      queueError,
      queueDepth,
      nextReplayAtIso,
      replayBackoffMs: backoffPlan.backoffMs,
      replayJitterMs: backoffPlan.jitterMs,
    },
  }).catch(() => undefined);

  return {
    recoveryKey: identity.recoveryKey,
    replayToken: existing?.replayToken || identity.replayToken,
    retryAttempt,
    queueDepth,
  };
};

export const replayDeferredIntegrationProjectionReconciles = async (input?: {
  limit?: number;
}) => {
  const limit = Math.max(1, Number(input?.limit || RECOVERY_REPLAY_LIMIT));
  const queueWritable = isQueueRedisWritable();
  const redisCircuit = getRedisCircuitState();

  if (!queueWritable || isRedisCircuitOpen()) {
    const queueDepth = await getIntegrationProjectionRecoveryQueueDepth().catch(() => 0);
    emitPerformanceMetric({
      name: "replay_suppressed_count",
      value: queueDepth,
      route: "integrations_onboarding_recovery",
      metadata: {
        suppression: queueWritable ? "redis_circuit_open" : "queue_not_writable",
        suspendMs: RECOVERY_REPLAY_SUSPEND_MS,
        queueDepth,
        redisCircuitOpen: redisCircuit.isOpen,
      },
    });
    if (redisCircuit.isOpen) {
      emitPerformanceMetric({
        name: "redis_circuit_open_ms",
        value: redisCircuit.openDurationMs,
        route: "integrations_onboarding_recovery",
        metadata: {
          suppression: "replay_batch_suspended",
          queueDepth,
        },
      });
    }
    return {
      batchSize: 0,
      replayed: 0,
      deferred: 0,
      failed: 0,
      suppressed: queueDepth,
      queueDepth,
    };
  }

  const pendingRows = await prisma.infrastructureRecoveryLedger.findMany({
    where: {
      authority: RECOVERY_AUTHORITY,
      subsystem: RECOVERY_SUBSYSTEM,
      status: RECOVERY_STATUS_PENDING,
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: Math.max(limit, limit * 3),
  });

  let replayed = 0;
  let deferred = 0;
  let failed = 0;
  let suppressed = 0;
  let attempted = 0;

  if (pendingRows.length > 0) {
    void recordObservabilityEvent({
      businessId: null,
      tenantId: null,
      eventType: "onboarding_replay_started",
      message: `onboarding_replay_started:pending=${pendingRows.length}`,
      severity: "info",
      context: {
        component: "integrations_onboarding_recovery",
        phase: "replay_batch",
      },
      metadata: {
        pending: pendingRows.length,
        limit,
      },
    }).catch(() => undefined);
  }

  const nowMs = Date.now();

  for (const row of pendingRows) {
    if (attempted >= limit) {
      break;
    }

    const actions = Array.isArray(row.actions) ? row.actions : [];
    const action = (actions[0] || {}) as Partial<IntegrationOnboardingProjectionJobPayload>;
    const businessId = normalizeIdentifier(action.businessId || row.tenantId || row.businessId);
    const tenantId = normalizeIdentifier(action.tenantId || row.tenantId || businessId) || businessId;
    const reason = normalizeIdentifier(action.reason || row.reason) || "projection_refresh";
    const source = normalizeIdentifier(action.source) || "projection_recovery_replay";
    const metadata = toRecord(row.metadata);
    const retryAttempt = Math.min(
      RECOVERY_REPLAY_MAX_ATTEMPTS,
      Math.max(1, toPositiveInt(metadata.retryAttempt, 0))
    );
    const nextReplayAtMs = toTimestampMs(metadata.nextReplayAtIso);
    if (nextReplayAtMs !== null && nowMs < nextReplayAtMs) {
      suppressed += 1;
      continue;
    }

    const lastReplayAttemptAtMs = Math.max(
      toTimestampMs(metadata.lastReplayAttemptAtIso) || 0,
      toTimestampMs(metadata.replayedAtIso) || 0
    );
    if (
      lastReplayAttemptAtMs > 0 &&
      nowMs - lastReplayAttemptAtMs < RECOVERY_REPLAY_MIN_CADENCE_MS
    ) {
      suppressed += 1;
      continue;
    }

    attempted += 1;

    if (!businessId) {
      failed += 1;
      const plan = computeReplayBackoffPlan(retryAttempt + 1);
      emitPerformanceMetric({
        name: "replay_backoff_ms",
        value: plan.backoffMs,
        route: "integrations_onboarding_recovery",
        metadata: {
          recoveryKey: row.recoveryKey,
          retryAttempt: plan.boundedAttempt,
          reason: "missing_business_id",
        },
      });
      emitPerformanceMetric({
        name: "replay_retry_jitter_ms",
        value: plan.jitterMs,
        route: "integrations_onboarding_recovery",
        metadata: {
          recoveryKey: row.recoveryKey,
          retryAttempt: plan.boundedAttempt,
          reason: "missing_business_id",
        },
      });
      await prisma.infrastructureRecoveryLedger.update({
        where: {
          recoveryKey: row.recoveryKey,
        },
        data: {
          status: RECOVERY_STATUS_PENDING,
          metadata: {
            ...metadata,
            replayError: "missing_business_id",
            retryAttempt: plan.boundedAttempt,
            replayedAtIso: new Date().toISOString(),
            lastReplayAttemptAtIso: new Date().toISOString(),
            replayBackoffMs: plan.backoffMs,
            replayJitterMs: plan.jitterMs,
            nextReplayAtIso: new Date(Date.now() + plan.backoffMs).toISOString(),
          },
          updatedAt: new Date(),
        },
      });
      continue;
    }

    try {
      const enqueueResult = await enqueueIntegrationOnboardingProjectionReconcile({
        type: "ONBOARDING_RECONCILE",
        businessId,
        tenantId,
        reason,
        source,
      });

      emitPerformanceMetric({
        name: "deferred_reconcile_retry_count",
        value: 1,
        businessId,
        route: "integrations_onboarding_recovery",
        metadata: {
          recoveryKey: row.recoveryKey,
          retryAttempt,
          queueUnavailable: enqueueResult.queueUnavailable,
        },
      });

      if (enqueueResult.enqueued) {
        replayed += 1;
        void recordObservabilityEvent({
          businessId,
          tenantId,
          eventType: "onboarding_replay_completed",
          message: "onboarding_replay_completed:projection_reconcile_enqueued",
          severity: "info",
          context: {
            component: "integrations_onboarding_recovery",
            phase: "replay",
          },
          metadata: {
            recoveryKey: row.recoveryKey,
            retryAttempt,
            jobId: enqueueResult.jobId,
            queueUnavailable: false,
          },
        }).catch(() => undefined);
        await prisma.infrastructureRecoveryLedger.update({
          where: {
            recoveryKey: row.recoveryKey,
          },
          data: {
            status: RECOVERY_STATUS_COMPLETED,
            completedAt: new Date(),
            metadata: {
              ...metadata,
              retryAttempt,
              replayedAtIso: new Date().toISOString(),
              lastReplayAttemptAtIso: new Date().toISOString(),
              replayJobId: enqueueResult.jobId,
              replayQueueUnavailable: false,
            },
            updatedAt: new Date(),
          },
        });
      } else {
        deferred += 1;
        const plan = computeReplayBackoffPlan(retryAttempt + 1);
        emitPerformanceMetric({
          name: "replay_backoff_ms",
          value: plan.backoffMs,
          businessId,
          route: "integrations_onboarding_recovery",
          metadata: {
            recoveryKey: row.recoveryKey,
            retryAttempt: plan.boundedAttempt,
            reason: enqueueResult.reason || "queue_unavailable",
          },
        });
        emitPerformanceMetric({
          name: "replay_retry_jitter_ms",
          value: plan.jitterMs,
          businessId,
          route: "integrations_onboarding_recovery",
          metadata: {
            recoveryKey: row.recoveryKey,
            retryAttempt: plan.boundedAttempt,
            reason: enqueueResult.reason || "queue_unavailable",
          },
        });
        void recordObservabilityEvent({
          businessId,
          tenantId,
          eventType: "onboarding_replay_failed",
          message: "onboarding_replay_failed:queue_unavailable",
          severity: "error",
          context: {
            component: "integrations_onboarding_recovery",
            phase: "replay",
          },
          metadata: {
            recoveryKey: row.recoveryKey,
            retryAttempt,
            queueUnavailable: true,
            reason: enqueueResult.reason || "queue_unavailable",
          },
        }).catch(() => undefined);
        await prisma.infrastructureRecoveryLedger.update({
          where: {
            recoveryKey: row.recoveryKey,
          },
          data: {
            status: RECOVERY_STATUS_PENDING,
            metadata: {
              ...metadata,
              retryAttempt: plan.boundedAttempt,
              replayedAtIso: new Date().toISOString(),
              lastReplayAttemptAtIso: new Date().toISOString(),
              replayQueueUnavailable: true,
              replayError: enqueueResult.reason,
              replayBackoffMs: plan.backoffMs,
              replayJitterMs: plan.jitterMs,
              nextReplayAtIso: new Date(Date.now() + plan.backoffMs).toISOString(),
            },
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      failed += 1;
      const plan = computeReplayBackoffPlan(retryAttempt + 1);
      emitPerformanceMetric({
        name: "replay_backoff_ms",
        value: plan.backoffMs,
        businessId,
        route: "integrations_onboarding_recovery",
        metadata: {
          recoveryKey: row.recoveryKey,
          retryAttempt: plan.boundedAttempt,
          reason: normalizeIdentifier((error as Error)?.message) || "recovery_replay_failed",
        },
      });
      emitPerformanceMetric({
        name: "replay_retry_jitter_ms",
        value: plan.jitterMs,
        businessId,
        route: "integrations_onboarding_recovery",
        metadata: {
          recoveryKey: row.recoveryKey,
          retryAttempt: plan.boundedAttempt,
          reason: normalizeIdentifier((error as Error)?.message) || "recovery_replay_failed",
        },
      });
      void recordObservabilityEvent({
        businessId,
        tenantId,
        eventType: "onboarding_replay_failed",
        message: "onboarding_replay_failed:exception",
        severity: "error",
        context: {
          component: "integrations_onboarding_recovery",
          phase: "replay",
        },
        metadata: {
          recoveryKey: row.recoveryKey,
          retryAttempt,
          reason:
            normalizeIdentifier((error as Error)?.message) || "recovery_replay_failed",
        },
      }).catch(() => undefined);
      await prisma.infrastructureRecoveryLedger.update({
        where: {
          recoveryKey: row.recoveryKey,
        },
        data: {
          status: RECOVERY_STATUS_PENDING,
          metadata: {
            ...metadata,
            retryAttempt: plan.boundedAttempt,
            replayError:
              normalizeIdentifier((error as Error)?.message) || "recovery_replay_failed",
            replayedAtIso: new Date().toISOString(),
            lastReplayAttemptAtIso: new Date().toISOString(),
            replayBackoffMs: plan.backoffMs,
            replayJitterMs: plan.jitterMs,
            nextReplayAtIso: new Date(Date.now() + plan.backoffMs).toISOString(),
          },
          updatedAt: new Date(),
        },
      });
    }
  }

  const queueDepth = await getIntegrationProjectionRecoveryQueueDepth().catch(() => 0);
  const queueRecoverySuccessRate =
    attempted <= 0 ? 1 : Number((replayed / Math.max(1, attempted)).toFixed(4));

  if (suppressed > 0) {
    emitPerformanceMetric({
      name: "replay_suppressed_count",
      value: suppressed,
      route: "integrations_onboarding_recovery",
      metadata: {
        limit,
        queueDepth,
        minCadenceMs: RECOVERY_REPLAY_MIN_CADENCE_MS,
      },
    });
  }

  emitPerformanceMetric({
    name: "queue_recovery_success_rate",
    value: queueRecoverySuccessRate,
    route: "integrations_onboarding_recovery",
    metadata: {
      replayed,
      attempted,
      deferred,
      failed,
      suppressed,
    },
  });
  emitPerformanceMetric({
    name: "projection_recovery_queue_depth",
    value: queueDepth,
    route: "integrations_onboarding_recovery",
    metadata: {
      replayed,
      deferred,
      failed,
      suppressed,
      attempted,
      batchSize: pendingRows.length,
    },
  });

  return {
    batchSize: pendingRows.length,
    replayed,
    deferred,
    failed,
    suppressed,
    queueDepth,
  };
};
