import { Job, Worker } from "bullmq";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { env } from "../config/env";
import { getWorkerRedisConnection } from "../config/redis";
import {
  INBOUND_INTERACTION_SELECT,
  buildInboundInteractionFingerprint,
  createInteractionNormalizerService,
  toInboundInteractionRecord,
} from "../services/interactionNormalizer.service";
import { createReceptionClassifierService } from "../services/receptionClassifier.service";
import { createInboxRouterService } from "../services/inboxRouter.service";
import { createHumanQueueService } from "../services/humanQueue.service";
import { createReceptionMemoryService } from "../services/receptionMemory.service";
import {
  DEFAULT_SLA_POLICY_MATRIX,
  evaluateSlaPolicy,
} from "../services/slaPolicy.service";
import {
  publishReceptionEvent,
} from "../services/receptionEvent.service";
import {
  mergeJsonRecords,
  normalizeToken,
  toRecord,
  type CanonicalInteractionType,
  type InboxRouteTarget,
  type ReceptionContextReferences,
} from "../services/reception.shared";
import { scoreInboundPriority } from "../services/priorityEngine.service";
import {
  projectInboundInteractionToLegacyInbox,
} from "../services/inboundLegacyProjection.service";
import {
  incrementReceptionMetric,
  setReceptionQueueDepth,
} from "../services/receptionMetrics.service";
import {
  resolveReceptionContext,
  resolveReceptionControlGate,
  resolveFreshReceptionExecutionGate,
} from "../services/receptionContext.service";
import {
  enqueueInboundClassification,
  enqueueInboundRouting,
  enqueueReceptionRuntimeDeadLetter,
  enqueueRevenueBrainBridge,
  type InboundClassificationJobPayload,
  type InboundNormalizationJobPayload,
  type InboundRoutingJobPayload,
  type RevenueBrainBridgeJobPayload,
  INBOUND_CLASSIFICATION_QUEUE,
  INBOUND_NORMALIZATION_QUEUE,
  INBOUND_ROUTING_QUEUE,
  REVENUE_BRAIN_BRIDGE_QUEUE,
} from "../queues/receptionRuntime.queue";
import { withRedisWorkerFailSafe } from "../queues/queue.defaults";
import logger from "../utils/logger";
import { captureExceptionWithContext } from "../observability/sentry";
import { enqueueAIBatch } from "../queues/ai.queue";
import {
  markInboundInteractionFailed,
  transitionInboundInteraction,
} from "../services/inboundLifecycle.service";

const normalizer = createInteractionNormalizerService();
const classifier = createReceptionClassifierService();
const inboxRouter = createInboxRouterService();
const humanQueue = createHumanQueueService();
const receptionMemory = createReceptionMemoryService();

const shouldRunWorker =
  process.env.RUN_WORKER === "true" ||
  process.env.RUN_WORKER === undefined;

const globalForReceptionWorkers = globalThis as typeof globalThis & {
  __sylphReceptionRuntimeWorkers?: Worker[];
};

const loadInteraction = async (interactionId: string) => {
  const row = await prisma.inboundInteraction.findUnique({
    where: {
      id: interactionId,
    },
    select: INBOUND_INTERACTION_SELECT,
  });

  return row ? toInboundInteractionRecord(row) : null;
};

const loadInteractionOrThrow = async (interactionId: string) => {
  const interaction = await loadInteraction(interactionId);

  if (!interaction) {
    throw new Error(`interaction_not_found:${interactionId}`);
  }

  return interaction;
};

const updateInteractionMetadata = async ({
  interactionId,
  metadata,
}: {
  interactionId: string;
  metadata: Record<string, unknown> | null;
}) =>
  prisma.inboundInteraction.update({
    where: {
      id: interactionId,
    },
    data: {
      metadata: metadata as Prisma.InputJsonValue,
    },
    select: INBOUND_INTERACTION_SELECT,
  });

