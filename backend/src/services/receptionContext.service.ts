import prisma from "../config/prisma";
import { resolveConsentAuthority } from "./consentAuthority.service";
import {
  getLeadControlAuthority,
  isLeadHumanControlActive,
} from "./leadControlState.service";
import {
  createPrismaReceptionMemoryRepository,
} from "./receptionMemory.service";
import type {
  InboxRouteTarget,
  ReceptionContextReferences,
  ReceptionMemoryAuthorityRecord,
} from "./reception.shared";

export type ReceptionControlGateDecision = {
  overrideRoute: InboxRouteTarget | null;
  reasons: string[];
};

export type ReceptionExecutionGateDecision = {
  allowed: boolean;
  blockRoute: InboxRouteTarget;
  reasons: string[];
};

const receptionMemoryRepository = createPrismaReceptionMemoryRepository();

export const resolveReceptionContext = async ({
  businessId,
  leadId,
  channel,
  scope = "GENERAL",
  now = new Date(),
}: {
  businessId: string;
  leadId: string;
  channel: string;
  scope?: string;
  now?: Date;
}): Promise<{
  references: ReceptionContextReferences;
  receptionMemory: ReceptionMemoryAuthorityRecord | null;
}> => {
  const [crmProfile, consent, leadControl, latestTouch, receptionMemory] =
    await Promise.all([
      prisma.leadIntelligenceProfile.findUnique({
        where: {
          leadId,
        },
        select: {
          id: true,
          lifecycleStage: true,
          compositeScore: true,
          valueScore: true,
          churnRisk: true,
          valueTier: true,
        },
      }),
      resolveConsentAuthority({
        businessId,
        leadId,
        channel,
        scope,
        asOf: now,
      }),
      getLeadControlAuthority({
        businessId,
        leadId,
      }),
      prisma.revenueTouchLedger.findFirst({
        where: {
          businessId,
          leadId,
        },
        orderBy: [
          {
            deliveredAt: "desc",
          },
          {
            confirmedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        select: {
          id: true,
          channel: true,
          deliveryState: true,
          confirmedAt: true,
          deliveredAt: true,
          providerAcceptedAt: true,
        },
      }),
      receptionMemoryRepository.getByLeadId(leadId),
    ]);

  return {
    references: {
      crmProfile: crmProfile
        ? {
            profileId: crmProfile.id,
            lifecycleStage: crmProfile.lifecycleStage,
            compositeScore: crmProfile.compositeScore,
            valueScore: crmProfile.valueScore,
            churnRisk: crmProfile.churnRisk,
            valueTier: crmProfile.valueTier,
            vipScore: crmProfile.valueScore,
          }
        : null,
      consent: consent
        ? {
            status: consent.status,
            channel: consent.channel,
            scope: consent.scope,
            recordId: consent.recordId,
            effectiveAt: consent.effectiveAt,
          }
        : null,
      leadControl: leadControl
        ? {
            cancelTokenVersion: leadControl.cancelTokenVersion,
            isHumanControlActive: isLeadHumanControlActive(leadControl, now),
            manualSuppressUntil: leadControl.manualSuppressUntil,
          }
        : null,
      latestTouch: latestTouch
        ? {
            touchLedgerId: latestTouch.id,
            channel: latestTouch.channel,
            deliveryState: latestTouch.deliveryState,
            lastOutboundAt:
              latestTouch.deliveredAt ||
              latestTouch.confirmedAt ||
              latestTouch.providerAcceptedAt ||
              null,
          }
        : null,
    },
    receptionMemory,
  };
};

export const resolveReceptionControlGate = ({
  references,
  receptionMemory,
  now = new Date(),
}: {
  references: ReceptionContextReferences;
  receptionMemory?: ReceptionMemoryAuthorityRecord | null;
  now?: Date;
}): ReceptionControlGateDecision => {
  const reasons: string[] = [];

  if (!references.consent || references.consent.status === "UNKNOWN") {
    reasons.push("consent_unknown");
    return {
      overrideRoute: "HUMAN_QUEUE",
      reasons,
    };
  }

  if (references.consent.status === "REVOKED") {
    reasons.push("consent_revoked");
    return {
      overrideRoute: "HUMAN_QUEUE",
      reasons,
    };
  }

  if (references.leadControl?.isHumanControlActive) {
    reasons.push("human_takeover_active");
    return {
      overrideRoute: "HUMAN_QUEUE",
      reasons,
    };
  }

  if (
    references.leadControl?.manualSuppressUntil &&
    references.leadControl.manualSuppressUntil.getTime() > now.getTime()
  ) {
    reasons.push("manual_suppression_active");
    return {
      overrideRoute: "OWNER",
      reasons,
    };
  }

  if ((receptionMemory?.abuseRisk || 0) >= 95) {
    reasons.push("abuse_risk_extreme");
    return {
      overrideRoute: "SPAM_BIN",
      reasons,
    };
  }

  return {
    overrideRoute: null,
    reasons,
  };
};

export const resolveReceptionExecutionGate = ({
  references,
  receptionMemory,
  now = new Date(),
}: {
  references: ReceptionContextReferences;
  receptionMemory?: ReceptionMemoryAuthorityRecord | null;
  now?: Date;
}): ReceptionExecutionGateDecision => {
  const control = resolveReceptionControlGate({
    references,
    receptionMemory,
    now,
  });

  return {
    allowed: control.overrideRoute === null,
    blockRoute: control.overrideRoute || "HUMAN_QUEUE",
    reasons: control.reasons,
  };
};

export const resolveFreshReceptionExecutionGate = async ({
  businessId,
  leadId,
  channel,
  scope = "CONVERSATIONAL_OUTBOUND",
  now = new Date(),
}: {
  businessId: string;
  leadId: string;
  channel: string;
  scope?: string;
  now?: Date;
}) => {
  const { references, receptionMemory } = await resolveReceptionContext({
    businessId,
    leadId,
    channel,
    scope,
    now,
  });

  return {
    references,
    receptionMemory,
    gate: resolveReceptionExecutionGate({
      references,
      receptionMemory,
      now,
    }),
  };
};
