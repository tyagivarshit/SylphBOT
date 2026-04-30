// @ts-nocheck
import assert from "node:assert/strict";
import {
  __saasPackagingPhase6DTestInternals,
  bootstrapSaaSPackagingConnectHubOS,
  connectInstagramOneClick,
  connectWhatsAppGuidedWizard,
  expireIntegrationToken,
  getConnectHubProjection,
  markProviderWebhookFailure,
  meterFeatureEntitlementUsage,
  processPlanUpgrade,
  provisionTenantSaaSPackaging,
  recoverProviderWebhook,
  retryConnectionDiagnostic,
  runSaaSPackagingConnectHubSelfAudit,
  runSaaSPackagingFailureInjection,
  runWhatsAppConnectDoctor,
  saveSetupWizardProgress,
} from "../services/saasPackagingConnectHubOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const BUSINESS_ID = "phase6d_business_1";
const TENANT_ID = "phase6d_business_1";

const reset = async () => {
  __saasPackagingPhase6DTestInternals.resetStore();
  await bootstrapSaaSPackagingConnectHubOS();
};

const seedTenant = async (replayToken = "phase6d_provision_seed") =>
  provisionTenantSaaSPackaging({
    businessId: BUSINESS_ID,
    tenantId: TENANT_ID,
    plan: "STARTER",
    replayToken,
  });

