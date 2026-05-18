import crypto from "crypto";
import prisma from "../config/prisma";
import { emitPerformanceMetric } from "../observability/performanceMetrics";
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
  queueDepth: number;
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
    },
  });

  const existingMetadata = toRecord(existing?.metadata);
  const retryAttempt = toPositiveInt(existingMetadata.retryAttempt, 0) + 1;
  const now = new Date();
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
        deferredAtIso: now.toISOString(),
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
        deferredAtIso: now.toISOString(),
        replaySafe: true,
        resumable: true,
      },
      completedAt: null,
      updatedAt: now,
    },
  });

  const queueDepth = await getIntegrationProjectionRecoveryQueueDepth().catch(() => 0);
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
  const pendingRows = await prisma.infrastructureRecoveryLedger.findMany({
    where: {
      authority: RECOVERY_AUTHORITY,
      subsystem: RECOVERY_SUBSYSTEM,
      status: RECOVERY_STATUS_PENDING,
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: limit,
  });

  let replayed = 0;
  let deferred = 0;
  let failed = 0;

  for (const row of pendingRows) {
    const actions = Array.isArray(row.actions) ? row.actions : [];
    const action = (actions[0] || {}) as Partial<IntegrationOnboardingProjectionJobPayload>;
    const businessId = normalizeIdentifier(action.businessId || row.tenantId || row.businessId);
    const tenantId = normalizeIdentifier(action.tenantId || row.tenantId || businessId) || businessId;
    const reason = normalizeIdentifier(action.reason || row.reason) || "projection_refresh";
    const source = normalizeIdentifier(action.source) || "projection_recovery_replay";
    const metadata = toRecord(row.metadata);
    const retryAttempt = toPositiveInt(metadata.retryAttempt, 0) + 1;

    if (!businessId) {
      failed += 1;
      await prisma.infrastructureRecoveryLedger.update({
        where: {
          recoveryKey: row.recoveryKey,
        },
        data: {
          metadata: {
            ...metadata,
            replayError: "missing_business_id",
            retryAttempt,
            replayedAtIso: new Date().toISOString(),
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
              replayJobId: enqueueResult.jobId,
              replayQueueUnavailable: false,
            },
            updatedAt: new Date(),
          },
        });
      } else {
        deferred += 1;
        await prisma.infrastructureRecoveryLedger.update({
          where: {
            recoveryKey: row.recoveryKey,
          },
          data: {
            status: RECOVERY_STATUS_PENDING,
            metadata: {
              ...metadata,
              retryAttempt,
              replayedAtIso: new Date().toISOString(),
              replayQueueUnavailable: true,
              replayError: enqueueResult.reason,
            },
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      failed += 1;
      await prisma.infrastructureRecoveryLedger.update({
        where: {
          recoveryKey: row.recoveryKey,
        },
        data: {
          status: RECOVERY_STATUS_PENDING,
          metadata: {
            ...metadata,
            retryAttempt,
            replayError:
              normalizeIdentifier((error as Error)?.message) || "recovery_replay_failed",
            replayedAtIso: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });
    }
  }

  const queueDepth = await getIntegrationProjectionRecoveryQueueDepth().catch(() => 0);
  emitPerformanceMetric({
    name: "projection_recovery_queue_depth",
    value: queueDepth,
    route: "integrations_onboarding_recovery",
    metadata: {
      replayed,
      deferred,
      failed,
      batchSize: pendingRows.length,
    },
  });

  return {
    batchSize: pendingRows.length,
    replayed,
    deferred,
    failed,
    queueDepth,
  };
};
