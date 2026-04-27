import type {
  CRMCustomerGraph,
  CRMLeadSignalSnapshot,
  CRMLifecycleAssessment,
  CRMRelationshipEdge,
  CRMRelationshipMap,
  CRMScoreSeeds,
} from "./leadIntelligence.service";

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const dedupeEdges = (edges: CRMRelationshipEdge[]) =>
  Array.from(
    new Map(edges.map((edge) => [`${edge.targetType}:${edge.targetId}`, edge])).values()
  );

const buildAnalyticsEdges = (
  snapshot: CRMLeadSignalSnapshot
): CRMRelationshipEdge[] => {
  const edges: CRMRelationshipEdge[] = [];

  if (snapshot.conversionStats.repliedCount > 0) {
    edges.push({
      targetType: "ANALYTICS",
      targetId: "replied",
      targetLabel: "Recent reply",
      relationshipType: "ENGAGEMENT_SIGNAL",
      strength: 56,
      score: 56,
      reason: "recent_reply_conversion",
      lastObservedAt: snapshot.conversionStats.lastConversionAt || snapshot.now,
    });
  }

  if (snapshot.conversionStats.clickedCount > 0) {
    edges.push({
      targetType: "ANALYTICS",
      targetId: "link_clicked",
      targetLabel: "Clicked CTA",
      relationshipType: "CONVERSION_SIGNAL",
      strength: 72,
      score: 72,
      reason: "cta_click_detected",
      lastObservedAt: snapshot.conversionStats.lastConversionAt || snapshot.now,
    });
  }

  if (snapshot.conversionStats.bookedCount > 0) {
    edges.push({
      targetType: "ANALYTICS",
      targetId: "booked_call",
      targetLabel: "Booked call",
      relationshipType: "BOOKING_SIGNAL",
      strength: 88,
      score: 88,
      reason: "booking_conversion_detected",
      lastObservedAt: snapshot.conversionStats.lastConversionAt || snapshot.now,
    });
  }

  return edges;
};

export const mapLeadRelationships = (
  snapshot: CRMLeadSignalSnapshot,
  graph: CRMCustomerGraph,
  lifecycle: CRMLifecycleAssessment,
  seeds: CRMScoreSeeds
): CRMRelationshipMap => {
  const edges = dedupeEdges([...graph.edges, ...buildAnalyticsEdges(snapshot)]).sort(
    (left, right) => right.score - left.score
  );
  const strongestEdge = edges[0] || null;
  const structuralEdgeCount = edges.filter((edge) =>
    ["COMPANY", "REFERRAL", "TRUST", "BUSINESS"].includes(edge.targetType)
  ).length;
  const weightedAverage =
    edges.length > 0
      ? edges
          .slice(0, 5)
          .reduce((sum, edge) => sum + edge.score, 0) / Math.min(edges.length, 5)
      : 0;
  const relationshipScore = clampScore(
    weightedAverage * 0.62 +
      graph.identityConfidence * 0.18 +
      graph.profileCompleteness * 0.12 +
      Math.min(graph.connectedSystems.length * 3, 8) +
      Math.min(structuralEdgeCount * 3, 10) +
      Math.min(seeds.engagementScore * 0.08, 8)
  );
  const health =
    relationshipScore >= 78 ? "STRONG" : relationshipScore >= 55 ? "STABLE" : "FRAGILE";
  const relationshipAnchors = edges
    .filter((edge) => ["COMPANY", "REFERRAL", "TRUST"].includes(edge.targetType))
    .slice(0, 2)
    .map((edge) => edge.targetType.toLowerCase())
    .join("+");
  const summary = strongestEdge
    ? `${health.toLowerCase()} map anchored by ${strongestEdge.targetLabel || strongestEdge.targetType.toLowerCase()} across ${edges.length} edges${relationshipAnchors ? ` with ${relationshipAnchors} context` : ""}`
    : "minimal relationship map";

  return {
    relationshipScore,
    health,
    summary,
    edges,
    strongestEdge,
    edgeCount: edges.length,
  };
};
