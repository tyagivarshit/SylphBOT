import type {
  CRMCustomerGraph,
  CRMLifecycleAssessment,
  CRMLeadSignalSnapshot,
  CRMScoreSeeds,
} from "./leadIntelligence.service";
import { resolveUnifiedCustomerState } from "./stateGraph.service";

const clampScore = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(value)));

const normalizeText = (value?: unknown) => String(value || "").trim().toUpperCase();

const resolveLifecycleScore = ({
  stage,
  lastTouchDays,
  seeds,
}: {
  stage: string;
  lastTouchDays: number | null;
  seeds: CRMScoreSeeds;
}) => {
  const stageBase: Record<string, number> = {
    NEW: 24,
    ENGAGED: 48,
    NURTURING: 54,
    QUALIFIED: 68,
    OPPORTUNITY: 84,
    BOOKED: 92,
    CONVERTED: 100,
    AT_RISK: 42,
    DORMANT: 20,
  };

  let score = stageBase[stage] || 30;

  if (lastTouchDays !== null) {
    if (lastTouchDays <= 1) score += 6;
    else if (lastTouchDays <= 3) score += 3;
    else if (lastTouchDays >= 14) score -= 8;
  }

  score += Math.round(seeds.buyingIntentScore * 0.08);
  score += Math.round(seeds.engagementScore * 0.04);

  return clampScore(score);
};

const resolveLeadStage = ({
  lifecycleStage,
  bookingState,
  conversionState,
  existingStage,
}: {
  lifecycleStage: string;
  bookingState: string;
  conversionState: string;
  existingStage?: string | null;
}) => {
  if (conversionState === "WON" || lifecycleStage === "CONVERTED") return "WON";
  if (bookingState === "SCHEDULED" || lifecycleStage === "BOOKED") return "BOOKED_CALL";
  if (lifecycleStage === "OPPORTUNITY") return "READY_TO_BUY";
  if (lifecycleStage === "QUALIFIED" || lifecycleStage === "NURTURING" || lifecycleStage === "ENGAGED") {
    return normalizeText(existingStage) === "NEW" ? "INTERESTED" : existingStage || "INTERESTED";
  }

  return existingStage || "NEW";
};

const resolveRevenueState = ({
  commercialState,
  existingState,
}: {
  commercialState: string;
  existingState?: string | null;
}) => {
  if (commercialState === "CONVERTED") return "CONVERTED";
  if (commercialState === "HOT") return "HOT";
  if (commercialState === "WARM") {
    return normalizeText(existingState) === "HOT" ? "HOT" : "WARM";
  }

  return existingState || "COLD";
};

const resolveAIStage = ({
  commercialState,
  lifecycleStage,
  existingAIStage,
}: {
  commercialState: string;
  lifecycleStage: string;
  existingAIStage?: string | null;
}) => {
  if (commercialState === "CONVERTED") return "HOT";
  if (commercialState === "HOT" || lifecycleStage === "BOOKED") return "HOT";
  if (commercialState === "WARM" || lifecycleStage === "QUALIFIED" || lifecycleStage === "ENGAGED" || lifecycleStage === "NURTURING") {
    return normalizeText(existingAIStage) === "HOT" ? "HOT" : "WARM";
  }

  return existingAIStage || "COLD";
};

export const assessLeadLifecycle = (
  snapshot: CRMLeadSignalSnapshot,
  graph: CRMCustomerGraph,
  seeds: CRMScoreSeeds
): CRMLifecycleAssessment => {
  const stateGraph = resolveUnifiedCustomerState({
    snapshot,
    graph,
    seeds,
  });
  const stage = stateGraph.lifecycle.stage;

  return {
    stage,
    status: stateGraph.lifecycle.status,
    score: resolveLifecycleScore({
      stage,
      lastTouchDays: stateGraph.lifecycle.daysSinceLastTouch,
      seeds,
    }),
    nextLeadStage: resolveLeadStage({
      lifecycleStage: stage,
      bookingState: stateGraph.booking.state,
      conversionState: stateGraph.conversion.state,
      existingStage: snapshot.lead.stage,
    }),
    nextRevenueState: resolveRevenueState({
      commercialState: stateGraph.commercial.state,
      existingState: snapshot.lead.revenueState,
    }),
    nextAIStage: resolveAIStage({
      commercialState: stateGraph.commercial.state,
      lifecycleStage: stage,
      existingAIStage: snapshot.lead.aiStage,
    }),
    reason: stateGraph.lifecycle.reason,
    daysSinceLastTouch: stateGraph.lifecycle.daysSinceLastTouch,
    stale: stateGraph.lifecycle.stale,
    lastLifecycleAt: snapshot.now,
  };
};
