// @ts-nocheck
import assert from "node:assert/strict";
import {
  __developerPlatformPhase6ETestInternals,
  applyExtensionOverride,
  applyExtensionPolicy,
  bootstrapDeveloperPlatformExtensibilityOS,
  createDeveloperPortalApiKey,
  installExtensionForTenant,
  invokeExtensionAction,
  publishExtensionPackage,
  publishExtensionRelease,
  registerDeveloperNamespace,
  revokeDeveloperPortalApiKey,
  runDeveloperPlatformSelfAudit,
  setExtensionSecretBinding,
  subscribeExtensionEvent,
} from "../services/developerPlatformExtensibilityOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const BUSINESS_ID = "phase6e_business_1";
const TENANT_ID = "phase6e_tenant_1";

const reset = async () => {
  __developerPlatformPhase6ETestInternals.resetStore();
  await bootstrapDeveloperPlatformExtensibilityOS();
};

const seedPackage = async () => {
  const pkg = await publishExtensionPackage({
    businessId: BUSINESS_ID,
    tenantId: TENANT_ID,
    namespace: "automexia.partner",
    slug: "lead-router-pro",
    displayName: "Lead Router Pro",
    packageType: "WORKFLOW",
    replayToken: "phase6e_seed_package",
  });
  const release = await publishExtensionRelease({
    businessId: BUSINESS_ID,
    tenantId: TENANT_ID,
    packageKey: pkg.package.packageKey,
    versionTag: "v1.0.0",
    replayToken: "phase6e_seed_release",
    manifest: {
      actions: ["route_lead"],
      events: ["lead.created"],
      permissions: ["lead:write"],
    },
  });
  return {
    package: pkg.package,
    release: release.release,
  };
};

