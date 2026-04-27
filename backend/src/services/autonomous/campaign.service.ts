import crypto from "crypto";
import { format } from "date-fns";
import prisma from "../../config/prisma";
import { AI_QUEUE_NAME, enqueueAIBatch } from "../../queues/ai.queue";
import logger from "../../utils/logger";
import { arbitrateOutboundChannel } from "../channelArbitration.service";
import { getLeadControlAuthority } from "../leadControlState.service";
import {
  registerRevenueBrainSubscriber,
  subscribeRevenueBrainEvent,
} from "../revenueBrain/eventBus.service";
import {
  consumeAutonomousCapReservation,
  releaseAutonomousCapReservation,
  reserveAutonomousCap,
} from "./capReservation.service";
import type {
  AutonomousGuardrailDecision,
  AutonomousLeadSnapshot,
  AutonomousOpportunityCandidate,
} from "./types";
import { recordAutonomousEvent } from "./observability.service";

const AUTONOMOUS_TOUCH_CAP = 3;
const AUTONOMOUS_TOUCH_WINDOW_DAYS = 14;

const toJsonSafe = (value: unknown) => {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const toRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const buildCampaignIdempotencyKey = ({
  leadId,
  engine,
  recommendedAt,
}: {
  leadId: string;
  engine: string;
  recommendedAt: Date;
}) => `autonomous:${leadId}:${engine}:${format(recommendedAt, "yyyyMMdd")}`;

const buildAutonomousTraceId = (jobId: string | number) =>
  `${AI_QUEUE_NAME}:${String(jobId)}:0`;

const buildOpportunityFingerprint = ({
  snapshot,
  candidate,
}: {
  snapshot: AutonomousLeadSnapshot;
  candidate: AutonomousOpportunityCandidate;
}) => ({
  engine: candidate.engine,
  title: candidate.title,
  objective: candidate.objective,
  summary: candidate.summary,
  reason: candidate.reason,
  prompt: candidate.prompt || null,
  priority: candidate.priority,
  tags: [...candidate.tags].sort(),
  lead: {
    platform: snapshot.lead.platform || null,
    stage: snapshot.lead.stage || null,
    aiStage: snapshot.lead.aiStage || null,
    revenueState: snapshot.lead.revenueState || null,
  },
  profile: {
    lifecycleStage: snapshot.profile.lifecycle.stage || null,
    predictedBehavior: snapshot.profile.behavior.predictedBehavior || null,
    churnRisk: snapshot.profile.value.churnRisk || null,
    compositeScore: snapshot.profile.scorecard.compositeScore || null,
  },
  metadata: candidate.metadata || {},
});

const buildOpportunityFingerprintKey = (fingerprint: Record<string, unknown>) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(fingerprint))
    .digest("hex");

const buildOpportunityKey = ({
  leadId,
  engine,
  fingerprintKey,
}: {
  leadId: string;
  engine: string;
  fingerprintKey: string;
}) => `autonomous:${leadId}:${engine}:${fingerprintKey}`;

const buildReservationKey = ({
  idempotencyKey,
  ruleKey,
}: {
  idempotencyKey: string;
  ruleKey: string;
}) => `autonomous:${idempotencyKey}:${ruleKey}`;

const buildAutonomousMetadata = ({
  candidate,
  guardrail,
  campaignId,
  channel,
  reservationKey,
  arbitration,
}: {
  candidate: AutonomousOpportunityCandidate;
  guardrail: AutonomousGuardrailDecision;
  campaignId: string;
  channel: string;
  reservationKey: string;
  arbitration: Record<string, unknown>;
}) => ({
  autonomous: {
    campaignId,
    engine: candidate.engine,
    title: candidate.title,
    objective: candidate.objective,
    reason: candidate.reason,
    score: candidate.score,
    priority: candidate.priority,
    tags: candidate.tags,
    channel,
    reservationKey,
    arbitration,
    guardrail,
    metadata: candidate.metadata || {},
  },
  reservationKey,
});

const extractReservationKey = (metadata: unknown) =>
  String(toRecord(metadata).reservationKey || "").trim() || null;

export const clearAutonomousOpportunity = async ({
  businessId,
  leadId,
}: {
  businessId: string;
  leadId: string;
}) => {
  await prisma.autonomousOpportunity.updateMany({
    where: {
      businessId,
      leadId,
      supersededBy: null,
      status: {
        in: ["PENDING", "BLOCKED", "QUEUED"],
      },
    },
    data: {
      status: "EXPIRED",
      closedAt: new Date(),
    },
  });
};

