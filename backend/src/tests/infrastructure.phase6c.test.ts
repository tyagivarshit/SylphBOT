import assert from "node:assert/strict";
import {
  INFRASTRUCTURE_PHASE_VERSION,
  __infrastructurePhase6CTestInternals,
  applyInfrastructureOverride,
  bootstrapInfrastructureResilienceOS,
  executeInfrastructureRecoveryPlan,
  getInfrastructureControlPlaneProjection,
  recordInfrastructureSignal,
  resolveInfrastructureOverride,
  runInfrastructureResilienceChaosScenario,
  runInfrastructureResilienceSelfAudit,
} from "../services/reliability/infrastructureResilienceOS.service";
import {
  __reliabilityPhase6ATestInternals,
  bootstrapReliabilityOS,
} from "../services/reliability/reliabilityOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const reset = async () => {
  __reliabilityPhase6ATestInternals.resetStore();
  __infrastructurePhase6CTestInternals.resetStore();
  await bootstrapReliabilityOS();
  await bootstrapInfrastructureResilienceOS();
};

const getInfraStore = () => __infrastructurePhase6CTestInternals.getStore();
const getReliabilityStore = () => __reliabilityPhase6ATestInternals.getStore();

const getCanonicalInfraExpectations = () => {
  const catalog = __infrastructurePhase6CTestInternals.canonicalCatalog();
  const engineCount = catalog.reduce(
    (total, definition) => total + definition.engines.length,
    0
  );
  return {
    subsystemCount: catalog.length,
    engineCount,
    auditCount: catalog.length + 1,
  };
};

const snapshotCanonicalInfrastructureKeys = () => {
  const store = getInfraStore();
  return {
    policyKeys: Array.from(store.policyLedger.keys()).sort(),
    subsystemKeys: Array.from(store.subsystemLedger.keys()).sort(),
    engineKeys: Array.from(store.engineLedger.keys()).sort(),
    auditKeys: Array.from(store.auditLedger.keys()).sort(),
  };
};

const assertInfrastructureBootstrapFootprint = () => {
  const store = getInfraStore();
  const expected = getCanonicalInfraExpectations();
  assert.equal(store.subsystemLedger.size, expected.subsystemCount);
  assert.equal(store.engineLedger.size, expected.engineCount);
  assert.equal(store.auditLedger.size, expected.auditCount);
  assert.equal(store.policyLedger.size, 1);
  assert.equal(
    store.authorities.get("InfrastructureSubsystemLedger") || 0,
    expected.subsystemCount
  );
  assert.equal(
    store.authorities.get("InfrastructureEngineLedger") || 0,
    expected.engineCount
  );
  assert.equal(
    store.authorities.get("InfrastructureAuditLedger") || 0,
    expected.auditCount
  );
  assert.equal(store.authorities.get("InfrastructurePolicyLedger") || 0, 1);
};