export const saasPackagingPhase6DTests: TestCase[] = [
  {
    name: "phase6d instagram connect replay is deterministic and dedupe-safe",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_connect_replay_token",
      });
      const second = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_connect_replay_token",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.attempt?.attemptKey, second.attempt?.attemptKey);
    },
  },
  {
    name: "phase6d instagram reconnect refreshes canonical connection without duplication",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_reconnect_seed",
      });
      const reconnect = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        reconnect: true,
        replayToken: "ig_reconnect_final",
      });
      assert.equal(first.integration?.integrationKey, reconnect.integration?.integrationKey);
      assert.equal(reconnect.integration?.status, "CONNECTED");
    },
  },
  {
    name: "phase6d instagram token expiry is diagnosed with authoritative status",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_expiry_seed",
      });
      const expired = await expireIntegrationToken({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
      });
      assert.equal(expired.integration.status, "TOKEN_EXPIRED");
      assert.equal(expired.health?.status, "TOKEN_EXPIRED");
    },
  },
  {
    name: "phase6d instagram webhook failure recovers to connected canonical truth",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_webhook_seed",
      });
      const failed = await markProviderWebhookFailure({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
      });
      assert.equal(failed.integration.status, "WEBHOOK_FAILED");
      const recovered = await recoverProviderWebhook({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
        replayToken: "ig_webhook_recovery",
      });
      assert.equal(recovered?.status, "CONNECTED");
    },
  },
  {
    name: "phase6d whatsapp connect replay is deterministic",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_replay_token",
      });
      const second = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_replay_token",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.attempt?.attemptKey, second.attempt?.attemptKey);
    },
  },
  {
    name: "phase6d whatsapp number already linked yields exact diagnostic",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_num_linked",
        scenario: "NUMBER_ALREADY_LINKED",
      });
      assert.equal(result.attempt?.status, "NEEDS_ACTION");
      assert.ok(
        result.diagnostics?.some(
          (item: any) => item.code === "WA_NUMBER_LINKED_ELSEWHERE"
        )
      );
    },
  },
  {
    name: "phase6d whatsapp wrong business selection yields guided fix",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_wrong_business",
        scenario: "WRONG_BUSINESS",
      });
      assert.equal(result.attempt?.status, "NEEDS_ACTION");
      assert.ok(
        result.diagnostics?.some((item: any) => item.code === "WA_WRONG_BUSINESS")
      );
    },
  },
  {
    name: "phase6d whatsapp template failure is explicit and retryable",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_template_failure",
        scenario: "TEMPLATE_FAILURE",
      });
      assert.equal(result.attempt?.status, "LIMITED");
      assert.ok(
        result.diagnostics?.some((item: any) => item.code === "WA_TEMPLATE_FAILURE")
      );
    },
  },
  {
    name: "phase6d whatsapp webhook failure is surfaced in health status",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_webhook_failure",
        scenario: "WEBHOOK_FAIL",
      });
      assert.equal(result.attempt?.status, "WEBHOOK_FAILED");
      assert.equal(result.health?.status, "WEBHOOK_FAILED");
    },
  },
  {
    name: "phase6d whatsapp quality drop is captured with limited status",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_quality_issue",
        scenario: "QUALITY_ISSUE",
      });
      assert.equal(result.attempt?.status, "LIMITED");
      assert.ok(
        result.diagnostics?.some((item: any) => item.code === "WA_QUALITY_ISSUE")
      );
    },
  },
  {
    name: "phase6d whatsapp rate limit recovers through one-click retry path",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_rate_limited",
        scenario: "RATE_LIMIT",
      });
      const retryTarget = result.diagnostics?.find(
        (item: any) => item.code === "WA_RATE_LIMITED"
      );
      assert.ok(retryTarget);
      const recovered = await retryConnectionDiagnostic({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        diagnosticKey: retryTarget.diagnosticKey,
      });
      assert.equal(recovered.resolutionStatus, "RECOVERED");
      assert.ok(recovered.resolvedAt);
    },
  },
  {
    name: "phase6d whatsapp connect doctor resolves fixable diagnostics",
    run: async () => {
      await reset();
      await seedTenant();
      await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_doctor_seed",
        scenario: "TOKEN_ISSUE",
      });
      const doctor = await runWhatsAppConnectDoctor({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        autoResolve: true,
      });
      assert.equal(doctor.provider, "WHATSAPP");
      assert.ok(doctor.autoResolveResults.some((item) => item.resolved));
    },
  },
  {
    name: "phase6d plan entitlement enforces single live instagram on starter",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_plan_cap_1",
      });
      await assert.rejects(
        connectInstagramOneClick({
          businessId: BUSINESS_ID,
          tenantId: TENANT_ID,
          replayToken: "ig_plan_cap_2",
        }),
        /plan_limit_reached/i
      );
    },
  },
  {
    name: "phase6d upgrade unlocks multi-connect as canonical path",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_upgrade_seed_1",
      });
      await processPlanUpgrade({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        toPlan: "GROWTH",
        replayToken: "phase6d_upgrade_growth",
      });
      const second = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_upgrade_seed_2",
      });
      assert.equal(second.integration?.status, "CONNECTED");
      const projection = await getConnectHubProjection({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
      });
      const instagramLive = projection.byProvider.find(
        (provider) => provider.provider === "INSTAGRAM"
      );
      assert.ok(instagramLive);
      assert.equal(instagramLive?.live.status, "CONNECTED");
    },
  },
  {
    name: "phase6d entitlement usage follows active upgraded plan version",
    run: async () => {
      await reset();
      await seedTenant();
      const starterUsage = await meterFeatureEntitlementUsage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        featureKey: "channels",
        units: 2,
        replayToken: "channels_starter_usage",
      });
      assert.equal(starterUsage.metadata?.allowed, true);
      await processPlanUpgrade({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        toPlan: "GROWTH",
        replayToken: "upgrade_for_entitlement_version",
      });
      const growthUsage = await meterFeatureEntitlementUsage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        featureKey: "channels",
        units: 3,
        replayToken: "channels_growth_usage",
      });
      assert.equal(growthUsage.metadata?.allowed, true);
    },
  },
  {
    name: "phase6d provider-prefixed webhook diagnostics retry through reconnect flow",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "ig_webhook_retry_seed",
      });
      const failed = await markProviderWebhookFailure({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
      });
      const recovered = await retryConnectionDiagnostic({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        diagnosticKey: failed.diagnostic?.diagnosticKey,
      });
      assert.equal(recovered.resolutionStatus, "RECOVERED");
      assert.ok(recovered.resolvedAt);
    },
  },
  {
    name: "phase6d whatsapp doctor reports clear status after auto-resolution",
    run: async () => {
      await reset();
      await seedTenant();
      await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "wa_doctor_clear_seed",
        scenario: "WEBHOOK_FAIL",
      });
      const doctor = await runWhatsAppConnectDoctor({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        autoResolve: true,
      });
      assert.equal(doctor.doctorStatus, "CLEAR");
      assert.equal(doctor.openIssueCount, 0);
    },
  },
  {
    name: "phase6d sandbox and live integrations stay isolated by authority",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        environment: "SANDBOX",
        replayToken: "ig_sandbox_only",
      });
      const projection = await getConnectHubProjection({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
      });
      const instagram = projection.byProvider.find(
        (provider) => provider.provider === "INSTAGRAM"
      );
      assert.equal(instagram?.sandbox.status, "CONNECTED");
      assert.equal(instagram?.live.status, "DISCONNECTED");
    },
  },
  {
    name: "phase6d cross-environment bleed attempts are blocked and contained",
    run: async () => {
      await reset();
      await seedTenant();
      const injection = await runSaaSPackagingFailureInjection({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scenario: "cross_env_bleed_attempt",
      });
      assert.equal(injection.contained, true);
    },
  },
  {
    name: "phase6d setup wizard resume is replay-safe and progress-canonical",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await saveSetupWizardProgress({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        step: "BUSINESS_INFO",
        payload: {
          legalName: "Phase6D Tenant",
        },
        replayToken: "wizard_replay_progress",
      });
      const second = await saveSetupWizardProgress({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        step: "BUSINESS_INFO",
        payload: {
          legalName: "Phase6D Tenant",
        },
        replayToken: "wizard_replay_progress",
      });
      assert.equal(first.wizardKey, second.wizardKey);
      assert.equal(
        first.completedSteps.filter((step: string) => step === "BUSINESS_INFO").length,
        1
      );
    },
  },
  {
    name: "phase6d tenant provisioning replay is deterministic",
    run: async () => {
      await reset();
      const first = await provisionTenantSaaSPackaging({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "tenant_provision_replay_token",
      });
      const second = await provisionTenantSaaSPackaging({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "tenant_provision_replay_token",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(
        first.provisioning?.provisioningKey,
        second.provisioning?.provisioningKey
      );
    },
  },
  {
    name: "phase6d feature gate replay is dedupe-safe",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await meterFeatureEntitlementUsage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        featureKey: "channels",
        units: 1,
        replayToken: "feature_gate_replay_token",
      });
      const second = await meterFeatureEntitlementUsage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        featureKey: "channels",
        units: 1,
        replayToken: "feature_gate_replay_token",
      });
      assert.equal(first.usageLedgerKey, second.usageLedgerKey);
    },
  },
  {
    name: "phase6d failure injection validates token refresh containment",
    run: async () => {
      await reset();
      await seedTenant();
      const result = await runSaaSPackagingFailureInjection({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scenario: "token_refresh_failure",
      });
      assert.equal(result.contained, true);
    },
  },
  {
    name: "phase6d self audit confirms deeply wired canonical connect hub",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "audit_ig_seed",
      });
      await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "audit_wa_seed",
      });
      await meterFeatureEntitlementUsage({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        featureKey: "ai_volume",
        units: 10,
        replayToken: "audit_feature_usage_seed",
      });
      const audit = await runSaaSPackagingConnectHubSelfAudit({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
      });
      assert.equal(audit.deeplyWired, true);
      assert.equal(audit.checks.noHiddenTenantTruth, true);
      assert.equal(audit.checks.noHiddenEntitlementTruth, true);
      assert.equal(audit.checks.noHiddenIntegrationPath, true);
      assert.equal(audit.checks.replaySafe, true);
      assert.equal(audit.checks.dedupeSafe, true);
    },
  },
];