export const developerPlatformPhase6ETests: TestCase[] = [
  {
    name: "phase6e namespace + package publish replay is deterministic",
    run: async () => {
      await reset();
      const namespace = await registerDeveloperNamespace({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        namespace: "partner.acme",
        displayName: "Partner ACME",
      });
      const first = await publishExtensionPackage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        namespace: "partner.acme",
        slug: "workflow-kit",
        replayToken: "phase6e_pkg_replay_token",
      });
      const second = await publishExtensionPackage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        namespace: "partner.acme",
        slug: "workflow-kit",
        replayToken: "phase6e_pkg_replay_token",
      });
      assert.equal(namespace.status, "ACTIVE");
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.package.packageKey, second.package.packageKey);
    },
  },
  {
    name: "phase6e release publishing is versioned and replay-safe",
    run: async () => {
      await reset();
      const seeded = await seedPackage();
      const replayed = await publishExtensionRelease({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        packageKey: seeded.package.packageKey,
        versionTag: "v1.0.0",
        replayToken: "phase6e_seed_release",
      });
      const next = await publishExtensionRelease({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        packageKey: seeded.package.packageKey,
        versionTag: "v1.1.0",
      });
      assert.equal(replayed.replayed, true);
      assert.equal(next.release.versionInt, seeded.release.versionInt + 1);
    },
  },
  {
    name: "phase6e install + secret binding stays canonical and encrypted",
    run: async () => {
      await reset();
      const seeded = await seedPackage();
      const install = await installExtensionForTenant({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        packageKey: seeded.package.packageKey,
        releaseKey: seeded.release.releaseKey,
        replayToken: "phase6e_install_seed",
      });
      const secret = await setExtensionSecretBinding({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        secretName: "OPENAI_API_KEY",
        secretValue: "sk-test-123",
        replayToken: "phase6e_secret_seed",
      });
      assert.equal(install.replayed, false);
      assert.equal(secret.replayed, false);
      assert.ok(
        String(secret.binding.secretRef || "").startsWith("kms::") ||
          String(secret.binding.secretRef || "").startsWith("enc::")
      );
    },
  },
  {
    name: "phase6e execution replay + dedupe keeps single canonical execution",
    run: async () => {
      await reset();
      const seeded = await seedPackage();
      const install = await installExtensionForTenant({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        packageKey: seeded.package.packageKey,
      });
      await subscribeExtensionEvent({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        eventType: "lead.created",
        handler: "routeLead",
      });
      const first = await invokeExtensionAction({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        action: "route_lead",
        replayToken: "phase6e_exec_replay_token",
        payload: {
          leadId: "lead_1",
        },
      });
      const second = await invokeExtensionAction({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        action: "route_lead",
        replayToken: "phase6e_exec_replay_token",
        payload: {
          leadId: "lead_1",
        },
      });
      const dedupe = await invokeExtensionAction({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        action: "route_lead",
        dedupeKey: "route_lead:lead_1",
        payload: {
          leadId: "lead_1",
        },
      });
      const dedupeSecond = await invokeExtensionAction({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        action: "route_lead",
        dedupeKey: "route_lead:lead_1",
        payload: {
          leadId: "lead_1",
        },
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.execution.executionKey, second.execution.executionKey);
      assert.equal(dedupe.replayed, false);
      assert.equal(dedupeSecond.replayed, true);
      assert.equal(dedupe.execution.executionKey, dedupeSecond.execution.executionKey);
    },
  },
  {
    name: "phase6e policy and override can block execution without hidden path",
    run: async () => {
      await reset();
      const seeded = await seedPackage();
      const install = await installExtensionForTenant({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        packageKey: seeded.package.packageKey,
      });
      await applyExtensionPolicy({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        maxExecutionsPerMinute: 120,
        allowedTriggers: ["MANUAL"],
      });
      const blockedByPolicy = await invokeExtensionAction({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        action: "route_lead",
        trigger: "WEBHOOK",
      });
      await applyExtensionOverride({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scope: "EXECUTION",
        targetType: "INSTALL",
        targetKey: install.install.installKey,
        action: "BLOCK",
        reason: "maintenance_window",
      });
      const blockedByOverride = await invokeExtensionAction({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        action: "route_lead",
        trigger: "MANUAL",
      });
      assert.equal(blockedByPolicy.execution.status, "BLOCKED");
      assert.equal(blockedByOverride.execution.status, "BLOCKED");
    },
  },
  {
    name: "phase6e developer API key lifecycle is versioned and auditable",
    run: async () => {
      await reset();
      const first = await createDeveloperPortalApiKey({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scope: "DEVELOPER_API",
        replayToken: "phase6e_api_key_replay",
      });
      const replayed = await createDeveloperPortalApiKey({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scope: "DEVELOPER_API",
        replayToken: "phase6e_api_key_replay",
      });
      const revoked = await revokeDeveloperPortalApiKey({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        apiKeyRef: first.apiKey.apiKeyRef,
        reason: "rotation",
      });
      assert.equal(first.replayed, false);
      assert.ok(String(first.plainKey || "").startsWith("dp_"));
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.plainKey, null);
      assert.equal(revoked.status, "REVOKED");
    },
  },
  {
    name: "phase6e self audit confirms deeply wired developer platform",
    run: async () => {
      await reset();
      const seeded = await seedPackage();
      const install = await installExtensionForTenant({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        packageKey: seeded.package.packageKey,
      });
      await setExtensionSecretBinding({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        installKey: install.install.installKey,
        secretName: "CRM_TOKEN",
        secretValue: "test-value",
      });
      __developerPlatformPhase6ETestInternals.setFailpoint(
        "extension_execution_failure",
        true
      );
      try {
        await invokeExtensionAction({
          businessId: BUSINESS_ID,
          tenantId: TENANT_ID,
          installKey: install.install.installKey,
          action: "route_lead",
          trigger: "MANUAL",
        });
      } finally {
        __developerPlatformPhase6ETestInternals.setFailpoint(
          "extension_execution_failure",
          false
        );
      }
      const audit = await runDeveloperPlatformSelfAudit({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
      });
      assert.equal(audit.deeplyWired, true);
      assert.equal(audit.checks.noHiddenAppExecutionPath, true);
      assert.equal(audit.checks.noParallelApiTruth, true);
      assert.equal(audit.checks.replaySafe, true);
      assert.equal(audit.checks.overrideSafe, true);
      assert.equal(audit.checks.secretSafe, true);
    },
  },
];

