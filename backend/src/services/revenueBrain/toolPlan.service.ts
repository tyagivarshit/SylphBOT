import type {
  RevenueBrainDecision,
  RevenueBrainRoute,
  RevenueBrainToolName,
  RevenueBrainToolPhase,
  RevenueBrainToolPlan,
} from "./types";

const PHASE_ORDER: Record<RevenueBrainToolPhase, number> = {
  before_reply: 0,
  after_reply: 1,
  deferred: 2,
};

const addTool = (
  plan: RevenueBrainToolPlan[],
  name: RevenueBrainToolName,
  phase: RevenueBrainToolPhase,
  reason: string
) => {
  if (plan.some((item) => item.name === name && item.phase === phase)) {
    return;
  }

  plan.push({
    name,
    phase,
    reason,
  });
};

export const sortRevenueBrainToolPlan = (plan: RevenueBrainToolPlan[]) =>
  [...plan].sort((left, right) => {
    if (PHASE_ORDER[left.phase] !== PHASE_ORDER[right.phase]) {
      return PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase];
    }

    return left.name.localeCompare(right.name);
  });

export const mergeRevenueBrainToolPlans = (...plans: RevenueBrainToolPlan[][]) => {
  const merged: RevenueBrainToolPlan[] = [];

  for (const plan of plans) {
    for (const item of plan) {
      addTool(
        merged,
        item.name,
        item.phase,
        item.reason || "merged_execution_plan"
      );
    }
  }

  return sortRevenueBrainToolPlan(merged);
};

export const buildRevenueBrainToolPlan = ({
  decision,
  route,
  hasReply,
}: {
  decision: RevenueBrainDecision;
  route: RevenueBrainRoute;
  hasReply: boolean;
}) => {
  const plan: RevenueBrainToolPlan[] = [];

  if (decision.couponRequested && route === "SALES") {
    addTool(plan, "coupon", "before_reply", "coupon_requested");
  }

  if (route === "BOOKING") {
    addTool(plan, "booking", "before_reply", "booking_route");
  }

  if (route === "ESCALATE") {
    addTool(plan, "escalate", "before_reply", "escalation_route");
  }

  if (hasReply && route !== "NO_REPLY") {
    addTool(plan, "crm", "after_reply", "reply_persisted");
    addTool(plan, "followup", "deferred", "delivery_worker_followup");
  }

  return sortRevenueBrainToolPlan(plan);
};
