// @ts-nocheck
import assert from "node:assert/strict";
import {
  __saasPackagingPhase6DTestInternals,
  bootstrapSaaSPackagingConnectHubOS,
  connectInstagramOneClick,
  connectWhatsAppGuidedWizard,
  markProviderWebhookFailure,
  provisionTenantSaaSPackaging,
  reconcileMetaColdBoot,
  recordInboundProviderWebhook,
  refreshIntegrationToken,
  runSaaSPackagingFailureInjection,
  seedMetaReviewerMode,
} from "../services/saasPackagingConnectHubOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const BUSINESS_ID = "meta_enterprise_connect_business_1";
const TENANT_ID = "meta_enterprise_connect_business_1";

const reset = async () => {
  __saasPackagingPhase6DTestInternals.resetStore();
  await bootstrapSaaSPackagingConnectHubOS();
};

const seedTenant = async (replayToken = "meta_enterprise_seed_provision") =>
  provisionTenantSaaSPackaging({
    businessId: BUSINESS_ID,
    tenantId: TENANT_ID,
    plan: "ENTERPRISE",
    replayToken,
  });

export const metaEnterpriseConnectClosureTests: TestCase[] = [
  {
    name: "meta enterprise instagram first connect",
    run: async () => {
      await reset();
      await seedTenant();
      const connected = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_ig_first_connect",
      });
      assert.equal(connected.integration?.status, "CONNECTED");
      assert.equal(connected.health?.status, "CONNECTED");
    },
  },
  {
    name: "meta enterprise instagram reconnect",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_ig_reconnect_seed",
      });
      const reconnect = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        reconnect: true,
        replayToken: "meta_ent_ig_reconnect_final",
      });
      assert.equal(first.integration?.integrationKey, reconnect.integration?.integrationKey);
      assert.equal(reconnect.integration?.status, "CONNECTED");
    },
  },
  {
    name: "meta enterprise instagram token refresh",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_ig_refresh_seed",
      });
      const refresh = await refreshIntegrationToken({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
        replayToken: "meta_ent_ig_refresh",
      });
      assert.equal(refresh.status, "SUCCESS");
    },
  },
  {
    name: "meta enterprise instagram permission downgrade",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_ig_perm_seed",
      });
      const downgraded = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        reconnect: true,
        replayToken: "meta_ent_ig_perm_downgrade",
        metaProof: {
          permissions: ["instagram_basic"],
        },
      });
      assert.equal(downgraded.attempt?.status, "PERMISSION_MISSING");
    },
  },
  {
    name: "meta enterprise instagram disconnect recovery",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_ig_disconnect_seed",
        simulate: {
          disconnected: true,
        },
      });
      const recovered = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        reconnect: true,
        replayToken: "meta_ent_ig_disconnect_recover",
      });
      assert.equal(recovered.integration?.status, "CONNECTED");
    },
  },
  {
    name: "meta enterprise whatsapp first connect",
    run: async () => {
      await reset();
      await seedTenant();
      const connected = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_wa_first_connect",
      });
      assert.equal(connected.integration?.status, "CONNECTED");
      assert.equal(connected.health?.status, "CONNECTED");
    },
  },
  {
    name: "meta enterprise whatsapp reconnect",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_wa_reconnect_seed",
      });
      const reconnect = await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        reconnect: true,
        replayToken: "meta_ent_wa_reconnect_final",
      });
      assert.equal(first.integration?.integrationKey, reconnect.integration?.integrationKey);
      assert.equal(reconnect.integration?.status, "CONNECTED");
    },
  },
  {
    name: "meta enterprise whatsapp token refresh",
    run: async () => {
      await reset();
      await seedTenant();
      await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_wa_refresh_seed",
      });
      const refresh = await refreshIntegrationToken({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "WHATSAPP",
        replayToken: "meta_ent_wa_refresh",
      });
      assert.equal(refresh.status, "SUCCESS");
    },
  },
  {
    name: "meta enterprise whatsapp webhook replay",
    run: async () => {
      await reset();
      await seedTenant();
      await connectWhatsAppGuidedWizard({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_wa_webhook_seed",
      });
      const first = await recordInboundProviderWebhook({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "WHATSAPP",
        environment: "LIVE",
        success: true,
        details: {
          eventId: "meta_ent_wa_webhook_event_1",
          eventTimestampMs: Date.now(),
        },
      });
      const replay = await recordInboundProviderWebhook({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "WHATSAPP",
        environment: "LIVE",
        success: true,
        details: {
          eventId: "meta_ent_wa_webhook_event_1",
          eventTimestampMs: Date.now() + 5,
        },
      });
      assert.equal(first.accepted, true);
      assert.equal(replay.accepted, true);
      assert.equal(replay.duplicate, true);
    },
  },
  {
    name: "meta enterprise duplicate connect replay",
    run: async () => {
      await reset();
      await seedTenant();
      const first = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_duplicate_connect_replay",
      });
      const second = await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_duplicate_connect_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.attempt?.attemptKey, second.attempt?.attemptKey);
    },
  },
  {
    name: "meta enterprise cold boot reconcile",
    run: async () => {
      await reset();
      await seedTenant();
      await connectInstagramOneClick({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        replayToken: "meta_ent_cold_boot_seed",
      });
      await markProviderWebhookFailure({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
      });
      const reconciled = await reconcileMetaColdBoot({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        provider: "INSTAGRAM",
        environment: "LIVE",
      });
      assert.equal(reconciled.reconciled, true);
      assert.ok(reconciled.repairedWebhook >= 1);
    },
  },
  {
    name: "meta enterprise reviewer demo path",
    run: async () => {
      await reset();
      await seedTenant();
      const reviewer = await seedMetaReviewerMode({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        environment: "SANDBOX",
      });
      assert.equal(reviewer.seeded, true);
      assert.ok(Array.isArray(reviewer.demoScript));
      assert.ok(reviewer.demoScript.length >= 3);
      assert.ok(reviewer.healthProof?.doctor);
    },
  },
  {
    name: "meta enterprise provider outage failover",
    run: async () => {
      await reset();
      await seedTenant();
      const outage = await runSaaSPackagingFailureInjection({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scenario: "token_refresh_failure",
      });
      assert.equal(outage.contained, true);
    },
  },
];