const getQueueDepth = async (queueType: string) => {
  const depth = await prisma.humanWorkQueue.count({
    where: {
      queueType,
      state: {
        in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ESCALATED"],
      },
    },
  });

  setReceptionQueueDepth(queueType, depth);
  return depth;
};

const getQueueTypeForRouteDecision = (routeDecision: InboxRouteTarget) => {
  switch (routeDecision) {
    case "OWNER":
      return "OWNER_REVIEW";
    case "ESCALATION":
      return "ESCALATION";
    case "BILLING":
      return "BILLING";
    case "APPOINTMENTS":
      return "APPOINTMENTS";
    default:
      return "SUPPORT";
  }
};

const buildClassificationSnapshot = (interaction: ReturnType<typeof toInboundInteractionRecord>) => {
  const metadata = toRecord(interaction.metadata);
  const classificationDecision = toRecord(metadata.classificationDecision);
  const reasons = Array.isArray(classificationDecision.reasons)
    ? classificationDecision.reasons.map((reason) => String(reason))
    : [];

  return {
    intentClass: interaction.intentClass || "GENERAL",
    urgencyClass: interaction.urgencyClass || "LOW",
    sentimentClass: interaction.sentimentClass || "NEUTRAL",
    spamScore: interaction.spamScore,
    routeHint: (classificationDecision.routeHint ||
      interaction.routeDecision ||
      "REVENUE_BRAIN") as InboxRouteTarget,
    complaintSeverity: Number(classificationDecision.complaintSeverity || 0),
    reasons,
  };
};

const persistRuntimeReferences = async ({
  interaction,
  references,
  receptionMemoryId,
  controlGateReasons,
}: {
  interaction: ReturnType<typeof toInboundInteractionRecord>;
  references?: ReceptionContextReferences | null;
  receptionMemoryId?: string | null;
  controlGateReasons?: string[];
}) => {
  const current = await prisma.inboundInteraction.findUnique({
    where: {
      id: interaction.id,
    },
    select: {
      metadata: true,
    },
  });
  const existingMetadata = toRecord(current?.metadata);
  const nextMetadata = mergeJsonRecords(existingMetadata, {
    crmProfile: references?.crmProfile
      ? {
          ...references.crmProfile,
        }
      : undefined,
    consent: references?.consent
      ? {
          ...references.consent,
          effectiveAt: references.consent.effectiveAt
            ? references.consent.effectiveAt.toISOString()
            : null,
        }
      : undefined,
    leadControl: references?.leadControl
      ? {
          ...references.leadControl,
          manualSuppressUntil: references.leadControl.manualSuppressUntil
            ? references.leadControl.manualSuppressUntil.toISOString()
            : null,
        }
      : undefined,
    latestTouch: references?.latestTouch
      ? {
          ...references.latestTouch,
          lastOutboundAt: references.latestTouch.lastOutboundAt
            ? references.latestTouch.lastOutboundAt.toISOString()
            : null,
        }
      : undefined,
    receptionMemory: receptionMemoryId
      ? {
          id: receptionMemoryId,
        }
      : undefined,
    controlGate: controlGateReasons?.length
      ? {
          reasons: controlGateReasons,
        }
      : undefined,
  });

  const updated = await updateInteractionMetadata({
    interactionId: interaction.id,
    metadata: nextMetadata,
  });

  return toInboundInteractionRecord(updated);
};

const markFailClosedInteraction = async ({
  interaction,
  reason,
}: {
  interaction: ReturnType<typeof toInboundInteractionRecord>;
  reason: string;
}) => {
  const updated = await markInboundInteractionFailed({
    interactionId: interaction.id,
    updates: {
      routeDecision: "OWNER",
      priorityScore: 100,
      priorityLevel: "CRITICAL",
      slaDeadline: new Date(Date.now() + 15 * 60_000),
    },
    metadata: {
      failClosed: {
        phase: "NORMALIZATION",
        reason,
        failedAt: new Date().toISOString(),
      },
    },
  });

  const assignment = await humanQueue.ensureAssignment({
    interaction: updated,
    classification: {
      intentClass: "GENERAL",
      urgencyClass: "CRITICAL",
      sentimentClass: "NEUTRAL",
      spamScore: 0,
      routeHint: "OWNER",
      complaintSeverity: 0,
      reasons: ["fail_closed", reason],
    },
    routing: {
      routeDecision: "OWNER",
      priorityScore: 100,
      priorityLevel: "CRITICAL",
      slaDeadline: updated.slaDeadline,
      requiresHumanQueue: true,
      reasons: ["fail_closed", reason],
    },
    metadata: {
      failClosed: true,
      reason,
    },
  });

  if (assignment?.queue.queueType) {
    await getQueueDepth(assignment.queue.queueType);
  }

  return updated;
};

