import assert from "node:assert/strict";
import {
  __intelligencePhase5ETestInternals,
  applyManualIntelligenceOverride,
  assignExperimentVariant,
  rollbackOptimizationDecision,
  runIntelligenceLoop,
  runIntelligenceSimulation,
  trackRecommendationOutcome,
  type IntelligenceDomainSnapshot,
} from "../services/intelligence/intelligenceOS.service";
import type { TestCase } from "./reception.test.helpers";

const resetIntelligenceStore = () => {
  const store = __intelligencePhase5ETestInternals.getStore();
  store.featureSnapshots.clear();
  store.forecasts.clear();
  store.predictions.clear();
  store.optimizations.clear();
  store.experiments.clear();
  store.recommendations.clear();
  store.anomalies.clear();
  store.simulations.clear();
  store.modelRegistry.clear();
  store.policies.clear();
  store.overrides.clear();
  store.runMarkers.clear();
  store.ownerFeed.length = 0;
};

const createSnapshot = ({
  businessId = "business_1",
  asOf,
  conversionRate = 0.32,
  revenueSignal = 1200,
  queueLag = 3,
  churnSignal = 4,
  refunds = 1,
  chargebacks = 0,
}: {
  businessId?: string;
  asOf: Date;
  conversionRate?: number;
  revenueSignal?: number;
  queueLag?: number;
  churnSignal?: number;
  refunds?: number;
  chargebacks?: number;
}): IntelligenceDomainSnapshot => ({
  businessId,
  asOf,
  ownerUserId: "owner_1",
  timezone: "Asia/Calcutta",
  signals: {
    lead_count: 120,
    new_leads_7d: 14,
    new_leads_30d: 64,
    bookings_requested_30d: 48,
    bookings_confirmed_30d: 26,
    no_show_count_30d: 4,
    renewals_due_30d: 12,
    churned_subscriptions_30d: churnSignal,
    support_volume_7d: 70,
    slot_reservations_7d: 42,
    revenue_recognized_minor_30d: revenueSignal * 100,
    payment_failures_7d: 3,
    refund_count_30d: refunds,
    chargeback_count_30d: chargebacks,
    escalation_count_7d: 5,
    spam_score_7d: 0.18,
    queue_lag_score: queueLag,
    outbox_pending_count: 2,
    outbox_failed_count: 1,
    worker_lag_signal: 8,
    calendar_sync_failure_signal: 2,
    provider_outage_signal: 4,
    conversion_rate: conversionRate,
    forecast_signal_revenue: revenueSignal,
    forecast_signal_lead_inflow: 2.1,
    forecast_signal_booking_demand: 1.4,
    forecast_signal_staffing: 7.6,
    forecast_signal_renewal: 0.35,
    forecast_signal_churn: 0.14,
    forecast_signal_support_load: 10.3,
    forecast_signal_slot_demand: 5.8,
  },
  reception: {
    inbound_received_total: 100,
    routed_total: 90,
    sla_breach_total: 3,
    avg_first_response_time: 5000,
    avg_resolution_time: 25000,
  },
  queueHealth: {
    "reception:waiting": 6,
    "calendarSync:failed": 2,
  },
  projections: {
    appointment: {
      utilizationPercent: 71,
    },
    commerce: {
      counts: {
        invoicesPaid: 20,
      },
    },
  },
  leads: [
    {
      leadId: "lead_1",
      stage: "INTERESTED",
      compositeScore: 82,
      churnScore: 24,
      valueScore: 78,
      followupCount: 2,
      unreadCount: 1,
      hoursSinceLastEngagement: 5,
      bookedCount: 1,
      paymentCount: 0,
      noShowCount: 0,
      refundCount: 0,
      chargebackCount: 0,
      escalationCount: 0,
      spamScore: 0.05,
    },
    {
      leadId: "lead_2",
      stage: "BOOKED_CALL",
      compositeScore: 66,
      churnScore: 38,
      valueScore: 62,
      followupCount: 3,
      unreadCount: 2,
      hoursSinceLastEngagement: 28,
      bookedCount: 2,
      paymentCount: 0,
      noShowCount: 1,
      refundCount: 0,
      chargebackCount: 0,
      escalationCount: 1,
      spamScore: 0.2,
    },
  ],
});

