import assert from "node:assert/strict";
import {
  __reliabilityPhase6ATestInternals,
  applyReliabilityOverride,
  bootstrapReliabilityOS,
  raiseReliabilityAlert,
  recordCapacityLedger,
  recordCostLedger,
  recordDeadLetterLedger,
  recordMetricSnapshot,
  replayDeadLetter,
  rollbackIncidentMitigation,
  runReliabilityChaosScenario,
  runReliabilitySelfAudit,
} from "../services/reliability/reliabilityOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const reset = async () => {
  __reliabilityPhase6ATestInternals.resetStore();
  await bootstrapReliabilityOS();
};

const getStore = () => __reliabilityPhase6ATestInternals.getStore();

const snapshotCanonicalReliabilityKeys = () => {
  const store = getStore();
  return {
    policyKeys: Array.from(store.policies.keys()).sort(),
    runbookKeys: Array.from(store.runbooks.keys()).sort(),
  };
};

const assertReliabilityBootstrapFootprint = () => {
  const store = getStore();
  assert.equal(store.policies.size, 1);
  assert.equal(store.runbooks.size, 2);
};

export const reliabilityPhase6ATests: TestCase[] = [
  {
    name: "phase6a bootstrap double replay remains idempotent for reliability canonical rows",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      await bootstrapReliabilityOS();
      await bootstrapReliabilityOS();
      assertReliabilityBootstrapFootprint();
    },
  },
  {
    name: "phase6a bootstrap triple replay remains idempotent for reliability canonical rows",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      await bootstrapReliabilityOS();
      await bootstrapReliabilityOS();
      await bootstrapReliabilityOS();
      assertReliabilityBootstrapFootprint();
    },
  },
  {
    name: "phase6a bootstrap parallel race collapses to one reliability seed path",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      await Promise.all(
        Array.from({
          length: 10,
        }).map(() => bootstrapReliabilityOS())
      );
      assertReliabilityBootstrapFootprint();
    },
  },
  {
    name: "phase6a cold start replay keeps reliability canonical keys deterministic",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      await bootstrapReliabilityOS();
      const firstSnapshot = snapshotCanonicalReliabilityKeys();

      __reliabilityPhase6ATestInternals.resetStore();
      await bootstrapReliabilityOS();
      const secondSnapshot = snapshotCanonicalReliabilityKeys();

      assert.deepEqual(secondSnapshot, firstSnapshot);
      assertReliabilityBootstrapFootprint();
    },
  },
  {
    name: "phase6a trace replay remains lineage deterministic",
    run: async () => {
      await reset();
      const result = await runReliabilityChaosScenario({
        businessId: "business_1",
        scenario: "trace_replay",
      });
      const trace = getStore().traces.get(result.traceId);
      assert.ok(trace);
      assert.ok(Array.isArray(trace.lifecycle));
      assert.ok(trace.lifecycle.length >= 3);
      assert.equal(trace.status, "COMPLETED");
    },
  },
  {
    name: "phase6a incident dedupe keeps single open incident",
    run: async () => {
      await reset();
      await raiseReliabilityAlert({
        businessId: "business_1",
        subsystem: "QUEUES",
        severity: "P1",
        title: "Queue lag critical",
        message: "Queue lag crossed threshold",
        dedupeKey: "queues:lag:critical",
        rootCauseKey: "queue_lag",
      });
      await raiseReliabilityAlert({
        businessId: "business_1",
        subsystem: "QUEUES",
        severity: "P1",
        title: "Queue lag critical",
        message: "Queue lag crossed threshold",
        dedupeKey: "queues:lag:critical",
        rootCauseKey: "queue_lag",
      });
      assert.equal(getStore().incidents.size, 1);
    },
  },
  {
    name: "phase6a alert suppression prevents alert storms",
    run: async () => {
      await reset();
      const first = await raiseReliabilityAlert({
        businessId: "business_1",
        subsystem: "RECEPTION",
        severity: "P2",
        title: "Reception warning",
        message: "Transient issue",
        dedupeKey: "reception:warning",
        rootCauseKey: "queue_lag",
      });
      const second = await raiseReliabilityAlert({
        businessId: "business_1",
        subsystem: "RECEPTION",
        severity: "P2",
        title: "Reception warning",
        message: "Transient issue",
        dedupeKey: "reception:warning",
        rootCauseKey: "queue_lag",
      });
      assert.equal(first.alert.state, "OPEN");
      assert.equal(second.alert.state, "SUPPRESSED");
      assert.ok(Number(second.alert.fireCount) >= 2);
    },
  },
  {
    name: "phase6a auto mitigation rollback remains deterministic",
    run: async () => {
      await reset();
      const raised = await raiseReliabilityAlert({
        businessId: "business_1",
        subsystem: "QUEUES",
        severity: "P1",
        title: "Queue lag critical",
        message: "Queue lag crossed threshold",
        dedupeKey: "queues:lag:rollback",
        rootCauseKey: "queue_lag",
      });
      assert.equal(raised.mitigation.action, "THROTTLE");
      const rolled = await rollbackIncidentMitigation({
        incidentKey: raised.incident.incidentKey,
        reason: "test_recovery",
      });
      assert.equal(rolled.incident.status, "RESOLVED");
      assert.equal(rolled.incident.mitigationStatus, "ROLLED_BACK");
    },
  },
  {
    name: "phase6a dead-letter replay tracks replay reason and caps",
    run: async () => {
      await reset();
      const dlq = await recordDeadLetterLedger({
        businessId: "business_1",
        sourceQueue: "inbound-routing",
        sourceSubsystem: "RECEPTION",
        failureReason: "timeout",
        attemptsMade: 1,
        replayCap: 3,
        payload: {
          id: "job_1",
        },
      });
      const replayed = await replayDeadLetter({
        deadLetterKey: dlq.deadLetterKey,
        reason: "manual_retry",
      });
      assert.equal(replayed.status, "REPLAYED");
      assert.equal(replayed.lastReplayReason, "manual_retry");
    },
  },
  {
    name: "phase6a poison message quarantine fails closed",
    run: async () => {
      await reset();
      const poisoned = await recordDeadLetterLedger({
        businessId: "business_1",
        sourceQueue: "inbound-routing",
        sourceSubsystem: "RECEPTION",
        failureReason: "invalid_schema_payload",
        attemptsMade: 4,
        replayCap: 3,
      });
      assert.equal(poisoned.status, "QUARANTINED");
      assert.equal(poisoned.quarantineReason, "poison_message_detected");
    },
  },
  {
    name: "phase6a queue lag mitigation auto-throttles",
    run: async () => {
      await reset();
      await recordMetricSnapshot({
        businessId: "business_1",
        subsystem: "QUEUES",
        queueLag: 450,
        workerUtilization: 0.92,
        dlqRate: 0.03,
        retryRate: 0.2,
        lockContention: 0.02,
        providerErrorRate: 0.02,
      });
      const incident = Array.from(getStore().incidents.values())[0];
      assert.ok(incident);
      assert.equal(incident.mitigationAction, "THROTTLE");
    },
  },
  {
    name: "phase6a provider outage mitigation triggers failover",
    run: async () => {
      await reset();
      await recordMetricSnapshot({
        businessId: "business_1",
        subsystem: "PROVIDERS",
        queueLag: 20,
        workerUtilization: 0.6,
        dlqRate: 0.27,
        retryRate: 0.3,
        lockContention: 0.01,
        providerErrorRate: 0.94,
      });
      const incident = Array.from(getStore().incidents.values())[0];
      assert.ok(incident);
      assert.equal(incident.mitigationAction, "PROVIDER_FAILOVER");
    },
  },
  {
    name: "phase6a lock storm handling drains contention path",
    run: async () => {
      await reset();
      await recordMetricSnapshot({
        businessId: "business_1",
        subsystem: "LOCKS",
        queueLag: 70,
        workerUtilization: 0.4,
        dlqRate: 0.13,
        retryRate: 0.22,
        lockContention: 0.99,
        providerErrorRate: 0.01,
      });
      const incident = Array.from(getStore().incidents.values())[0];
      assert.ok(incident);
      assert.equal(incident.mitigationAction, "QUEUE_DRAIN");
    },
  },
  {
    name: "phase6a cost spike alert is generated",
    run: async () => {
      await reset();
      await recordCostLedger({
        businessId: "business_1",
        scopeType: "TENANT",
        scopeId: "business_1",
        provider: "OPENAI",
        workflow: "AI",
        amountMinor: 5000,
      });
      await recordCostLedger({
        businessId: "business_1",
        scopeType: "TENANT",
        scopeId: "business_1",
        provider: "OPENAI",
        workflow: "AI",
        amountMinor: 40000,
      });
      const alert = Array.from(getStore().alerts.values()).find(
        (row) => row.subsystem === "COST_ENGINE"
      );
      assert.ok(alert);
      assert.equal(alert.severity, "P2");
    },
  },
  {
    name: "phase6a capacity breach forecast becomes actionable",
    run: async () => {
      await reset();
      await recordCapacityLedger({
        businessId: "business_1",
        subsystem: "BOOKING",
        scopeType: "TENANT",
        scopeId: "business_1",
        currentLoad: 120,
        capacityLimit: 100,
        forecastDemand: 160,
      });
      const incident = Array.from(getStore().incidents.values()).find(
        (row) => row.subsystem === "BOOKING"
      );
      assert.ok(incident);
      assert.equal(incident.rootCauseKey, "capacity_breach");
    },
  },
  {
    name: "phase6a override precedence can disable auto mitigation",
    run: async () => {
      await reset();
      await applyReliabilityOverride({
        businessId: "business_1",
        scope: "AUTO_MITIGATION",
        targetType: "SUBSYSTEM",
        targetId: "QUEUES",
        action: "NONE",
        reason: "maintenance_window",
        priority: 999,
      });
      const raised = await raiseReliabilityAlert({
        businessId: "business_1",
        subsystem: "QUEUES",
        severity: "P1",
        title: "Queue lag critical",
        message: "Queue lag crossed threshold",
        dedupeKey: "queues:lag:override",
        rootCauseKey: "queue_lag",
      });
      assert.equal(raised.mitigation.action, "NONE");
    },
  },
  {
    name: "phase6a chaos recovery keeps full incident trail auditable",
    run: async () => {
      await reset();
      const chaos = await runReliabilityChaosScenario({
        businessId: "business_1",
        scenario: "provider_outage",
      });
      assert.equal(chaos.recovered, true);
      const audit = await runReliabilitySelfAudit({
        businessId: "business_1",
      });
      assert.equal(audit.deeplyWired, true);
      assert.ok(audit.counters.observabilityEvents > 0);
      assert.ok(audit.counters.traces > 0);
    },
  },
];
