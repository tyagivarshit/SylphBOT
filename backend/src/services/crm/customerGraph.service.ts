import type {
  CRMCustomerGraph,
  CRMEnrichmentProfile,
  CRMLeadSignalSnapshot,
  CRMRelationshipEdge,
} from "./leadIntelligence.service";

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeText = (value?: unknown) => String(value || "").trim();

const latestDate = (...values: Array<Date | null | undefined>) =>
  values
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

const extractBudget = (text: string) =>
  text.match(/(?:rs\.?|inr|\$|usd)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|lakh|lakhs)?/i)?.[0] ||
  null;

const extractTimeline = (text: string) =>
  text.match(
    /\b(today|tomorrow|this week|next week|this month|next month|asap|urgent|immediately|48 hours?)\b/i
  )?.[0] || null;

const extractNeed = (text: string) => {
  const patterns = [
    /need\s+(.+?)(?:\.|,|$)/i,
    /looking for\s+(.+?)(?:\.|,|$)/i,
    /want\s+(.+?)(?:\.|,|$)/i,
    /help with\s+(.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
};

const extractName = (text: string) =>
  text.match(/\b(?:my name is|i am|i'm|this is)\s+([a-z][a-z\s'-]{1,40})\b/i)?.[1]?.trim() ||
  null;

const extractEmail = (text: string) =>
  text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;

const getFactValue = (snapshot: CRMLeadSignalSnapshot, keys: string[]) => {
  const fact = snapshot.memory.facts.find((item) =>
    keys.includes(normalizeText(item.key).toLowerCase())
  );

  return normalizeText(fact?.value) || null;
};

const buildEnrichment = (snapshot: CRMLeadSignalSnapshot): CRMEnrichmentProfile => {
  const sourceText = [snapshot.inputMessage, snapshot.memory.summary]
    .filter(Boolean)
    .join(" ");
  const resolvedName =
    snapshot.lead.name ||
    getFactValue(snapshot, ["name"]) ||
    extractName(sourceText) ||
    null;
  const resolvedEmail =
    snapshot.lead.email ||
    getFactValue(snapshot, ["email"]) ||
    extractEmail(sourceText) ||
    null;
  const resolvedPhone =
    snapshot.lead.phone || getFactValue(snapshot, ["phone", "mobile"]) || null;
  const resolvedBudget =
    getFactValue(snapshot, ["budget"]) || extractBudget(sourceText) || null;
  const resolvedTimeline =
    getFactValue(snapshot, ["timeline"]) || extractTimeline(sourceText) || null;
  const resolvedNeed =
    getFactValue(snapshot, ["need", "service"]) || extractNeed(sourceText) || null;
  const memoryHighlights = snapshot.memory.facts
    .filter((fact) => !fact.stale && normalizeText(fact.value))
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4)
    .map((fact) => `${fact.key}:${fact.value}`);
  const lastTouchAt = latestDate(
    snapshot.lead.lastMessageAt,
    snapshot.lead.lastEngagedAt,
    snapshot.lead.lastFollowupAt,
    snapshot.lead.lastBookedAt,
    snapshot.lead.lastConvertedAt,
    snapshot.messageStats.latestUserMessageAt,
    snapshot.analytics.lastTrackedReplyAt
  );
  const completeness = clampScore(
    (resolvedName ? 15 : 0) +
      (resolvedEmail || resolvedPhone || snapshot.lead.instagramId ? 22 : 0) +
      (resolvedNeed ? 22 : 0) +
      (resolvedBudget ? 18 : 0) +
      (resolvedTimeline ? 13 : 0) +
      (snapshot.messageStats.total > 0 ? 10 : 0)
  );
  const identityConfidence = clampScore(
    (snapshot.lead.phone ? 28 : 0) +
      (snapshot.lead.email ? 24 : 0) +
      (snapshot.lead.instagramId ? 18 : 0) +
      (resolvedName ? 14 : 0) +
      (snapshot.relatedLeads.length === 0 ? 8 : 0)
  );

  return {
    resolvedName,
    resolvedEmail,
    resolvedPhone,
    resolvedBudget,
    resolvedTimeline,
    resolvedNeed,
    profileCompleteness: completeness,
    identityConfidence,
    memoryHighlights,
    lastTouchAt,
    firstSeenAt: snapshot.lead.createdAt || null,
  };
};

