import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapseMemoryFacts,
  computeMemoryDecay,
  selectRelevantMemoryFacts,
} from "../services/revenueBrain/memory.utils";

test("collapseMemoryFacts keeps the newest fact for a key", () => {
  const facts = collapseMemoryFacts([
    {
      id: "older",
      key: "budget",
      value: "2000",
      confidence: 0.6,
      createdAt: "2026-03-01T00:00:00.000Z",
      lastObservedAt: "2026-03-01T00:00:00.000Z",
    },
    {
      id: "newer",
      key: "budget",
      value: "3500",
      confidence: 0.78,
      createdAt: "2026-04-20T00:00:00.000Z",
      lastObservedAt: "2026-04-20T00:00:00.000Z",
    },
  ]);

  assert.equal(facts.length, 1);
  assert.equal(facts[0].id, "newer");
  assert.equal(facts[0].value, "3500");
});

test("selectRelevantMemoryFacts prefers matching fresh facts", () => {
  const facts = selectRelevantMemoryFacts({
    inputs: [
      {
        id: "service",
        key: "service",
        value: "website redesign",
        confidence: 0.82,
        createdAt: "2026-04-20T00:00:00.000Z",
        lastObservedAt: "2026-04-20T00:00:00.000Z",
      },
      {
        id: "old-note",
        key: "timeline",
        value: "next month",
        confidence: 0.3,
        createdAt: "2025-11-01T00:00:00.000Z",
        lastObservedAt: "2025-11-01T00:00:00.000Z",
      },
    ],
    message: "I want help with website redesign pricing",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });

  assert.equal(facts[0].key, "service");
  assert.equal(facts[0].value, "website redesign");
  assert.equal(facts.some((fact) => fact.id === "old-note"), false);
});

test("computeMemoryDecay marks stale low-confidence facts", () => {
  const decay = computeMemoryDecay({
    confidence: 0.4,
    lastObservedAt: "2025-12-01T00:00:00.000Z",
    now: new Date("2026-04-25T00:00:00.000Z"),
  });

  assert.equal(decay.stale, true);
  assert.ok(decay.decayedConfidence < 0.2);
});
