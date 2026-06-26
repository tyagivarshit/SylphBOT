import assert from "node:assert/strict";
import { container } from "../runtime/core";
import { bootstrapper } from "../runtime/kernel/bootstrap";
import { ActorProfile } from "../runtime/interfaces/identity";
import {
  executeGrowthWorkflowWithReliability,
  validateGrowthExecution,
  publishGrowthEvent,
  linkCampaignCustomer,
  linkCampaignKnowledge,
  linkReferralCustomer,
  linkAffiliatePartner,
  linkJourneyTimeline,
  linkOfferCustomer,
  linkChannelPerformance,
  linkExecutionDecision,
  linkOverridePolicy,
  linkPromotionTimeline,
  validateGrowthRuntimeAdoption
} from "../services/growthIntegration.service";

const ensureBootstrapped = async () => {
  if (!container.has("IEventBus")) {
    await bootstrapper.bootstrap().catch(() => {});
  }
};

export const growthIntegrationTests: any[] = [
  {
    name: "Growth Integration: verify Growth event contracts are registered in ContractRegistry",
    run: async () => {
      await ensureBootstrapped();
      const registry = container.resolve<any>("IContractRegistry");

      const events = [
        "growth.acquisition.captured",
        "growth.attribution.captured",
        "growth.referral.rewarded",
        "growth.referral.blocked",
        "growth.affiliate.flagged",
        "growth.partner.onboarded",
        "growth.lifecycle.advanced",
        "growth.churn.intervention",
        "growth.expansion.detected",
        "growth.pricing.experiment_launched",
        "growth.pricing.rolled_back",
        "growth.offer.published",
        "growth.content.generated",
        "growth.advocacy.rewarded",
        "growth.channel.saturated",
        "growth.override.applied",
        "growth.execution.failed",
        // Phase 1 Workflow events
        "conversation.updated",
        "booking.created",
        "payment.received",
        "campaign.finished",
        "knowledge.updated",
        "customer.converted",
        "workflow.started",
        "workflow.completed",
        "workflow.failed",
        "workflow.cancelled",
        "workflow.retry"
      ];

      for (const event of events) {
        const contract = registry.getContract(event, "1.0.0");
        assert.ok(contract, `Event contract [${event}] version [1.0.0] should be registered.`);
      }
    }
  },
  {
    name: "Growth Integration: verify Growth tools are registered in ToolRegistry",
    run: async () => {
      await ensureBootstrapped();
      const toolRegistry = container.resolve<any>("IToolRegistry");
      const tools = toolRegistry.listTools().map((t: any) => t.name);

      const expectedTools = [
        "apply_growth_policy",
        "apply_growth_override",
        "create_growth_campaign",
        "execute_growth_campaign",
        "record_acquisition",
        "record_growth_conversion",
        "create_referral_code",
        "credit_referral_conversion",
        "onboard_growth_partner",
        "record_affiliate_commission",
        "settle_partner_payout",
        "advance_lifecycle_journey",
        "assess_churn_risk",
        "detect_expansion_opportunity",
        "launch_pricing_experiment",
        "rollback_pricing_experiment",
        "publish_offer",
        "publish_content_campaign",
        "request_review_reward",
        "record_channel_performance",
        // Phase 3 Workflow execution tools
        "start_workflow",
        "pause_workflow",
        "resume_workflow",
        "cancel_workflow",
        "schedule_workflow",
        "retry_workflow",
        "execute_action",
        "queue_action",
        "send_email",
        "send_whatsapp",
        "send_instagram",
        "update_crm",
        "create_task"
      ];

      for (const tool of expectedTools) {
        assert.ok(tools.includes(tool), `Growth tool [${tool}] should be registered.`);
      }
    }
  },
  {
    name: "Growth Integration: verify execution validation (Permission and Policy checks)",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-growth-1";
      const actor: ActorProfile = {
        actorId: "actor-g1",
        tenantId: "tenant-growth-different", // mismatch to trigger isolation check
        role: "USER",
        scopes: ["crm:write"]
      };

      // Tenant isolation violation
      await assert.rejects(
        async () => {
          await validateGrowthExecution(tenantId, "record_acquisition", { businessId: tenantId }, actor);
        },
        /Cross-tenant Growth operation blocked/
      );
    }
  },
  {
    name: "Growth Integration: verify reliability wrapper with circuit breaker and retry support",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-growth-1";
      const workflow = "referral_payout";

      let callCount = 0;
      const failingFn = async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error("Temporary network glitch");
        }
        return "success";
      };

      // Verify it recovers via retry manager
      const result = await executeGrowthWorkflowWithReliability(tenantId, workflow, failingFn);
      assert.equal(result, "success");
      assert.equal(callCount, 2);
    }
  },
  {
    name: "Growth Integration: verify Event Bus publishes growth event outcome",
    run: async () => {
      await ensureBootstrapped();
      const eventBus = container.resolve<any>("IEventBus");
      const tenantId = "tenant-growth-1";

      let fired = false;
      eventBus.subscribe("growth.acquisition.captured", (envelope: any) => {
        if (envelope.payload.leadId === "lead-g1") {
          fired = true;
        }
      });

      await publishGrowthEvent(tenantId, "growth.acquisition.captured", {
        businessId: tenantId,
        tenantId,
        leadId: "lead-g1",
        channel: "seo"
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(fired);
    }
  },
  {
    name: "Growth Integration: verify Business Graph prepare relationship links",
    run: async () => {
      await ensureBootstrapped();
      const tenantId = "tenant-growth-1";
      const memoryEngine = container.resolve<any>("IMemoryEngine");

      // Register nodes first
      await memoryEngine.upsertEntity({ id: "campaign:c-1", type: "campaign", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "customer:l-1", type: "customer", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "knowledge:k-1", type: "knowledge", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "referral:ref-1", type: "referral", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "partner:p-1", type: "partner", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "affiliate:aff-1", type: "affiliate", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "journey:j-1", type: "journey", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "timeline:t-1", type: "timeline", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "offer:o-1", type: "offer", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "performance:perf-1", type: "performance", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "execution:exec-1", type: "execution", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "decision:dec-1", type: "decision", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "override:over-1", type: "override", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "policy:pol-1", type: "policy", properties: { tenantId } });
      await memoryEngine.upsertEntity({ id: "promotion:prom-1", type: "promotion", properties: { tenantId } });

      // Run links
      await linkCampaignCustomer(tenantId, "c-1", "l-1");
      await linkCampaignKnowledge(tenantId, "c-1", "k-1");
      await linkReferralCustomer(tenantId, "ref-1", "l-1");
      await linkAffiliatePartner(tenantId, "aff-1", "p-1");
      await linkJourneyTimeline(tenantId, "j-1", "t-1");
      await linkOfferCustomer(tenantId, "o-1", "l-1");
      await linkChannelPerformance(tenantId, "perf-1", "seo");
      await linkExecutionDecision(tenantId, "exec-1", "dec-1");
      await linkOverridePolicy(tenantId, "over-1", "pol-1");
      await linkPromotionTimeline(tenantId, "prom-1", "t-1");

      const neighbors = await memoryEngine.queryNeighbors("campaign:c-1");
      assert.ok(neighbors.length > 0);
    }
  },
  {
    name: "Growth Integration: run validation check and return 100% adoption metrics",
    run: async () => {
      await ensureBootstrapped();
      const report = await validateGrowthRuntimeAdoption();
      assert.equal(report.eventBusAdoption, 100);
      assert.equal(report.toolRegistryAdoption, 100);
      assert.equal(report.policyEngineAdoption, 100);
      assert.equal(report.permissionEngineAdoption, 100);
      assert.equal(report.observabilityAdoption, 100);
      assert.equal(report.reliabilityAdoption, 100);
      assert.equal(report.memoryEngineAdoption, 100);
      assert.equal(report.overallAdoption, 100);

      console.log("[Runtime Validation Success] Growth Execution Infrastructure Adoption is 100%!");
      console.log(JSON.stringify(report, null, 2));
    }
  }
];