export const persistAutonomousOpportunity = async ({
  snapshot,
  candidate,
  guardrail,
}: {
  snapshot: AutonomousLeadSnapshot;
  candidate: AutonomousOpportunityCandidate;
  guardrail: AutonomousGuardrailDecision;
}) => {
  const recommendedAt = snapshot.now;
  const status = guardrail.allowed ? "PENDING" : "BLOCKED";
  const fingerprint = buildOpportunityFingerprint({
    snapshot,
    candidate,
  });
  const fingerprintKey = buildOpportunityFingerprintKey(fingerprint);
  const opportunityKey = buildOpportunityKey({
    leadId: snapshot.leadId,
    engine: candidate.engine,
    fingerprintKey,
  });
  const currentActive = await prisma.autonomousOpportunity.findFirst({
    where: {
      businessId: snapshot.businessId,
      leadId: snapshot.leadId,
      engine: candidate.engine,
      supersededBy: null,
    },
    orderBy: {
      recommendedAt: "desc",
    },
    select: {
      id: true,
    },
  });
  const context = toJsonSafe({
    business: snapshot.business,
    lead: snapshot.lead,
    profile: {
      lifecycle: snapshot.profile.lifecycle,
      behavior: snapshot.profile.behavior,
      value: snapshot.profile.value,
      relationships: snapshot.profile.relationships,
      scorecard: snapshot.profile.scorecard,
    },
  }) as any;
  const metrics = toJsonSafe(candidate.metadata || {}) as any;
  const existing = await prisma.autonomousOpportunity.findUnique({
    where: {
      opportunityKey,
    },
    select: {
      id: true,
    },
  });

  const opportunity = existing
    ? await prisma.autonomousOpportunity.update({
        where: {
          opportunityKey,
        },
        data: {
          status,
          score: candidate.score,
          priority: candidate.priority,
          title: candidate.title,
          objective: candidate.objective,
          summary: candidate.summary,
          reason: candidate.reason,
          prompt: candidate.prompt,
          blockedReasons: guardrail.blockedReasons,
          guardrail: toJsonSafe(guardrail) as any,
          fingerprintVersion: "opp_fp_v1",
          fingerprintKey,
          fingerprint: toJsonSafe(fingerprint) as any,
          context,
          metrics,
          recommendedAt,
          nextEligibleAt: guardrail.nextEligibleAt
            ? new Date(guardrail.nextEligibleAt)
            : null,
          lastEvaluatedAt: snapshot.now,
        },
      })
    : await prisma.autonomousOpportunity.create({
        data: {
          businessId: snapshot.businessId,
          leadId: snapshot.leadId,
          opportunityKey,
          fingerprintVersion: "opp_fp_v1",
          fingerprintKey,
          fingerprint: toJsonSafe(fingerprint) as any,
          engine: candidate.engine,
          status,
          score: candidate.score,
          priority: candidate.priority,
          title: candidate.title,
          objective: candidate.objective,
          summary: candidate.summary,
          reason: candidate.reason,
          prompt: candidate.prompt,
          blockedReasons: guardrail.blockedReasons,
          guardrail: toJsonSafe(guardrail) as any,
          context,
          metrics,
          recommendedAt,
          nextEligibleAt: guardrail.nextEligibleAt
            ? new Date(guardrail.nextEligibleAt)
            : null,
          lastEvaluatedAt: snapshot.now,
        },
      });

  if (currentActive && currentActive.id !== opportunity.id) {
    await prisma.autonomousOpportunity.updateMany({
      where: {
        id: currentActive.id,
        supersededBy: null,
      },
      data: {
        supersededBy: opportunity.id,
        supersededAt: snapshot.now,
        status: "SUPERSEDED",
        closedAt: snapshot.now,
      },
    });
  }

  await recordAutonomousEvent({
    businessId: snapshot.businessId,
    type: guardrail.allowed
      ? "AUTONOMOUS_OPPORTUNITY_READY"
      : "AUTONOMOUS_OPPORTUNITY_BLOCKED",
    meta: {
      leadId: snapshot.leadId,
      engine: candidate.engine,
      score: candidate.score,
      fingerprintKey,
      blockedReasons: guardrail.blockedReasons,
    },
  }).catch(() => undefined);

  return opportunity;
};