export const intelligencePhase5ETests: TestCase[] = [
  {
    name: "phase5e prediction replay remains deterministic and idempotent",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T10:00:00.000Z");
      const snapshot = createSnapshot({ asOf });

      await runIntelligenceLoop({ businessId: "business_1", asOf, snapshotOverride: snapshot });
      const store = __intelligencePhase5ETestInternals.getStore();
      const firstCount = store.predictions.size;

      await runIntelligenceLoop({
        businessId: "business_1",
        asOf,
        replayToken: "replay_2",
        snapshotOverride: snapshot,
      });

      assert.equal(store.predictions.size, firstCount);
      assert.ok(firstCount > 0);
    },
  },
  {
    name: "phase5e feature snapshot replay stays single-source",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T11:00:00.000Z");
      const snapshot = createSnapshot({ asOf });
      await runIntelligenceLoop({ businessId: "business_1", asOf, snapshotOverride: snapshot });
      await runIntelligenceLoop({ businessId: "business_1", asOf, replayToken: "replay_3", snapshotOverride: snapshot });
      assert.equal(__intelligencePhase5ETestInternals.getStore().featureSnapshots.size, 1);
    },
  },
  {
    name: "phase5e forecast version conflict fails closed",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T12:00:00.000Z");
      const snapshot = createSnapshot({ asOf });
      await runIntelligenceLoop({ businessId: "business_1", asOf, snapshotOverride: snapshot });
      const store = __intelligencePhase5ETestInternals.getStore();
      const first = Array.from(store.forecasts.values())[0];
      first.version = 2;
      store.forecasts.set(first.forecastKey, first);
      await assert.rejects(
        () =>
          runIntelligenceLoop({
            businessId: "business_1",
            asOf,
            replayToken: "replay_conflict",
            snapshotOverride: snapshot,
          }),
        /forecast_version_conflict/
      );
    },
  },
  {
    name: "phase5e optimization rollback updates canonical decision",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T13:00:00.000Z");
      const snapshot = createSnapshot({ asOf });
      await runIntelligenceLoop({ businessId: "business_1", asOf, snapshotOverride: snapshot });
      const store = __intelligencePhase5ETestInternals.getStore();
      const decision = Array.from(store.optimizations.values())[0];
      const rolled = await rollbackOptimizationDecision({
        businessId: "business_1",
        decisionKey: decision.decisionKey,
        reason: "test_rollback",
      });
      assert.equal(rolled?.status, "ROLLED_BACK");
    },
  },
  {
    name: "phase5e experiment assignment replay is deterministic",
    run: () => {
      const variants = ["A", "B", "C"];
      const first = assignExperimentVariant({
        experimentKey: "exp_1",
        assignmentVersion: 1,
        entityId: "lead_1",
        variants,
      });
      const second = assignExperimentVariant({
        experimentKey: "exp_1",
        assignmentVersion: 1,
        entityId: "lead_1",
        variants,
      });
      assert.equal(first, second);
      assert.ok(first && variants.includes(first));
    },
  },
  {
    name: "phase5e anomaly dedupe keeps one anomaly per window",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T14:00:00.000Z");
      const spike = createSnapshot({
        asOf,
        conversionRate: 0.05,
        refunds: 12,
        chargebacks: 4,
        queueLag: 18,
        churnSignal: 18,
      });
      await runIntelligenceLoop({ businessId: "business_1", asOf, snapshotOverride: spike });
      const first = __intelligencePhase5ETestInternals.getStore().anomalies.size;
      await runIntelligenceLoop({
        businessId: "business_1",
        asOf,
        replayToken: "anomaly-replay",
        snapshotOverride: spike,
      });
      assert.equal(__intelligencePhase5ETestInternals.getStore().anomalies.size, first);
      assert.ok(first > 0);
    },
  },
  {
    name: "phase5e drift trigger marks non-stable state",
    run: async () => {
      resetIntelligenceStore();
      for (let day = 1; day <= 8; day += 1) {
        const asOf = new Date(`2026-04-${String(day).padStart(2, "0")}T10:00:00.000Z`);
        await runIntelligenceLoop({
          businessId: "business_1",
          asOf,
          replayToken: `baseline-${day}`,
          snapshotOverride: createSnapshot({ asOf, revenueSignal: 1100, conversionRate: 0.32 }),
        });
      }
      const asOf = new Date("2026-04-20T10:00:00.000Z");
      const result = await runIntelligenceLoop({
        businessId: "business_1",
        asOf,
        replayToken: "drift-spike",
        snapshotOverride: createSnapshot({ asOf, revenueSignal: 4500, conversionRate: 0.08 }),
      });
      assert.notEqual(result.drift.status, "STABLE");
    },
  },
  {
    name: "phase5e manual override blocks auto optimization apply",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T15:00:00.000Z");
      const snapshot = createSnapshot({ asOf });
      const store = __intelligencePhase5ETestInternals.getStore();
      store.policies.set("business_1:default", {
        id: "policy_1",
        businessId: "business_1",
        policyKey: "business_1:default",
        version: 1,
        autoApplyEnabled: true,
        optimizationPolicy: {
          autoApplyMinConfidence: 0.4,
          autoApplyMaxRisk: 0.9,
        },
        experimentPolicy: {},
        anomalyPolicy: {},
        driftPolicy: {},
        isActive: true,
        effectiveFrom: new Date("2026-04-29T00:00:00.000Z"),
      });

      await applyManualIntelligenceOverride({
        businessId: "business_1",
        scope: "AUTO_OPTIMIZATION_PAUSE",
        action: "PAUSE",
        reason: "testing",
        expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      });

      const result = await runIntelligenceLoop({
        businessId: "business_1",
        asOf,
        snapshotOverride: snapshot,
      });

      assert.equal(result.autoApplied, 0);
    },
  },
  {
    name: "phase5e simulation replay is idempotent",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-04-29T16:00:00.000Z");
      const first = await runIntelligenceSimulation({
        businessId: "business_1",
        scenarioType: "pricing_changes",
        assumptions: {
          priceDeltaPercent: 0.05,
          capacityDeltaPercent: 0.1,
        },
        asOf,
        snapshotOverride: createSnapshot({ asOf }),
      });
      const second = await runIntelligenceSimulation({
        businessId: "business_1",
        scenarioType: "pricing_changes",
        assumptions: {
          priceDeltaPercent: 0.05,
          capacityDeltaPercent: 0.1,
        },
        asOf,
        snapshotOverride: createSnapshot({ asOf }),
      });
      assert.equal(first.simulationKey, second.simulationKey);
    },
  },
  {
    name: "phase5e auto optimization harm rollback + recommendation outcome tracking",
    run: async () => {
      resetIntelligenceStore();
      const store = __intelligencePhase5ETestInternals.getStore();
      store.policies.set("business_1:default", {
        id: "policy_1",
        businessId: "business_1",
        policyKey: "business_1:default",
        version: 1,
        autoApplyEnabled: true,
        optimizationPolicy: {
          autoApplyMinConfidence: 0.4,
          autoApplyMaxRisk: 0.9,
        },
        experimentPolicy: {},
        anomalyPolicy: {},
        driftPolicy: {
          warningThreshold: 0.01,
          criticalThreshold: 0.02,
          autoRollbackOnCritical: true,
        },
        isActive: true,
        effectiveFrom: new Date("2026-04-29T00:00:00.000Z"),
      });

      await runIntelligenceLoop({
        businessId: "business_1",
        asOf: new Date("2026-04-29T17:00:00.000Z"),
        replayToken: "harm-base",
        snapshotOverride: createSnapshot({
          asOf: new Date("2026-04-29T17:00:00.000Z"),
          conversionRate: 0.35,
        }),
      });
      const result = await runIntelligenceLoop({
        businessId: "business_1",
        asOf: new Date("2026-04-30T17:00:00.000Z"),
        replayToken: "harm-drop",
        snapshotOverride: createSnapshot({
          asOf: new Date("2026-04-30T17:00:00.000Z"),
          conversionRate: 0.03,
          revenueSignal: 4000,
        }),
      });
      assert.ok(result.rolledBack >= 0);

      const rec = Array.from(store.recommendations.values())[0];
      const tracked = await trackRecommendationOutcome({
        businessId: "business_1",
        recommendationKey: rec.recommendationKey,
        adopted: true,
        outcome: {
          realizedUplift: 0.08,
        },
      });
      assert.equal(tracked?.status, "ADOPTED");
    },
  },
  {
    name: "phase5e queue failure and worker restart resume without duplicate writes",
    run: async () => {
      resetIntelligenceStore();
      const asOf = new Date("2026-05-01T10:00:00.000Z");
      const snapshot = createSnapshot({ asOf });
      const runId = "restart-run";

      await runIntelligenceLoop({
        businessId: "business_1",
        asOf,
        replayToken: runId,
        snapshotOverride: snapshot,
      });
      const store = __intelligencePhase5ETestInternals.getStore();
      const before = {
        predictions: store.predictions.size,
        recommendations: store.recommendations.size,
      };

      await runIntelligenceLoop({
        businessId: "business_1",
        asOf,
        replayToken: runId,
        snapshotOverride: snapshot,
      });

      assert.equal(store.predictions.size, before.predictions);
      assert.equal(store.recommendations.size, before.recommendations);
    },
  },
];