const buildBaseEdges = ({
  snapshot,
  enrichment,
}: {
  snapshot: CRMLeadSignalSnapshot;
  enrichment: CRMEnrichmentProfile;
}) => {
  const edges: CRMRelationshipEdge[] = [
    {
      targetType: "BUSINESS",
      targetId: snapshot.businessId,
      targetLabel: snapshot.business.name || "Business",
      relationshipType: "ACCOUNT_OWNER",
      strength: 100,
      score: 100,
      reason: "lead_belongs_to_business",
      lastObservedAt: enrichment.lastTouchAt || snapshot.now,
    },
  ];

  if (snapshot.business.website || snapshot.business.industry) {
    edges.push({
      targetType: "COMPANY",
      targetId: `${snapshot.businessId}:profile`,
      targetLabel: snapshot.business.name || snapshot.business.website || "Company profile",
      relationshipType: "COMPANY_CONTEXT",
      strength: 86,
      score: 86,
      reason: "business_context_available",
      metadata: {
        website: snapshot.business.website,
        industry: snapshot.business.industry,
      },
      lastObservedAt: enrichment.lastTouchAt || snapshot.now,
    });
  }

  if (snapshot.client.id) {
    edges.push({
      targetType: "CLIENT",
      targetId: snapshot.client.id,
      targetLabel: snapshot.client.platform || "Client channel",
      relationshipType: "CHANNEL_LINK",
      strength: 88,
      score: 88,
      reason: "lead_connected_to_client_channel",
      lastObservedAt: enrichment.lastTouchAt || snapshot.now,
    });
  }

  for (const appointment of snapshot.appointments.slice(0, 2)) {
    const isUpcoming =
      appointment.startTime >= snapshot.now &&
      appointment.status !== "CANCELLED" &&
      appointment.status !== "COMPLETED";

    edges.push({
      targetType: "APPOINTMENT",
      targetId: appointment.id,
      targetLabel: appointment.status,
      relationshipType: isUpcoming ? "BOOKING_PIPELINE" : "BOOKING_HISTORY",
      strength: isUpcoming ? 92 : 72,
      score: isUpcoming ? 92 : 72,
      reason: isUpcoming ? "upcoming_appointment_link" : "historical_appointment_link",
      lastObservedAt: appointment.startTime,
    });
  }

  if (snapshot.followups.schedule[0]) {
    const nextStep = snapshot.followups.schedule[0];
    edges.push({
      targetType: "FOLLOWUP",
      targetId: `${nextStep.trigger}:${nextStep.step}`,
      targetLabel: nextStep.step,
      relationshipType: "FOLLOWUP_PROGRAM",
      strength: 64,
      score: 64,
      reason: "active_followup_path",
      metadata: {
        trigger: nextStep.trigger,
        scheduledAt: nextStep.scheduledAt.toISOString(),
      },
      lastObservedAt: nextStep.scheduledAt,
    });
  }

  for (const fact of snapshot.memory.facts
    .filter((item) => !item.stale)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4)) {
    edges.push({
      targetType: "MEMORY",
      targetId: normalizeText(fact.key).toLowerCase(),
      targetLabel: `${fact.key}:${fact.value}`,
      relationshipType: "PROFILE_SIGNAL",
      strength: clampScore(fact.confidence * 100),
      score: clampScore(fact.confidence * 100),
      reason: "durable_memory_signal",
      metadata: {
        confidence: fact.confidence,
        stale: fact.stale,
      },
      lastObservedAt: fact.lastObservedAt || fact.updatedAt || fact.createdAt || snapshot.now,
    });
  }

  const trustRequested =
    String(snapshot.salesSignals.objection || "").trim().toUpperCase() === "TRUST" ||
    /proof|review|testimonial|case study|legit|trust/i.test(snapshot.inputMessage);

  if (trustRequested) {
    edges.push({
      targetType: "TRUST",
      targetId: "proof_request",
      targetLabel: "Trust proof requested",
      relationshipType: "TRUST_SIGNAL",
      strength: 78,
      score: 78,
      reason: "trust_reassurance_needed",
      lastObservedAt: enrichment.lastTouchAt || snapshot.now,
    });
  }

  if (snapshot.relatedLeads.length > 0) {
    edges.push({
      targetType: "REFERRAL",
      targetId: `network:${snapshot.leadId}`,
      targetLabel: "Referral network",
      relationshipType: "REFERRAL_SIGNAL",
      strength: clampScore(62 + snapshot.relatedLeads.length * 8),
      score: clampScore(62 + snapshot.relatedLeads.length * 8),
      reason: "related_identity_network_detected",
      metadata: {
        peerLeadIds: snapshot.relatedLeads.map((lead) => lead.id),
      },
      lastObservedAt: snapshot.now,
    });
  }

  for (const relatedLead of snapshot.relatedLeads.slice(0, 4)) {
    const sharedFields = [
      relatedLead.email && relatedLead.email === snapshot.lead.email ? "email" : null,
      relatedLead.phone && relatedLead.phone === snapshot.lead.phone ? "phone" : null,
      relatedLead.instagramId && relatedLead.instagramId === snapshot.lead.instagramId
        ? "instagramId"
        : null,
    ].filter(Boolean);

    edges.push({
      targetType: "PEER_LEAD",
      targetId: relatedLead.id,
      targetLabel: relatedLead.name || relatedLead.platform || "Related lead",
      relationshipType: "IDENTITY_MATCH",
      strength: clampScore(52 + sharedFields.length * 16),
      score: clampScore(52 + sharedFields.length * 16),
      reason: "shared_identity_signal",
      metadata: {
        sharedFields,
      },
      lastObservedAt: snapshot.now,
    });
  }

  return edges;
};

