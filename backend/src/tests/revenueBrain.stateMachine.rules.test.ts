import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDeterministicRevenueState } from "../services/revenueBrain/stateMachine.rules";

test("state machine advances stepwise under strong booking intent", () => {
  const result = resolveDeterministicRevenueState({
    currentState: "COLD",
    intent: "BOOKING",
    temperature: "HOT",
    userSignal: "yes",
  });

  assert.equal(result.currentState, "COLD");
  assert.equal(result.nextState, "WARM");
  assert.match(result.transitionReason, /stepped_from_cold_to_warm/);
});

test("state machine blocks AI replies during human takeover", () => {
  const result = resolveDeterministicRevenueState({
    currentState: "WARM",
    intent: "GENERAL",
    isHumanActive: true,
  });

  assert.equal(result.nextState, "WARM");
  assert.equal(result.shouldReply, false);
  assert.equal(result.transitionReason, "human_takeover_active");
});

test("state machine keeps converted leads terminal", () => {
  const result = resolveDeterministicRevenueState({
    currentState: "CONVERTED",
    intent: "BOOKING",
    temperature: "HOT",
  });

  assert.equal(result.nextState, "CONVERTED");
  assert.equal(result.transitionReason, "terminal:converted");
});

test("state machine keeps booked lifecycle leads hot without marking them converted", () => {
  const result = resolveDeterministicRevenueState({
    currentState: "WARM",
    intent: "BOOKING",
    temperature: "HOT",
    lifecycleStage: "BOOKED",
    bookingState: "SCHEDULED",
    commercialState: "HOT",
    conversationMode: "BOOKING_ACTIVE",
  });

  assert.equal(result.currentState, "WARM");
  assert.equal(result.nextState, "HOT");
  assert.equal(result.transitionReason, "crm_state:booked");
});
