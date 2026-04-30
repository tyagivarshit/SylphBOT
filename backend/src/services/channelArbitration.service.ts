import prisma from "../config/prisma";
import { resolveConsentAuthority } from "./consentAuthority.service";
import { getIntelligenceRuntimeInfluence } from "./intelligence/intelligenceRuntimeInfluence.service";

export type ChannelArbitrationCandidate = {
  channel: string;
  allowed: boolean;
  score: number;
  blockedReasons: string[];
};

export type ChannelArbitrationDecision = {
  allowed: boolean;
  channel: string | null;
  blockedReasons: string[];
  candidates: ChannelArbitrationCandidate[];
};

const normalizeChannel = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase();

const baseScoreForHealthState = (state?: string | null) => {
  const normalized = normalizeChannel(state);
  if (normalized === "HEALTHY") return 0.3;
  if (normalized === "DEGRADED") return 0.1;
  if (normalized === "QUARANTINED") return -1;
  return 0;
};

export const arbitrateOutboundChannel = async ({
  businessId,
  leadId,
  preferredChannel,
  scope = "CONVERSATIONAL_OUTBOUND",
}: {
  businessId: string;
  leadId: string;
  preferredChannel?: string | null;
  scope?: string;
}): Promise<ChannelArbitrationDecision> => {
  const lead = await prisma.lead.findUnique({
    where: {
      id: leadId,
    },
    include: {
      client: {
        select: {
          platform: true,
          phoneNumberId: true,
          pageId: true,
          accessToken: true,
        },
      },
      channelHealthEntries: true,
    },
  });

  if (!lead || lead.businessId !== businessId) {
    return {
      allowed: false,
      channel: null,
      blockedReasons: ["lead_not_found"],
      candidates: [],
    };
  }
  const runtime = await getIntelligenceRuntimeInfluence({
    businessId,
    leadId,
  }).catch(() => null);

  if (
    scope === "AUTONOMOUS_OUTREACH" &&
    Boolean(runtime?.controls.autonomous.paused)
  ) {
    return {
      allowed: false,
      channel: null,
      blockedReasons: ["intelligence_autonomous_paused"],
      candidates: [],
    };
  }

  const preferred = normalizeChannel(preferredChannel);
  const candidateChannels = Array.from(
    new Set(
      [preferred, normalizeChannel(lead.platform), normalizeChannel(lead.client?.platform)]
        .filter(Boolean)
    )
  );

  const candidates = await Promise.all(
    candidateChannels.map(async (channel) => {
      const blockedReasons: string[] = [];
      const health =
        lead.channelHealthEntries.find(
          (entry) => normalizeChannel(entry.channel) === channel
        ) || null;
      const consent = await resolveConsentAuthority({
        businessId,
        leadId,
        channel,
        scope,
      });

      if (consent.status === "REVOKED") {
        blockedReasons.push("consent_revoked");
      }

      if (
        health?.quarantinedUntil instanceof Date &&
        health.quarantinedUntil.getTime() > Date.now()
      ) {
        blockedReasons.push("channel_quarantined");
      }

      if (normalizeChannel(health?.state) === "QUARANTINED") {
        blockedReasons.push("channel_quarantined");
      }

      if (channel === "WHATSAPP") {
        if (!lead.phone || !lead.client?.phoneNumberId) {
          blockedReasons.push("missing_whatsapp_delivery_context");
        }
      } else if (channel === "INSTAGRAM") {
        if (!lead.instagramId || !lead.client?.pageId) {
          blockedReasons.push("missing_instagram_delivery_context");
        }
      } else {
        blockedReasons.push("unsupported_channel");
      }

      if (!lead.client?.accessToken) {
        blockedReasons.push("missing_access_token");
      }

      let score =
        baseScoreForHealthState(health?.state) +
        Number(health?.deliverability || 0) +
        Number(health?.confidence || 0) +
        Number(health?.responseRate || 0) * 0.3 +
        Number(health?.conversionRate || 0) * 0.4 -
        Number(health?.fatigueRisk || 0) * 0.4;
      const channelBias = Number(
        runtime?.controls.autonomous.channelBias[channel] || 1
      );
      score *= channelBias;

      if (preferred && channel === preferred) {
        score += 0.25;
      }

      if (!health) {
        score += 0.15;
      }

      return {
        channel,
        allowed: blockedReasons.length === 0,
        score,
        blockedReasons,
      };
    })
  );

  const allowed = candidates
    .filter((candidate) => candidate.allowed)
    .sort((left, right) => right.score - left.score);
  const best = allowed[0] || null;

  return {
    allowed: Boolean(best),
    channel: best?.channel || null,
    blockedReasons: best ? [] : Array.from(new Set(candidates.flatMap((candidate) => candidate.blockedReasons))),
    candidates,
  };
};
