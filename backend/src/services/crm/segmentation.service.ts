import type {
  CRMBehaviorPrediction,
  CRMCustomerGraph,
  CRMLeadSignalSnapshot,
  CRMLifecycleAssessment,
  CRMRelationshipMap,
  CRMScoreSeeds,
  CRMSegmentProfile,
  CRMValuePrediction,
} from "./leadIntelligence.service";

const normalizeText = (value?: unknown) => String(value || "").trim().toUpperCase();

type SegmentCandidate = {
  key: string;
  score: number;
  reason: string;
};

const upsertCandidate = (
  map: Map<string, SegmentCandidate>,
  candidate: SegmentCandidate
) => {
  const current = map.get(candidate.key);

  if (!current || candidate.score > current.score) {
    map.set(candidate.key, candidate);
  }
};

export const buildLeadSegments = (
  snapshot: CRMLeadSignalSnapshot,
  graph: CRMCustomerGraph,
  lifecycle: CRMLifecycleAssessment,
  behavior: CRMBehaviorPrediction,
  value: CRMValuePrediction,
  relationships: CRMRelationshipMap,
  seeds: CRMScoreSeeds
): CRMSegmentProfile => {
  const objection = normalizeText(snapshot.salesSignals.objection);
  const candidates = new Map<string, SegmentCandidate>();
  const relationshipTypes = new Set(
    relationships.edges.map((edge) => `${edge.targetType}:${edge.relationshipType}`)
  );

  if (snapshot.lead.isHumanActive) {
    upsertCandidate(candidates, {
      key: "human_handoff",
      score: 120,
      reason: "human_takeover_active",
    });
  }

  if (lifecycle.stage === "CONVERTED") {
    upsertCandidate(candidates, {
      key: "converted_customer",
      score: 110,
      reason: "converted_lifecycle_detected",
    });
  }

  if (lifecycle.stage === "BOOKED") {
    upsertCandidate(candidates, {
      key: "booked_pipeline",
      score: 108,
      reason: "booked_lifecycle_detected",
    });
  }

  if (lifecycle.stage === "AT_RISK") {
    upsertCandidate(candidates, {
      key: "retention_watch",
      score: 102,
      reason: "at_risk_lifecycle_detected",
    });
  }

  if (lifecycle.stage === "DORMANT") {
    upsertCandidate(candidates, {
      key: "dormant_reengage",
      score: 96,
      reason: "dormant_lifecycle_detected",
    });
  }

  if (value.valueTier === "STRATEGIC" && value.churnRisk === "HIGH") {
    upsertCandidate(candidates, {
      key: "vip_recovery",
      score: 104,
      reason: "high_value_lead_with_churn_risk",
    });
  }

  if (behavior.predictedBehavior === "BOOKING_READY") {
    upsertCandidate(candidates, {
      key: "booking_ready",
      score: 100,
      reason: "booking_signal_cluster",
    });
  }

  if (behavior.predictedBehavior === "CLOSE_READY") {
    upsertCandidate(candidates, {
      key: "sales_ready",
      score: 95,
      reason: "purchase_signal_cluster",
    });
  }

  if (behavior.predictedBehavior === "CHURNING") {
    upsertCandidate(candidates, {
      key: "retention_watch",
      score: 92,
      reason: "churn_signal_cluster",
    });
  }

  if (behavior.predictedBehavior === "FOLLOWUP_RECOVERY") {
    upsertCandidate(candidates, {
      key: "followup_recovery",
      score: 78,
      reason: "followup_reengagement_cluster",
    });
  }

  if (objection === "PRICE" || normalizeText(snapshot.salesSignals.intent) === "PRICING") {
    upsertCandidate(candidates, {
      key: "price_sensitive",
      score: 82,
      reason: "pricing_objection_detected",
    });
  }

  if (objection === "TRUST" || relationshipTypes.has("TRUST:TRUST_SIGNAL")) {
    upsertCandidate(candidates, {
      key: "trust_rebuild",
      score: 84,
      reason: "trust_signal_detected",
    });
  }

  if (relationshipTypes.has("REFERRAL:REFERRAL_SIGNAL")) {
    upsertCandidate(candidates, {
      key: "referral_warm",
      score: 76,
      reason: "referral_network_detected",
    });
  }

  if (relationshipTypes.has("COMPANY:COMPANY_CONTEXT")) {
    upsertCandidate(candidates, {
      key: "company_attached",
      score: 70,
      reason: "company_context_available",
    });
  }

  if (value.valueTier === "HIGH" || value.valueTier === "STRATEGIC") {
    upsertCandidate(candidates, {
      key: "high_value_pipeline",
      score: value.valueTier === "STRATEGIC" ? 88 : 72,
      reason: "value_tier_above_threshold",
    });
  }

  if (/\b(today|tomorrow|this week|asap|urgent)\b/i.test(
    String(graph.enrichment.resolvedTimeline || "")
  )) {
    upsertCandidate(candidates, {
      key: "fast_mover",
      score: 74,
      reason: "urgent_timeline_detected",
    });
  }

  if (snapshot.memory.facts.length >= 4) {
    upsertCandidate(candidates, {
      key: "memory_rich",
      score: 58,
      reason: "durable_memory_depth_detected",
    });
  }

  if (relationships.relationshipScore >= 80) {
    upsertCandidate(candidates, {
      key: "relationship_strong",
      score: 68,
      reason: "relationship_strength_above_threshold",
    });
  }

  if (seeds.qualificationScore < 40) {
    upsertCandidate(candidates, {
      key: "profile_enrichment_needed",
      score: snapshot.salesSignals.qualificationMissing.length >= 3 ? 88 : 66,
      reason: "qualification_data_missing",
    });
  }

  if (seeds.engagementScore >= 60) {
    upsertCandidate(candidates, {
      key: "active_nurture",
      score: 64,
      reason: "engagement_above_threshold",
    });
  }

  if (candidates.size === 0) {
    upsertCandidate(candidates, {
      key: "early_stage",
      score: 40,
      reason: "default_early_stage_cluster",
    });
  }

  const ranked = Array.from(candidates.values()).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.key.localeCompare(right.key);
  });
  const segmentKeys = ranked.slice(0, 6).map((item) => item.key);
  const primarySegment = segmentKeys[0] || "early_stage";
  const secondarySegment = segmentKeys[1] || null;

  return {
    primarySegment,
    secondarySegment,
    segmentKeys,
    reason: ranked[0]?.reason || `segment:${primarySegment}`,
  };
};
