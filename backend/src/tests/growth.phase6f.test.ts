// @ts-nocheck
import assert from "node:assert/strict";
import {
  __growthPhase6FTestInternals,
  advanceLifecycleJourney,
  applyGrowthOverride,
  applyGrowthPolicy,
  assessChurnRiskAndIntervene,
  bootstrapGrowthExpansionOS,
  createGrowthCampaign,
  createReferralCode,
  creditReferralConversion,
  detectExpansionOpportunity,
  executeGrowthCampaign,
  launchPricingExperiment,
  onboardGrowthPartner,
  publishContentCampaign,
  publishOffer,
  recordAcquisition,
  recordAffiliateCommission,
  recordChannelPerformance,
  requestReviewReward,
  rollbackPricingExperiment,
  runGrowthExpansionSelfAudit,
  runGrowthFailureInjection,
  settlePartnerPayout,
} from "../services/growthExpansionOS.service";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const BUSINESS_ID = "phase6f_business_1";
const TENANT_ID = "phase6f_tenant_1";

const reset = async () => {
  __growthPhase6FTestInternals.resetStore();
  await bootstrapGrowthExpansionOS();
};

export const growthPhase6FTests: TestCase[] = [
  {
    name: "phase6f attribution replay is deterministic and canonical",
    run: async () => {
      await reset();
      const first = await recordAcquisition({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_attr_1",
        channel: "instagram",
        funnelType: "paid",
        sourceRef: "adset_alpha",
        isPaid: true,
        costMinor: 2400,
        converted: true,
        replayToken: "phase6f_attr_replay",
      });
      const second = await recordAcquisition({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_attr_1",
        channel: "instagram",
        funnelType: "paid",
        sourceRef: "adset_alpha",
        isPaid: true,
        costMinor: 2400,
        converted: true,
        replayToken: "phase6f_attr_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.acquisition.acquisitionKey, second.acquisition.acquisitionKey);
      assert.equal(first.attribution.attributionKey, second.attribution.attributionKey);
    },
  },
  {
    name: "phase6f referral double-credit is blocked",
    run: async () => {
      await reset();
      const code = await createReferralCode({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        referrerLeadId: "lead_referrer_1",
        rewardMinor: 500,
      });
      const first = await creditReferralConversion({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        referralKey: code.referral.referralKey,
        referredLeadId: "lead_referred_1",
        conversionValueMinor: 12_000,
      });
      const second = await creditReferralConversion({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        referralKey: code.referral.referralKey,
        referredLeadId: "lead_referred_1",
        conversionValueMinor: 15_000,
      });
      assert.equal(first.blocked, false);
      assert.equal(first.referral.status, "REWARDED");
      assert.equal(second.blocked, true);
      assert.equal(second.reason, "double_credit_blocked");
    },
  },
  {
    name: "phase6f affiliate fraud containment holds suspicious commissions",
    run: async () => {
      await reset();
      const partner = await onboardGrowthPartner({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        partnerType: "affiliate",
        name: "Risky Partner",
      });
      const commission = await recordAffiliateCommission({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        partnerKey: partner.partner.partnerKey,
        leadId: "lead_aff_1",
        revenueMinor: 90_000,
        commissionRate: 0.6,
        suspiciousSignals: ["duplicate_device_graph", "bot_cluster"],
      });
      assert.equal(commission.affiliate.status, "HOLD");
      assert.equal(commission.affiliate.fraudStatus, "FLAGGED");
    },
  },
  {
    name: "phase6f lifecycle journey replay remains deterministic",
    run: async () => {
      await reset();
      const first = await advanceLifecycleJourney({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_journey_1",
        journeyType: "activation",
        currentState: "NEW",
        signal: "ADVANCE",
        replayToken: "phase6f_journey_replay",
      });
      const second = await advanceLifecycleJourney({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_journey_1",
        journeyType: "activation",
        currentState: "NEW",
        signal: "ADVANCE",
        replayToken: "phase6f_journey_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.journey.journeyKey, second.journey.journeyKey);
      assert.equal(first.journey.nextState, "ACTIVATED");
    },
  },
  {
    name: "phase6f churn save intervention triggers on high risk",
    run: async () => {
      await reset();
      const result = await assessChurnRiskAndIntervene({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_churn_1",
        usageDrop: 92,
        paymentRisk: 84,
        negativeSentiment: 80,
        lowRoi: 88,
        competitionSignal: 70,
        inactivity: 94,
        supportPain: 78,
        autoIntervene: true,
      });
      assert.equal(result.churnRisk.riskLevel, "HIGH");
      assert.equal(result.churnRisk.interventionStatus, "TRIGGERED");
      assert.ok(result.customerHealth.healthScore <= 30);
    },
  },
  {
    name: "phase6f expansion upgrade detection chooses best next offer",
    run: async () => {
      await reset();
      const result = await detectExpansionOpportunity({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_expand_1",
        seatGrowth: 94,
        numberGrowth: 40,
        brandGrowth: 30,
        aiVolumeGrowth: 85,
        teamGrowth: 65,
        regionalGrowth: 20,
        featureUsageGrowth: 35,
      });
      assert.equal(result.expansion.status, "OPEN");
      assert.equal(result.expansion.opportunityType, "SEAT_EXPANSION");
      assert.ok(result.bestOffer.offerKey);
    },
  },
  {
    name: "phase6f pricing rollback preserves canonical experiment truth",
    run: async () => {
      await reset();
      const launched = await launchPricingExperiment({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        experimentKey: "pricing_tier_test",
        entityId: "lead_price_1",
        arms: ["control", "annual_bundle", "usage_hybrid"],
        metricPrimary: "payback_days",
      });
      const rolled = await rollbackPricingExperiment({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        pricingExperimentKey: launched.experiment.pricingExperimentKey,
        reason: "underperforming_arm",
      });
      assert.equal(launched.experiment.status, "RUNNING");
      assert.equal(rolled.experiment.status, "ROLLED_BACK");
    },
  },
  {
    name: "phase6f offer replay is dedupe-safe",
    run: async () => {
      await reset();
      const first = await publishOffer({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_offer_1",
        offerType: "LIMITED_TIME",
        priceMinor: 9900,
        discountPercent: 10,
        replayToken: "phase6f_offer_replay",
      });
      const second = await publishOffer({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_offer_1",
        offerType: "LIMITED_TIME",
        priceMinor: 9900,
        discountPercent: 10,
        replayToken: "phase6f_offer_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.offer.offerKey, second.offer.offerKey);
    },
  },
  {
    name: "phase6f content campaign replay avoids duplicate campaign state",
    run: async () => {
      await reset();
      const first = await publishContentCampaign({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        channel: "whatsapp",
        contentType: "email_sequence",
        objective: "reactivation",
        replayToken: "phase6f_content_replay",
      });
      const second = await publishContentCampaign({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        channel: "whatsapp",
        contentType: "email_sequence",
        objective: "reactivation",
        replayToken: "phase6f_content_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.content.contentKey, second.content.contentKey);
    },
  },
  {
    name: "phase6f review reward replay is idempotent",
    run: async () => {
      await reset();
      const first = await requestReviewReward({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_review_1",
        channel: "instagram",
        rewardMinor: 300,
        replayToken: "phase6f_review_reward_replay",
      });
      const second = await requestReviewReward({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_review_1",
        channel: "instagram",
        rewardMinor: 300,
        replayToken: "phase6f_review_reward_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.review.reviewRequestKey, second.review.reviewRequestKey);
    },
  },
  {
    name: "phase6f partner payout replay does not double-settle",
    run: async () => {
      await reset();
      const partner = await onboardGrowthPartner({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        partnerType: "partner",
        name: "Channel Partner Prime",
      });
      const first = await settlePartnerPayout({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        partnerKey: partner.partner.partnerKey,
        amountMinor: 24_000,
        replayToken: "phase6f_partner_payout_replay",
      });
      const second = await settlePartnerPayout({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        partnerKey: partner.partner.partnerKey,
        amountMinor: 24_000,
        replayToken: "phase6f_partner_payout_replay",
      });
      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.equal(first.affiliate.affiliateKey, second.affiliate.affiliateKey);
    },
  },
  {
    name: "phase6f channel saturation detection is explicit",
    run: async () => {
      await reset();
      const row = await recordChannelPerformance({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        channel: "instagram",
        spendMinor: 650_000,
        revenueMinor: 35_000,
        conversions: 3,
        customersAcquired: 2,
        leadsTouched: 1200,
      });
      assert.equal(row.healthState, "SATURATED");
      assert.ok(row.saturationScore >= 1.2);
    },
  },
  {
    name: "phase6f override precedence blocks campaign despite permissive policy",
    run: async () => {
      await reset();
      const campaign = await createGrowthCampaign({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        channel: "whatsapp",
        funnelType: "paid",
        campaignType: "dm_funnel",
        objective: "expand_bookings",
      });
      await applyGrowthPolicy({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scope: "CAMPAIGN_EXECUTION",
        targetType: "CAMPAIGN",
        targetKey: campaign.campaign.campaignKey,
        rules: {
          allowedChannels: ["WHATSAPP"],
          maxSaturationScore: 10,
        },
      });
      await applyGrowthOverride({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scope: "CAMPAIGN_EXECUTION",
        targetType: "CAMPAIGN",
        targetKey: campaign.campaign.campaignKey,
        action: "BLOCK",
        reason: "manual_pause_for_quality",
        priority: 999,
      });
      const execution = await executeGrowthCampaign({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        campaignKey: campaign.campaign.campaignKey,
        channel: "whatsapp",
        action: "dispatch",
      });
      assert.equal(execution.execution.status, "BLOCKED");
      assert.match(String(execution.execution.errorMessage || ""), /override/i);
    },
  },
  {
    name: "phase6f failure injection contains campaign execution failure",
    run: async () => {
      await reset();
      const failure = await runGrowthFailureInjection({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        scenario: "campaign_execution_failure",
      });
      assert.equal(failure.contained, true);
      assert.ok(failure.evidenceKey);
    },
  },
  {
    name: "phase6f self audit confirms fully wired canonical growth OS",
    run: async () => {
      await reset();
      await recordAcquisition({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
        leadId: "lead_audit_1",
        channel: "seo",
        funnelType: "organic",
        isPaid: false,
        converted: true,
      });
      const audit = await runGrowthExpansionSelfAudit({
        businessId: BUSINESS_ID,
        tenantId: TENANT_ID,
      });
      assert.equal(audit.deeplyWired, true);
      assert.equal(audit.checks.replaySafe, true);
      assert.equal(audit.checks.overrideSafe, true);
      assert.equal(audit.checks.orphanFree, true);
      assert.equal(audit.checks.deeplyWiredDomains, true);
    },
  },
];