export const infrastructurePhase6CTests: TestCase[] = [
  {
    name: "phase6c bootstrap double replay remains idempotent for canonical infra ledgers",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      __infrastructurePhase6CTestInternals.resetStore();
      await bootstrapReliabilityOS();
      const first = await bootstrapInfrastructureResilienceOS();
      const second = await bootstrapInfrastructureResilienceOS();
      assert.equal(
        first.bootstrappedAt.toISOString(),
        second.bootstrappedAt.toISOString()
      );
      assertInfrastructureBootstrapFootprint();
    },
  },
  {
    name: "phase6c bootstrap triple replay remains idempotent for canonical infra ledgers",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      __infrastructurePhase6CTestInternals.resetStore();
      await bootstrapReliabilityOS();
      await bootstrapInfrastructureResilienceOS();
      await bootstrapInfrastructureResilienceOS();
      await bootstrapInfrastructureResilienceOS();
      assertInfrastructureBootstrapFootprint();
    },
  },
  {
    name: "phase6c bootstrap parallel race collapses to a single infra authority path",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      __infrastructurePhase6CTestInternals.resetStore();
      await bootstrapReliabilityOS();
      await Promise.all(
        Array.from({
          length: 10,
        }).map(() => bootstrapInfrastructureResilienceOS())
      );
      assertInfrastructureBootstrapFootprint();
    },
  },
  {
    name: "phase6c cold start replay keeps canonical infra ledger keys deterministic",
    run: async () => {
      __reliabilityPhase6ATestInternals.resetStore();
      __infrastructurePhase6CTestInternals.resetStore();
      await bootstrapReliabilityOS();
      await bootstrapInfrastructureResilienceOS();
      const firstSnapshot = snapshotCanonicalInfrastructureKeys();

      __reliabilityPhase6ATestInternals.resetStore();
      __infrastructurePhase6CTestInternals.resetStore();
      await bootstrapReliabilityOS();
      await bootstrapInfrastructureResilienceOS();
      const secondSnapshot = snapshotCanonicalInfrastructureKeys();

      assert.deepEqual(secondSnapshot, firstSnapshot);
      assertInfrastructureBootstrapFootprint();
    },
  },
  {
    name: "phase6c bootstrap seeds canonical authorities and engines",
    run: async () => {
      await reset();
      const store = getInfraStore();
      assert.ok(store.bootstrappedAt);
      const subsystemAuthorities = new Set(
        Array.from(store.subsystemLedger.values()).map((row) => row.authority)
      );
      assert.equal(subsystemAuthorities.has("CONTROL_PLANE"), true);
      assert.equal(subsystemAuthorities.has("QUEUE_FABRIC"), true);
      assert.equal(subsystemAuthorities.has("RECOVERY_FABRIC"), true);
      assert.ok(store.engineLedger.size >= 20);
    },
  },
  {
    name: "phase6c final lineage removes 6c.1 policy and bootstrap artifacts",
    run: async () => {
      await reset();
      const store = getInfraStore();
      const activePolicy = Array.from(store.policyLedger.values()).find(
        (row) => row.isActive
      );
      assert.ok(activePolicy);
      assert.equal(String(activePolicy?.policyKey || "").includes("6c.1"), false);
      assert.equal(
        String(activePolicy?.policyKey || "").includes("phase6c.final"),
        true
      );
      const bootstrapEntry = Array.from(store.auditLedger.values()).find(
        (row) => row.action === "BOOTSTRAP_COMPLETED"
      );
      assert.equal(bootstrapEntry?.resourceKey, "phase6c.final");
      assert.equal(INFRASTRUCTURE_PHASE_VERSION.includes("6c.1"), false);
    },
  },
  {
    name: "phase6c signal replay remains deterministic for identical signal id",
    run: async () => {
      await reset();
      const first = await recordInfrastructureSignal({
        businessId: "business_1",
        authority: "QUEUE_FABRIC",
        subsystem: "RECEPTION_QUEUE",
        engine: "DEDUPE_GATE",
        signalId: "sig_fixed_1",
        latencyMs: 2100,
        errorRate: 0.22,
        saturation: 0.95,
        backlog: 320,
        consecutiveFailures: 4,
      });
      const second = await recordInfrastructureSignal({
        businessId: "business_1",
        authority: "QUEUE_FABRIC",
        subsystem: "RECEPTION_QUEUE",
        engine: "DEDUPE_GATE",
        signalId: "sig_fixed_1",
        latencyMs: 2100,
        errorRate: 0.22,
        saturation: 0.95,
        backlog: 320,
        consecutiveFailures: 4,
      });
      assert.equal(first.signalKey, second.signalKey);
      assert.equal(getInfraStore().signalLedger.size, 1);
    },
  },
  {
    name: "phase6c signal ingestion fails closed on non-canonical engines",
    run: async () => {
      await reset();
      await assert.rejects(
        recordInfrastructureSignal({
          businessId: "business_1",
          authority: "QUEUE_FABRIC",
          subsystem: "RECEPTION_QUEUE",
          engine: "UNKNOWN_ENGINE",
          signalId: "sig_invalid_engine",
        }),
        /Unsupported infrastructure engine/i
      );
      assert.equal(getInfraStore().signalLedger.size, 0);
    },
  },
  {
    name: "phase6c critical signal routes reliability alert and auto recovery",
    run: async () => {
      await reset();
      await recordInfrastructureSignal({
        businessId: "business_1",
        authority: "PROVIDER_FABRIC",
        subsystem: "EXTERNAL_PROVIDERS",
        engine: "FAILOVER_ROUTER",
        signalId: "sig_provider_critical",
        latencyMs: 2600,
        errorRate: 0.41,
        saturation: 0.97,
        backlog: 500,
        consecutiveFailures: 7,
      });
      const infraStore = getInfraStore();
      const reliabilityStore = getReliabilityStore();
      assert.ok(infraStore.recoveryLedger.size >= 1);
      const infraAlert = Array.from(reliabilityStore.alerts.values()).find((row) =>
        String(row.dedupeKey || "").includes("infra:provider_fabric")
      );
      assert.ok(infraAlert);
    },
  },
  {
    name: "phase6c override precedence picks highest priority active override",
    run: async () => {
      await reset();
      await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
        action: "THROTTLE",
        reason: "low_priority_override",
        priority: 100,
      });
      const high = await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
        action: "DENY_RECOVERY",
        reason: "high_priority_override",
        priority: 600,
      });
      const resolved = await resolveInfrastructureOverride({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
      });
      assert.equal(resolved?.overrideKey, high.overrideKey);
      assert.equal(resolved?.action, "DENY_RECOVERY");
    },
  },
  {
    name: "phase6c expired override is ignored by resolution",
    run: async () => {
      await reset();
      await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "DATA_FABRIC",
        subsystem: "DATABASE_LAYER",
        action: "DENY_RECOVERY",
        reason: "expired_override",
        priority: 900,
        expiresAt: new Date(Date.now() - 60_000),
      });
      const active = await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "DATA_FABRIC",
        subsystem: "DATABASE_LAYER",
        action: "THROTTLE",
        reason: "active_override",
        priority: 200,
      });
      const resolved = await resolveInfrastructureOverride({
        businessId: "business_1",
        authority: "DATA_FABRIC",
        subsystem: "DATABASE_LAYER",
      });
      assert.equal(resolved?.overrideKey, active.overrideKey);
      assert.equal(resolved?.action, "THROTTLE");
    },
  },
  {
    name: "phase6c tenant override does not bleed into unscoped resolution",
    run: async () => {
      await reset();
      await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
        action: "DENY_RECOVERY",
        reason: "tenant_scoped_override",
        priority: 500,
      });
      const unscoped = await resolveInfrastructureOverride({
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
      });
      assert.equal(unscoped, null);
      const scoped = await resolveInfrastructureOverride({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
      });
      assert.equal(scoped?.action, "DENY_RECOVERY");
    },
  },
  {
    name: "phase6c recovery replay token returns replayed state without duplicate execution",
    run: async () => {
      await reset();
      const first = await executeInfrastructureRecoveryPlan({
        businessId: "business_1",
        authority: "QUEUE_FABRIC",
        subsystem: "RECEPTION_QUEUE",
        trigger: "MANUAL_TEST",
        replayToken: "infra_replay_token_1",
        requestedActions: ["THROTTLE", "QUEUE_DRAIN"],
      });
      const second = await executeInfrastructureRecoveryPlan({
        businessId: "business_1",
        authority: "QUEUE_FABRIC",
        subsystem: "RECEPTION_QUEUE",
        trigger: "MANUAL_TEST",
        replayToken: "infra_replay_token_1",
        requestedActions: ["THROTTLE", "QUEUE_DRAIN"],
      });
      assert.equal(first.recoveryKey, second.recoveryKey);
      assert.equal(second.status, "REPLAYED");
      assert.equal(getInfraStore().recoveryLedger.size, 1);
    },
  },
  {
    name: "phase6c recovery rejects unsupported action plans",
    run: async () => {
      await reset();
      await assert.rejects(
        executeInfrastructureRecoveryPlan({
          businessId: "business_1",
          authority: "QUEUE_FABRIC",
          subsystem: "RECEPTION_QUEUE",
          trigger: "MANUAL_TEST",
          replayToken: "unsupported_action_recovery",
          requestedActions: ["DROP_TABLES"],
        }),
        /Unsupported recovery actions/i
      );
      assert.equal(getInfraStore().recoveryLedger.size, 0);
    },
  },
  {
    name: "phase6c deny recovery override blocks execution deterministically",
    run: async () => {
      await reset();
      await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
        action: "DENY_RECOVERY",
        reason: "maintenance_lock",
        priority: 999,
      });
      const recovery = await executeInfrastructureRecoveryPlan({
        businessId: "business_1",
        authority: "RECOVERY_FABRIC",
        subsystem: "RUNBOOK_ORCHESTRATOR",
        trigger: "MAINTENANCE_TEST",
        replayToken: "blocked_recovery_token",
        requestedActions: ["THROTTLE"],
      });
      assert.equal(recovery.status, "BLOCKED");
      assert.ok(recovery.metadata?.blockedByOverrideKey);
    },
  },
  {
    name: "phase6c chaos replay storm validates replay-safe containment",
    run: async () => {
      await reset();
      const chaos = await runInfrastructureResilienceChaosScenario({
        businessId: "business_1",
        scenario: "replay_storm",
      });
      assert.equal(chaos.recovered, true);
      assert.equal(chaos.secondStatus, "REPLAYED");
    },
  },
  {
    name: "phase6c control plane projection reports all authorities and counts",
    run: async () => {
      await reset();
      await recordInfrastructureSignal({
        businessId: "business_1",
        authority: "SCHEDULER_FABRIC",
        subsystem: "CRON_CONTROL",
        engine: "LEADER_LOCK",
        signalId: "sched_signal_1",
        latencyMs: 450,
        errorRate: 0.01,
        saturation: 0.52,
        backlog: 4,
        consecutiveFailures: 0,
      });
      const projection = await getInfrastructureControlPlaneProjection({
        businessId: "business_1",
      });
      assert.equal(projection.byAuthority.length, 8);
      assert.ok(projection.counts.subsystems >= 11);
      assert.ok(projection.counts.engines >= 30);
    },
  },
  {
    name: "phase6c scoped projection excludes cross-tenant override and signal state",
    run: async () => {
      await reset();
      await recordInfrastructureSignal({
        businessId: "business_1",
        authority: "QUEUE_FABRIC",
        subsystem: "RECEPTION_QUEUE",
        engine: "DEDUPE_GATE",
        signalId: "scope_signal_1",
        latencyMs: 300,
        errorRate: 0.01,
        saturation: 0.2,
      });
      await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "QUEUE_FABRIC",
        subsystem: "RECEPTION_QUEUE",
        action: "THROTTLE",
        reason: "scope_override",
      });
      const projection = await getInfrastructureControlPlaneProjection({
        businessId: "business_2",
      });
      assert.equal(projection.counts.signals, 0);
      assert.equal(projection.counts.overrides, 0);
    },
  },
  {
    name: "phase6c self audit confirms deep wiring and no hidden state",
    run: async () => {
      await reset();
      await applyInfrastructureOverride({
        businessId: "business_1",
        authority: "PROVIDER_FABRIC",
        subsystem: "EXTERNAL_PROVIDERS",
        action: "THROTTLE",
        reason: "audit_probe",
      });
      await executeInfrastructureRecoveryPlan({
        businessId: "business_1",
        authority: "PROVIDER_FABRIC",
        subsystem: "EXTERNAL_PROVIDERS",
        trigger: "AUDIT_PROBE",
        replayToken: "audit_probe_recovery",
        requestedActions: ["FAILOVER", "THROTTLE"],
      });
      const audit = await runInfrastructureResilienceSelfAudit({
        businessId: "business_1",
      });
      assert.equal(audit.deeplyWired, true);
      assert.equal(audit.checks.orphanFree, true);
      assert.equal(audit.checks.noHiddenState, true);
      assert.equal(audit.checks.overrideSafe, true);
      assert.equal(audit.checks.deterministicReplay, true);
      assert.equal(audit.checks.legacyFree, true);
      assert.equal(audit.checks.securityWired, true);
    },
  },
];