export const queueAutonomousCampaign = async ({
  snapshot,
  candidate,
  guardrail,
  opportunityId,
}: {
  snapshot: AutonomousLeadSnapshot;
  candidate: AutonomousOpportunityCandidate;
  guardrail: AutonomousGuardrailDecision;
  opportunityId: string;
}) => {
  if (!guardrail.allowed) {
    return null;
  }

  const arbitration = await arbitrateOutboundChannel({
    businessId: snapshot.businessId,
    leadId: snapshot.leadId,
    preferredChannel: snapshot.lead.platform || null,
    scope: "AUTONOMOUS_OUTREACH",
  });

  if (!arbitration.allowed || !arbitration.channel) {
    await prisma.autonomousOpportunity.update({
      where: {
        id: opportunityId,
      },
      data: {
        status: "BLOCKED",
        blockedReasons: Array.from(
          new Set(["no_allowed_channel", ...arbitration.blockedReasons])
        ),
      },
    });

    return null;
  }

  const idempotencyKey = buildCampaignIdempotencyKey({
    leadId: snapshot.leadId,
    engine: candidate.engine,
    recommendedAt: snapshot.now,
  });
  const existing = await prisma.autonomousCampaign.findUnique({
    where: {
      idempotencyKey,
    },
  });

  if (existing) {
    return existing;
  }

  const reservationKey = buildReservationKey({
    idempotencyKey,
    ruleKey: "autonomous_touch_14d",
  });
  const reservation = await reserveAutonomousCap({
    businessId: snapshot.businessId,
    leadId: snapshot.leadId,
    channel: arbitration.channel,
    ruleKey: "autonomous_touch_14d",
    maxReservations: AUTONOMOUS_TOUCH_CAP,
    windowDays: AUTONOMOUS_TOUCH_WINDOW_DAYS,
    reservationKey,
    reason: "autonomous_campaign_queue",
    opportunityId,
    metadata: {
      engine: candidate.engine,
      arbitration,
      idempotencyKey,
    },
    now: snapshot.now,
  });

  if (!reservation.granted) {
    await prisma.autonomousOpportunity.update({
      where: {
        id: opportunityId,
      },
      data: {
        status: "BLOCKED",
        blockedReasons: ["autonomous_touch_cap_reached"],
      },
    });

    return null;
  }

  const controlState = await getLeadControlAuthority({
    leadId: snapshot.leadId,
    businessId: snapshot.businessId,
  });
  const campaign = await prisma.autonomousCampaign.create({
    data: {
      businessId: snapshot.businessId,
      leadId: snapshot.leadId,
      opportunityId,
      engine: candidate.engine,
      status: "QUEUED",
      title: candidate.title,
      objective: candidate.objective,
      prompt: candidate.prompt,
      outreachMode: "DIRECT_MESSAGE",
      idempotencyKey,
      channel: arbitration.channel,
      cancelTokenVersion: controlState?.cancelTokenVersion ?? 0,
      guardrail: toJsonSafe(guardrail) as any,
      analytics: toJsonSafe({
        score: candidate.score,
        priority: candidate.priority,
      }) as any,
      metadata: toJsonSafe({
        ...(candidate.metadata || {}),
        reservationKey,
        arbitration,
      }) as any,
      queuedAt: snapshot.now,
    },
  });

  try {
    const jobs = await enqueueAIBatch(
      [
        {
          businessId: snapshot.businessId,
          leadId: snapshot.leadId,
          message: candidate.prompt,
          kind: "router",
          source: "AUTONOMOUS",
          platform: arbitration.channel,
          senderId:
            arbitration.channel === "WHATSAPP"
              ? snapshot.lead.phone || undefined
              : snapshot.lead.instagramId || undefined,
          pageId: snapshot.client?.pageId || undefined,
          phoneNumberId: snapshot.client?.phoneNumberId || undefined,
          accessTokenEncrypted: snapshot.client?.accessTokenEncrypted || undefined,
          externalEventId: campaign.id,
          idempotencyKey,
          skipInboundPersist: true,
          metadata: buildAutonomousMetadata({
            candidate,
            guardrail,
            campaignId: campaign.id,
            channel: arbitration.channel,
            reservationKey,
            arbitration: toRecord(arbitration),
          }),
        },
      ],
      {
        source: "api",
        idempotencyKey,
      }
    );

    const aiJobId = String(jobs[0]?.id || "");
    const traceId = aiJobId ? buildAutonomousTraceId(aiJobId) : null;
    const updatedCampaign = await prisma.autonomousCampaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        aiJobId: aiJobId || null,
        traceId,
        queuedAt: snapshot.now,
      },
    });

    await prisma.autonomousOpportunity.update({
      where: {
        id: opportunityId,
      },
      data: {
        status: "QUEUED",
      },
    });

    await recordAutonomousEvent({
      businessId: snapshot.businessId,
      type: "AUTONOMOUS_CAMPAIGN_QUEUED",
      meta: {
        leadId: snapshot.leadId,
        campaignId: updatedCampaign.id,
        engine: candidate.engine,
        traceId,
        aiJobId,
        channel: arbitration.channel,
        reservationKey,
        score: candidate.score,
      },
    }).catch(() => undefined);

    logger.info(
      {
        businessId: snapshot.businessId,
        leadId: snapshot.leadId,
        campaignId: updatedCampaign.id,
        engine: candidate.engine,
        channel: arbitration.channel,
        reservationKey,
        aiJobId,
        traceId,
      },
      "Autonomous campaign queued"
    );

    return updatedCampaign;
  } catch (error) {
    await releaseAutonomousCapReservation({
      reservationKey,
    }).catch(() => undefined);
    await prisma.autonomousCampaign.update({
      where: {
        id: campaign.id,
      },
      data: {
        status: "FAILED",
        failedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
};

export const registerAutonomousCampaignTrackers = () => {
  registerRevenueBrainSubscriber("autonomous.campaign_tracking", () => {
    subscribeRevenueBrainEvent(
      "revenue_brain.delivery_confirmed",
      async (event) => {
        const campaign = await prisma.autonomousCampaign.findFirst({
          where: {
            traceId: event.traceId,
          },
        });

        if (!campaign) {
          return;
        }

        await prisma.autonomousCampaign.update({
          where: {
            id: campaign.id,
          },
          data: {
            status: "DISPATCHED",
            dispatchedAt: new Date(event.delivery.confirmedAt),
          },
        });

        if (campaign.opportunityId) {
          await prisma.autonomousOpportunity.update({
            where: {
              id: campaign.opportunityId,
            },
            data: {
              status: "DISPATCHED",
              dispatchedAt: new Date(event.delivery.confirmedAt),
            },
          });
        }

        const reservationKey = extractReservationKey(campaign.metadata);

        if (reservationKey) {
          await consumeAutonomousCapReservation({
            reservationKey,
          }).catch(() => undefined);
        }

        await recordAutonomousEvent({
          businessId: event.businessId,
          type: "AUTONOMOUS_CAMPAIGN_DISPATCHED",
          meta: {
            leadId: event.leadId,
            campaignId: campaign.id,
            traceId: event.traceId,
            messageId: event.messageId,
            engine: campaign.engine,
            reservationKey,
          },
        }).catch(() => undefined);
      },
      {
        handlerId: "autonomous.delivery_confirmed",
      }
    );

    subscribeRevenueBrainEvent(
      "revenue_brain.delivery_failed",
      async (event) => {
        if (!event.failure.terminal) {
          return;
        }

        const campaign = await prisma.autonomousCampaign.findFirst({
          where: {
            traceId: event.traceId,
          },
        });

        if (!campaign) {
          return;
        }

        await prisma.autonomousCampaign.update({
          where: {
            id: campaign.id,
          },
          data: {
            status: "FAILED",
            failedAt: new Date(),
          },
        });

        if (campaign.opportunityId) {
          await prisma.autonomousOpportunity.update({
            where: {
              id: campaign.opportunityId,
            },
            data: {
              status: "FAILED",
              closedAt: new Date(),
            },
          });
        }

        const reservationKey = extractReservationKey(campaign.metadata);

        if (reservationKey) {
          await releaseAutonomousCapReservation({
            reservationKey,
          }).catch(() => undefined);
        }

        await recordAutonomousEvent({
          businessId: event.businessId,
          type: "AUTONOMOUS_CAMPAIGN_FAILED",
          meta: {
            leadId: event.leadId,
            campaignId: campaign.id,
            traceId: event.traceId,
            engine: campaign.engine,
            reservationKey,
            reason: event.failure.reason,
            stage: event.failure.stage,
          },
        }).catch(() => undefined);
      },
      {
        handlerId: "autonomous.delivery_failed",
      }
    );
  });
};