export const buildCustomerGraph = (
  snapshot: CRMLeadSignalSnapshot
): CRMCustomerGraph => {
  const enrichment = buildEnrichment(snapshot);
  const edges = buildBaseEdges({
    snapshot,
    enrichment,
  });
  const nodes = [
    {
      key: `lead:${snapshot.leadId}`,
      type: "LEAD",
      label: enrichment.resolvedName || snapshot.leadId,
      weight: 100,
    },
    {
      key: `business:${snapshot.businessId}`,
      type: "BUSINESS",
      label: snapshot.business.name || "Business",
      weight: 100,
    },
    ...(snapshot.business.website || snapshot.business.industry
      ? [
          {
            key: `company:${snapshot.businessId}`,
            type: "COMPANY",
            label: snapshot.business.name || snapshot.business.website || "Company profile",
            weight: 86,
          },
        ]
      : []),
    ...(snapshot.client.id
      ? [
          {
            key: `client:${snapshot.client.id}`,
            type: "CLIENT",
            label: snapshot.client.platform || "Client channel",
            weight: 88,
          },
        ]
      : []),
    ...snapshot.memory.facts.slice(0, 4).map((fact) => ({
      key: `memory:${normalizeText(fact.key).toLowerCase()}`,
      type: "MEMORY",
      label: `${fact.key}:${fact.value}`,
      weight: clampScore(fact.confidence * 100),
    })),
    ...snapshot.appointments.slice(0, 2).map((appointment) => ({
      key: `appointment:${appointment.id}`,
      type: "APPOINTMENT",
      label: appointment.status,
      weight:
        appointment.startTime >= snapshot.now && appointment.status !== "CANCELLED"
          ? 92
          : 72,
    })),
  ];
  const connectedSystems = [
    snapshot.memory.facts.length > 0 ? "memory" : null,
    snapshot.analytics.aiReplyCount > 0 || snapshot.conversionStats.total > 0
      ? "analytics"
      : null,
    snapshot.appointments.length > 0 ? "booking" : null,
    snapshot.followups.schedule.length > 0 || snapshot.lead.followupCount > 0
      ? "followups"
      : null,
    "crm",
    snapshot.conversationState.name || snapshot.traceId ? "orchestrator" : null,
  ].filter(Boolean) as string[];
  const graphHealth = clampScore(
    enrichment.profileCompleteness * 0.4 +
      enrichment.identityConfidence * 0.25 +
      Math.min(edges.length * 6, 25) +
      Math.min(connectedSystems.length * 4, 10)
  );

  return {
    nodes,
    edges,
    connectedSystems,
    profileCompleteness: enrichment.profileCompleteness,
    identityConfidence: enrichment.identityConfidence,
    graphHealth,
    enrichment,
    stats: {
      messageCount: snapshot.messageStats.total,
      memoryFactCount: snapshot.memory.facts.length,
      conversionCount: snapshot.conversionStats.total,
      followupCount: snapshot.followups.schedule.length + snapshot.lead.followupCount,
      appointmentCount: snapshot.appointments.length,
      relatedLeadCount: snapshot.relatedLeads.length,
    },
  };
};
