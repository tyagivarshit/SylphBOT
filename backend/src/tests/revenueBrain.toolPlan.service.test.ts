import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRevenueBrainToolPlan } from "../services/revenueBrain/toolPlan.service";

test("sales route builds a unified phased plan", () => {
  const plan = buildRevenueBrainToolPlan({
    decision: {
      route: "SALES",
      salesDecision: null,
      conversion: null,
      reasoning: ["sales_action:ENGAGE"],
      couponRequested: true,
      toolPlan: [],
    },
    route: "SALES",
    hasReply: true,
  });

  assert.deepEqual(
    plan.map((item) => `${item.phase}:${item.name}`),
    ["before_reply:coupon", "after_reply:crm", "deferred:followup"]
  );
});

test("booking route keeps booking before reply and deferred followup", () => {
  const plan = buildRevenueBrainToolPlan({
    decision: {
      route: "BOOKING",
      salesDecision: null,
      conversion: null,
      reasoning: ["booking_route_selected"],
      couponRequested: false,
      toolPlan: [],
    },
    route: "BOOKING",
    hasReply: true,
  });

  assert.deepEqual(
    plan.map((item) => `${item.phase}:${item.name}`),
    ["before_reply:booking", "after_reply:crm", "deferred:followup"]
  );
});

test("no-reply route returns no post-reply work", () => {
  const plan = buildRevenueBrainToolPlan({
    decision: {
      route: "NO_REPLY",
      salesDecision: null,
      conversion: null,
      reasoning: ["human_takeover_active"],
      couponRequested: false,
      toolPlan: [],
    },
    route: "NO_REPLY",
    hasReply: false,
  });

  assert.equal(plan.length, 0);
});
