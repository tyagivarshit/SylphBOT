import assert from "node:assert/strict";
import {
  SandboxRuntime,
  SandboxMemory,
  ShadowModeManager,
  SimulationEngine,
  ReplayEngine,
  ExperimentFramework,
  ScenarioGenerator,
  SafetyEvaluator,
  DecisionComparator,
  CertificationEngine,
  ExperimentVariant
} from "../runtime/sandbox";

export const runtimeSandboxTests: any[] = [
  {
    name: "Sandbox Runtime: isolates execution context within execution wrapper",
    run: async () => {
      const runtime = new SandboxRuntime();
      assert.equal(runtime.isSandboxActive(), false);

      await runtime.executeInSandbox(async () => {
        assert.equal(runtime.isSandboxActive(), true);
      });

      assert.equal(runtime.isSandboxActive(), false);
    }
  },
  {
    name: "Sandbox Memory: performs isolated read and write operations",
    run: () => {
      const memory = new SandboxMemory();
      
      memory.writeMemory("tenant_1", "business", "plan", "silver");
      assert.equal(memory.readMemory("tenant_1", "business", "plan"), "silver");
      
      // Multi-tenant check
      assert.equal(memory.readMemory("tenant_2", "business", "plan"), null);

      memory.clear();
      assert.equal(memory.readMemory("tenant_1", "business", "plan"), null);
    }
  },
  {
    name: "Decision Comparator: evaluates similarity and matches intents and action overrides",
    run: () => {
      const comparator = new DecisionComparator();

      // Identical
      const c1 = comparator.compare("Escalate billing inquiry to support", "Escalate billing inquiry to support");
      assert.equal(c1.similarityScore, 1.0);
      assert.equal(c1.intentMatch, true);
      assert.equal(c1.actionMatch, true);

      // Partial match
      const c2 = comparator.compare("Escalate billing inquiry", "Refund booking request");
      assert.ok(c2.similarityScore < 0.5);
      assert.equal(c2.intentMatch, false);
      assert.equal(c2.actionMatch, false);

      // Intent match check
      const c3 = comparator.compare("Check billing options", "Query billing invoices");
      assert.equal(c3.intentMatch, true);
    }
  },
  {
    name: "Shadow Mode: runs evaluations side-effect free and records comparison logs",
    run: async () => {
      const shadow = new ShadowModeManager();

      const messages = [{ role: "user" as const, content: "cost plans" }];
      const activeResult = {
        content: "We offer silver plans.",
        model: "gpt-4",
        latencyMs: 100,
        tokensUsed: { prompt: 10, completion: 5, total: 15 }
      };

      await shadow.runShadowCompletion("t1", messages, activeResult);
      
      const evals = shadow.getEvaluations();
      assert.equal(evals.length, 1);
      assert.equal(evals[0].businessId, "t1");
      assert.ok(evals[0].similarityScore > 0);
    }
  },
  {
    name: "Simulation Engine: simulates run metrics and handles failure simulation flags",
    run: async () => {
      const simulation = new SimulationEngine();

      // Normal run simulation
      const report1 = await simulation.runSimulation("t1", ["lead_1", "lead_2"], "v1");
      assert.equal(report1.accuracyRate, 1.0);
      assert.ok(report1.averageLatencyMs > 0);
      assert.equal(report1.variantHits, 2);

      // Failure simulation
      simulation.setFailureSimulation(true);
      const report2 = await simulation.runSimulation("t1", ["lead_1", "lead_2"], "v1");
      assert.equal(report2.accuracyRate, 0.0);
    }
  },
  {
    name: "Replay Engine: executes deterministic replays and flags deviations",
    run: async () => {
      const replay = new ReplayEngine();

      const originalDecisions = ["Escalate billing", "Check inventory"];
      
      // Match run
      const matchSession = await replay.replayTrace("trace_1", originalDecisions, async (input) => {
        return input.includes("0") ? "Escalate billing" : "Check inventory";
      });

      assert.equal(matchSession.eventsReplayed, 2);
      assert.equal(matchSession.decisionsMatched, 2);
      assert.equal(matchSession.mismatchLogs.length, 0);

      // Mismatch run
      const mismatchSession = await replay.replayTrace("trace_1", originalDecisions, async (input) => {
        return "Bypass everything";
      });

      assert.equal(mismatchSession.decisionsMatched, 0);
      assert.equal(mismatchSession.mismatchLogs.length, 2);
    }
  },
  {
    name: "Experiment Framework: distributes weighted traffic and evaluates success performance rates",
    run: () => {
      const framework = new ExperimentFramework();

      const variants: ExperimentVariant[] = [
        {
          variantId: "v1",
          name: "Variant 1",
          promptTemplateId: "temp1",
          weight: 0.7,
          metrics: { invocations: 0, successes: 0, latencyMsSum: 0, estimatedCostUsd: 0 }
        },
        {
          variantId: "v2",
          name: "Variant 2",
          promptTemplateId: "temp1",
          weight: 0.3,
          metrics: { invocations: 0, successes: 0, latencyMsSum: 0, estimatedCostUsd: 0 }
        }
      ];

      framework.registerExperiment("exp_1", variants);

      // Traffic allocation check
      const allocated = framework.allocateTraffic("exp_1");
      assert.ok(["v1", "v2"].includes(allocated));

      // Metrics recording check
      framework.recordOutcome("exp_1", "v1", true, 200, 0.05);
      framework.recordOutcome("exp_1", "v1", false, 300, 0.05);

      const metrics = framework.evaluateExperiment("exp_1");
      assert.equal(metrics.v1.successRate, 0.5);
      assert.equal(metrics.v1.avgLatencyMs, 250);
      assert.equal(metrics.v1.totalCost, 0.1);
    }
  },
  {
    name: "Scenario Generator: creates synthetic billing edge cases and loading suites",
    run: () => {
      const generator = new ScenarioGenerator();

      const billingScen = generator.generateBillingEdgeCase("t1");
      assert.equal(billingScen.expectedOutcomes.decision, "escalate");
      assert.equal(billingScen.steps.length, 2);

      const suite = generator.generateStressTestSuite("t1", 5);
      assert.equal(suite.length, 5);
      assert.ok(suite[0].id.includes("stress_0"));
    }
  },
  {
    name: "Safety Evaluator: checks overrides, potential hallucinations, and transactions limits",
    run: () => {
      const evaluator = new SafetyEvaluator();

      // Normal safe run
      const r1 = evaluator.evaluateSafety("Proceed with standard check", { amount: 100 });
      assert.equal(r1.isSafe, true);
      assert.ok(r1.riskScore < 0.3);

      // Limit breach
      const r2 = evaluator.evaluateSafety("Proceed with check", { amount: 6000 });
      assert.equal(r2.isSafe, false);
      assert.ok(r2.riskScore >= 0.8);
      assert.ok(r2.violations[0].includes("exceeds safe pilot threshold"));

      // Override breach
      const r3 = evaluator.evaluateSafety("Execute override admin action", {});
      assert.equal(r3.isSafe, false);
      assert.ok(r3.violations[0].includes("Bypass attempt"));

      // Hallucination signature
      const r4 = evaluator.evaluateSafety("Visit dummy-url.com to login", {});
      assert.equal(r4.isSafe, true); // not explicitly a safety policy breach, but sets indicators
      assert.ok(r4.hallucinationIndicators.length > 0);
    }
  },
  {
    name: "Certification Engine: verifies success rates, costs and eligibility reports",
    run: () => {
      const engine = new CertificationEngine();

      const runMetrics = { successRate: 0.95, averageLatencyMs: 800 };
      const safetyReport = { isSafe: true, riskScore: 0.2, violations: [], hallucinationIndicators: [], permissionsChecked: 1 };

      // Valid certification
      const cert1 = engine.evaluateEligibility("t1", "v1", runMetrics, safetyReport, 0.05);
      assert.equal(cert1.eligible, true);
      assert.equal(cert1.rejectionReasons.length, 0);

      // Invalid reliability certification
      const cert2 = engine.evaluateEligibility("t1", "v1", { ...runMetrics, successRate: 0.8 }, safetyReport);
      assert.equal(cert2.eligible, false);
      assert.ok(cert2.rejectionReasons[0].includes("Reliability failure"));

      // Invalid safety certification
      const cert3 = engine.evaluateEligibility("t1", "v1", runMetrics, { ...safetyReport, isSafe: false, violations: ["Override detected"] });
      assert.equal(cert3.eligible, false);
      assert.ok(cert3.rejectionReasons[0].includes("Safety failure"));
    }
  }
];