const processInboundNormalization = async (
  job: Job<InboundNormalizationJobPayload>
) => {
  const interaction = await loadInteractionOrThrow(job.data.interactionId);

  if (interaction.lifecycleState === "ROUTED") {
    await enqueueInboundRouting({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
    return;
  }

  if (interaction.lifecycleState === "CLASSIFIED") {
    await enqueueInboundRouting({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
    return;
  }

  if (interaction.lifecycleState === "NORMALIZED") {
    await enqueueInboundClassification({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
    return;
  }

  if (
    ["IN_PROGRESS", "RESOLVED", "REOPENED", "CLOSED", "FAILED"].includes(
      interaction.lifecycleState
    )
  ) {
    return;
  }

  if (interaction.lifecycleState !== "RECEIVED") {
    throw new Error(
      `invalid_normalization_state:${interaction.id}:${interaction.lifecycleState}`
    );
  }

  try {
    const normalized = normalizer.normalizePayload(
      normalizeToken(
        interaction.channel,
        "WHATSAPP"
      ) as Parameters<typeof normalizer.normalizePayload>[0],
      interaction.payload
    );
    const normalizedPayload = normalized.envelope;
    const fingerprint = buildInboundInteractionFingerprint(normalizedPayload);
    const updated = await transitionInboundInteraction({
      interactionId: interaction.id,
      expectedCurrentStates: ["RECEIVED"],
      nextState: "NORMALIZED",
      updates: {
        interactionType: normalized.interactionType as CanonicalInteractionType,
        providerMessageId:
          normalizedPayload.providerMessageId || interaction.providerMessageId,
        normalizedPayload: normalizedPayload as unknown as Prisma.InputJsonValue,
        fingerprint,
      },
      metadata: {
        normalization: {
          normalizedAt: new Date().toISOString(),
          receivedAt: normalizedPayload.receivedAt,
        },
      },
    });

    await publishReceptionEvent({
      event: "inbound.normalized",
      businessId: updated.businessId,
      aggregateType: "inbound_interaction",
      aggregateId: updated.id,
      eventKey: updated.externalInteractionKey,
      payload: {
        interactionId: updated.id,
        businessId: updated.businessId,
        leadId: updated.leadId,
        channel: updated.channel,
        interactionType: updated.interactionType,
        normalizedPayload,
        traceId: updated.traceId,
        receivedAt: normalizedPayload.receivedAt,
      },
    });

    incrementReceptionMetric("normalized_total");
    await projectInboundInteractionToLegacyInbox(updated);

    await enqueueInboundClassification({
      interactionId: updated.id,
      traceId: updated.traceId,
      externalInteractionKey: updated.externalInteractionKey,
    });
  } catch (error) {
    await markFailClosedInteraction({
      interaction,
      reason: String(
        (error as { message?: unknown })?.message || "malformed_payload"
      ),
    });
    throw error;
  }
};

const processInboundClassification = async (
  job: Job<InboundClassificationJobPayload>
) => {
  const interaction = await loadInteractionOrThrow(job.data.interactionId);

  if (
    ["CLASSIFIED", "ROUTED"].includes(interaction.lifecycleState) &&
    interaction.intentClass
  ) {
    await enqueueInboundRouting({
      interactionId: interaction.id,
      traceId: interaction.traceId,
      externalInteractionKey: interaction.externalInteractionKey,
    });
    return;
  }

  if (
    ["IN_PROGRESS", "RESOLVED", "REOPENED", "CLOSED", "FAILED"].includes(
      interaction.lifecycleState
    )
  ) {
    return;
  }

  if (interaction.lifecycleState !== "NORMALIZED") {
    throw new Error(
      `invalid_classification_state:${interaction.id}:${interaction.lifecycleState}`
    );
  }

  const { references, receptionMemory: currentMemory } =
    await resolveReceptionContext({
      businessId: interaction.businessId,
      leadId: interaction.leadId,
      channel: interaction.channel,
    });
  const { interaction: classifiedInteraction, classification } =
    await classifier.applyClassification({
      interaction,
      references,
      receptionMemory: currentMemory,
    });
  const memory = await receptionMemory.recordInbound({
    interaction: classifiedInteraction,
    classification,
    references,
  });
  const interactionWithRefs = await persistRuntimeReferences({
    interaction: classifiedInteraction,
    references,
    receptionMemoryId: memory.id,
  });

  incrementReceptionMetric("classified_total");

  if (classification.spamScore >= 0.85) {
    incrementReceptionMetric("spam_detected_total");
  }

  await enqueueInboundRouting({
    interactionId: interactionWithRefs.id,
    traceId: interactionWithRefs.traceId,
    externalInteractionKey: interactionWithRefs.externalInteractionKey,
  });
};

const processInboundRouting = async (job: Job<InboundRoutingJobPayload>) => {
  const interaction = await loadInteractionOrThrow(job.data.interactionId);

  if (
    ["IN_PROGRESS", "RESOLVED", "REOPENED", "CLOSED", "FAILED"].includes(
      interaction.lifecycleState
    )
  ) {
    return;
  }

  if (!["CLASSIFIED", "ROUTED"].includes(interaction.lifecycleState)) {
    throw new Error(
      `invalid_routing_state:${interaction.id}:${interaction.lifecycleState}`
    );
  }

  const classification = buildClassificationSnapshot(interaction);
  const { references, receptionMemory: currentMemory } =
    await resolveReceptionContext({
      businessId: interaction.businessId,
      leadId: interaction.leadId,
      channel: interaction.channel,
    });

  const controlGate = resolveReceptionControlGate({
    references,
    receptionMemory: currentMemory,
  });
  const effectiveClassification = {
    ...classification,
    routeHint: controlGate.overrideRoute || classification.routeHint,
    reasons: [...classification.reasons, ...controlGate.reasons],
  };
  const priority = scoreInboundPriority({
    vipScore:
      references.crmProfile?.vipScore || currentMemory?.vipScore || 0,
    churnRisk: references.crmProfile?.churnRisk || null,
    customerValue: references.crmProfile?.valueScore || 0,
    urgencyClass: effectiveClassification.urgencyClass,
    unresolvedCount: currentMemory?.unresolvedCount || 0,
    complaintSeverity: effectiveClassification.complaintSeverity,
    conversionOpportunity: references.crmProfile?.compositeScore || 0,
    slaRisk: currentMemory?.escalationRisk || 0,
  });
  const routedTarget = controlGate.overrideRoute || effectiveClassification.routeHint;
  const sla = evaluateSlaPolicy(
    {
      priorityLevel: priority.level,
      routeDecision: routedTarget,
      isVip:
        (references.crmProfile?.vipScore || currentMemory?.vipScore || 0) >= 70,
      isComplaint: effectiveClassification.intentClass === "COMPLAINT",
      now: new Date(),
    },
    DEFAULT_SLA_POLICY_MATRIX
  );
  const { interaction: routedInteraction, routing } = await inboxRouter.applyRouting({
    interaction,
    classification: effectiveClassification,
    priority,
    sla,
    references,
    receptionMemory: currentMemory,
  });
  const interactionWithRefs = await persistRuntimeReferences({
    interaction: routedInteraction,
    references,
    receptionMemoryId: currentMemory?.id || null,
    controlGateReasons: controlGate.reasons,
  });

  incrementReceptionMetric("routed_total");

  if (routing.routeDecision === "REVENUE_BRAIN") {
    const executionGate = await resolveFreshReceptionExecutionGate({
      businessId: interactionWithRefs.businessId,
      leadId: interactionWithRefs.leadId,
      channel: interactionWithRefs.channel,
    });

    if (!executionGate.gate.allowed) {
      const blockedInteraction = await transitionInboundInteraction({
        interactionId: interactionWithRefs.id,
        expectedCurrentStates: ["ROUTED"],
        nextState: "ROUTED",
        allowSameState: true,
        updates: {
          routeDecision: executionGate.gate.blockRoute,
        },
        metadata: {
          revenueBridgeBlocked: {
            blockedAt: new Date().toISOString(),
            reasons: executionGate.gate.reasons,
            routeDecision: executionGate.gate.blockRoute,
          },
        },
      });

      if (executionGate.gate.blockRoute !== "SPAM_BIN") {
        const assignment = await humanQueue.ensureAssignment({
          interaction: blockedInteraction,
          classification: effectiveClassification,
          routing: {
            routeDecision: executionGate.gate.blockRoute,
            priorityScore: routing.priorityScore,
            priorityLevel: routing.priorityLevel,
            slaDeadline: routing.slaDeadline,
            requiresHumanQueue: true,
            reasons: [
              ...routing.reasons,
              ...executionGate.gate.reasons,
              "revenue_bridge_blocked",
            ],
          },
          metadata: {
            controlGateReasons: executionGate.gate.reasons,
          },
        });

        if (assignment?.queue.queueType) {
          await getQueueDepth(assignment.queue.queueType);
        }
      }

      return;
    }

    incrementReceptionMetric("revenue_routed_total");
    await enqueueRevenueBrainBridge({
      interactionId: interactionWithRefs.id,
      businessId: interactionWithRefs.businessId,
      leadId: interactionWithRefs.leadId,
      channel: interactionWithRefs.channel,
      priority: routing.priorityLevel,
      priorityScore: routing.priorityScore,
      consentSnapshotRef:
        String(toRecord(toRecord(interactionWithRefs.metadata).consent).recordId || "").trim() ||
        null,
      crmProfileRef:
        String(toRecord(toRecord(interactionWithRefs.metadata).crmProfile).profileId || "").trim() ||
        null,
      receptionMemoryRef:
        String(toRecord(toRecord(interactionWithRefs.metadata).receptionMemory).id || "").trim() ||
        null,
      traceId: interactionWithRefs.traceId,
      externalInteractionKey: interactionWithRefs.externalInteractionKey,
    });
    return;
  }

  if (routing.routeDecision === "SPAM_BIN") {
    incrementReceptionMetric("spam_detected_total");
    return;
  }

  incrementReceptionMetric("support_routed_total");
  const assignment = await humanQueue.ensureAssignment({
    interaction: interactionWithRefs,
    classification: effectiveClassification,
    routing,
    metadata: {
      controlGateReasons: controlGate.reasons,
    },
  });

  if (assignment?.queue.queueType) {
    await getQueueDepth(assignment.queue.queueType);
    return;
  }

  await getQueueDepth(getQueueTypeForRouteDecision(routing.routeDecision));
};

const processRevenueBrainBridge = async (
  job: Job<RevenueBrainBridgeJobPayload>
) => {
  const interaction = await loadInteractionOrThrow(job.data.interactionId);

  if (
    interaction.lifecycleState !== "ROUTED" ||
    interaction.routeDecision !== "REVENUE_BRAIN"
  ) {
    throw new Error(
      `invalid_revenue_bridge_state:${interaction.id}:${interaction.lifecycleState}:${interaction.routeDecision || "NONE"}`
    );
  }

  const normalizedPayload = toRecord(interaction.normalizedPayload);
  const message =
    String(normalizedPayload.message || "").trim() ||
    String(toRecord(normalizedPayload.metadata).subject || "").trim();

  if (!message) {
    throw new Error(`invalid_revenue_bridge_payload:${interaction.id}:message_missing`);
  }

  const executionGate = await resolveFreshReceptionExecutionGate({
    businessId: interaction.businessId,
    leadId: interaction.leadId,
    channel: interaction.channel,
  });

  if (!executionGate.gate.allowed) {
    const blockedInteraction = await transitionInboundInteraction({
      interactionId: interaction.id,
      expectedCurrentStates: ["ROUTED"],
      nextState: "ROUTED",
      allowSameState: true,
      updates: {
        routeDecision: executionGate.gate.blockRoute,
      },
      metadata: {
        revenueBridgeBlocked: {
          blockedAt: new Date().toISOString(),
          reasons: executionGate.gate.reasons,
          routeDecision: executionGate.gate.blockRoute,
        },
      },
    });

    if (executionGate.gate.blockRoute !== "SPAM_BIN") {
      const assignment = await humanQueue.ensureAssignment({
        interaction: blockedInteraction,
        classification: buildClassificationSnapshot(blockedInteraction),
        routing: {
          routeDecision: executionGate.gate.blockRoute,
          priorityScore: blockedInteraction.priorityScore,
          priorityLevel: blockedInteraction.priorityLevel || "MEDIUM",
          slaDeadline: blockedInteraction.slaDeadline,
          requiresHumanQueue: true,
          reasons: [...executionGate.gate.reasons, "revenue_bridge_blocked"],
        },
        metadata: {
          controlGateReasons: executionGate.gate.reasons,
        },
      });

      if (assignment?.queue.queueType) {
        await getQueueDepth(assignment.queue.queueType);
      }
    }

    return;
  }

  const [client, subscription] = await Promise.all([
    interaction.clientId
      ? prisma.client.findUnique({
          where: {
            id: interaction.clientId,
          },
          select: {
            accessToken: true,
            pageId: true,
            phoneNumberId: true,
          },
        })
      : null,
    prisma.subscription.findUnique({
      where: {
        businessId: interaction.businessId,
      },
      include: {
        plan: true,
      },
    }),
  ]);

  await enqueueAIBatch(
    [
      {
        businessId: interaction.businessId,
        leadId: interaction.leadId,
        message,
        kind: "router",
        plan: subscription?.plan || null,
        platform: interaction.channel,
        senderId: String(toRecord(normalizedPayload.sender).externalId || "").trim() || undefined,
        pageId: client?.pageId || undefined,
        phoneNumberId: client?.phoneNumberId || undefined,
        accessTokenEncrypted: client?.accessToken || undefined,
        externalEventId: interaction.externalInteractionKey,
        skipInboundPersist: true,
        metadata: {
          interactionId: interaction.id,
          externalInteractionKey: interaction.externalInteractionKey,
          canonicalInbound: true,
          priorityLevel: interaction.priorityLevel,
          priorityScore: interaction.priorityScore,
          routeDecision: interaction.routeDecision,
          traceId: interaction.traceId,
          consentSnapshotRef: job.data.consentSnapshotRef,
          crmProfileRef: job.data.crmProfileRef,
          receptionMemoryRef: job.data.receptionMemoryRef,
        },
      },
    ],
    {
      source: "router",
      idempotencyKey: interaction.externalInteractionKey,
    }
  );

  const current = await prisma.inboundInteraction.findUnique({
    where: {
      id: interaction.id,
    },
    select: {
      metadata: true,
    },
  });

  await updateInteractionMetadata({
    interactionId: interaction.id,
    metadata: mergeJsonRecords(toRecord(current?.metadata), {
      revenueBridge: {
        queuedAt: new Date().toISOString(),
        traceId: interaction.traceId,
        consentSnapshotRef: job.data.consentSnapshotRef,
        crmProfileRef: job.data.crmProfileRef,
        receptionMemoryRef: job.data.receptionMemoryRef,
      },
    }),
  });
};

const handleWorkerFailure = async ({
  queueName,
  job,
  error,
}: {
  queueName:
    | typeof INBOUND_NORMALIZATION_QUEUE
    | typeof INBOUND_CLASSIFICATION_QUEUE
    | typeof INBOUND_ROUTING_QUEUE
    | typeof REVENUE_BRAIN_BRIDGE_QUEUE;
  job: Job<any>;
  error: unknown;
}) => {
  const attemptsMade = Number(job.attemptsMade || 0);
  const maxAttempts = Number(job.opts.attempts || 1);

  if (attemptsMade < maxAttempts) {
    return;
  }

  await enqueueReceptionRuntimeDeadLetter({
    queueName,
    payload: {
      queue: queueName,
      interactionId: String(job.data?.interactionId || "").trim() || null,
      externalInteractionKey:
        String(job.data?.externalInteractionKey || "").trim() || null,
      traceId: String(job.data?.traceId || "").trim() || null,
      reason: String(
        (error as { message?: unknown })?.message || error || "runtime_failed"
      ),
      stack:
        typeof (error as { stack?: unknown })?.stack === "string"
          ? String((error as { stack?: string }).stack)
          : null,
      failedAt: new Date().toISOString(),
      attemptsMade,
      payload: toRecord(job.data),
    },
  }).catch(() => undefined);
};

const buildWorker = <TPayload>(
  queueName:
    | typeof INBOUND_NORMALIZATION_QUEUE
    | typeof INBOUND_CLASSIFICATION_QUEUE
    | typeof INBOUND_ROUTING_QUEUE
    | typeof REVENUE_BRAIN_BRIDGE_QUEUE,
  processor: (job: Job<TPayload>) => Promise<void>
) => {
  const worker = new Worker<TPayload>(
    queueName,
    withRedisWorkerFailSafe(queueName, processor),
    {
      connection: getWorkerRedisConnection(),
      prefix: env.AI_QUEUE_PREFIX,
      concurrency: 4,
    }
  );

  worker.on("failed", async (job, error) => {
    if (!job) {
      return;
    }

    const interactionId =
      String((job.data as { interactionId?: unknown })?.interactionId || "").trim() ||
      null;

    logger.error(
      {
        queueName,
        jobId: job.id,
        interactionId,
        error,
      },
      "Reception runtime worker failed"
    );
    captureExceptionWithContext(error, {
      tags: {
        worker: "reception.runtime",
        queueName,
      },
      extras: {
        jobId: job.id,
        interactionId,
      },
    });
    await handleWorkerFailure({
      queueName,
      job,
      error,
    });
  });

  worker.on("error", (error) => {
    logger.error(
      {
        queueName,
        error,
      },
      "Reception runtime worker error"
    );
  });

  return worker;
};

export const initReceptionRuntimeWorkers = () => {
  if (!shouldRunWorker) {
    return [];
  }

  if (globalForReceptionWorkers.__sylphReceptionRuntimeWorkers) {
    return globalForReceptionWorkers.__sylphReceptionRuntimeWorkers;
  }

  const workers = [
    buildWorker(INBOUND_NORMALIZATION_QUEUE, processInboundNormalization),
    buildWorker(INBOUND_CLASSIFICATION_QUEUE, processInboundClassification),
    buildWorker(INBOUND_ROUTING_QUEUE, processInboundRouting),
    buildWorker(REVENUE_BRAIN_BRIDGE_QUEUE, processRevenueBrainBridge),
  ];

  globalForReceptionWorkers.__sylphReceptionRuntimeWorkers = workers;
  return workers;
};

export const closeReceptionRuntimeWorkers = async () => {
  const workers = globalForReceptionWorkers.__sylphReceptionRuntimeWorkers || [];
  await Promise.allSettled(workers.map((worker) => worker.close()));
  globalForReceptionWorkers.__sylphReceptionRuntimeWorkers = undefined;
};

export const __receptionRuntimeWorkerTestInternals = {
  processInboundNormalization,
  processInboundClassification,
  processInboundRouting,
  processRevenueBrainBridge,
};
