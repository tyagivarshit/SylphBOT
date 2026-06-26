import { container } from "../runtime/core";
import { ActorProfile } from "../runtime/interfaces/identity";
import {
  ISalesAIConnector,
  ICustomerSuccessAIConnector,
  IMarketingAIConnector,
  IOperationsAIConnector,
  IFinanceAIConnector,
  ICEOAIConnector
} from "./conversationIntegration.service";
import {
  ISalesGrowthAIConnector,
  IMarketingGrowthAIConnector,
  ICEOGrowthAIConnector
} from "./growthIntegration.service";

/**
 * Concrete Sales AI Connector using IToolExecutor.
 */
export class SalesAIConnector implements ISalesAIConnector, ISalesGrowthAIConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async getCustomerIntelligenceContext(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_customer", { businessId: this.tenantId, leadId });
  }

  async dispatchCrmAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getLeadScorecard(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "assess_churn_risk", { businessId: this.tenantId, leadId });
  }

  async wonDeal(dealId: string): Promise<void> {
    const executor = container.resolve<any>("IToolExecutor");
    await executor.execute(this.actorProfile, "update_crm", { businessId: this.tenantId, dealId, stage: "CLOSED_WON" });
  }

  async evaluateWorkflowRules(scope: string, targetKey: string, payload: any): Promise<boolean> {
    const executor = container.resolve<any>("IToolExecutor");
    const result = await executor.execute(this.actorProfile, "apply_growth_policy", { businessId: this.tenantId, scope, targetKey, rules: payload });
    return result.allowed !== false;
  }

  async dispatchGrowthAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getConversionOptimizationInsight(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "detect_expansion_opportunity", { businessId: this.tenantId, leadId });
  }

  async triggerReferralReward(code: string, referredLeadId: string): Promise<void> {
    const executor = container.resolve<any>("IToolExecutor");
    await executor.execute(this.actorProfile, "credit_referral_conversion", { businessId: this.tenantId, referralKey: code, referredLeadId });
  }
}

/**
 * Concrete Customer Success AI Connector using IToolExecutor.
 */
export class CustomerSuccessAIConnector implements ICustomerSuccessAIConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async getCustomerIntelligenceContext(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_customer", { businessId: this.tenantId, leadId });
  }

  async dispatchCrmAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getRelationshipHealth(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "assess_churn_risk", { businessId: this.tenantId, leadId });
  }

  async escalateToHuman(leadId: string, reason: string): Promise<void> {
    const executor = container.resolve<any>("IToolExecutor");
    await executor.execute(this.actorProfile, "handoff_conversation", { businessId: this.tenantId, leadId, targetAgentId: "support_team", reason });
  }
}

/**
 * Concrete Marketing AI Connector using IToolExecutor.
 */
export class MarketingAIConnector implements IMarketingAIConnector, IMarketingGrowthAIConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async getCustomerIntelligenceContext(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_customer", { businessId: this.tenantId, leadId });
  }

  async dispatchCrmAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getCustomerSegments(leadId: string): Promise<string[]> {
    const executor = container.resolve<any>("IToolExecutor");
    const result = await executor.execute(this.actorProfile, "retrieve_context", { businessId: this.tenantId, leadId, contextKey: "segments" });
    return result ? JSON.parse(result) : [];
  }

  async evaluateWorkflowRules(scope: string, targetKey: string, payload: any): Promise<boolean> {
    const executor = container.resolve<any>("IToolExecutor");
    const result = await executor.execute(this.actorProfile, "apply_growth_policy", { businessId: this.tenantId, scope, targetKey, rules: payload });
    return result.allowed !== false;
  }

  async dispatchGrowthAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getActiveCampaignPerformance(channel: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "record_channel_performance", { businessId: this.tenantId, channel });
  }

  async publishContentWorkflow(channel: string, type: string, objective: string): Promise<string> {
    const executor = container.resolve<any>("IToolExecutor");
    const result = await executor.execute(this.actorProfile, "publish_content_campaign", { businessId: this.tenantId, channel, contentType: type, objective });
    return result.content?.contentKey || "";
  }
}

/**
 * Concrete Operations AI Connector using IToolExecutor.
 */
export class OperationsAIConnector implements IOperationsAIConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async getCustomerIntelligenceContext(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_customer", { businessId: this.tenantId, leadId });
  }

  async dispatchCrmAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getInteractionTimeline(leadId: string): Promise<any[]> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_conversation", { businessId: this.tenantId, leadId });
  }
}

/**
 * Concrete Finance AI Connector using IToolExecutor.
 */
export class FinanceAIConnector implements IFinanceAIConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async getCustomerIntelligenceContext(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_customer", { businessId: this.tenantId, leadId });
  }

  async dispatchCrmAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getCustomerPurchaseHistory(leadId: string): Promise<any[]> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_context", { businessId: this.tenantId, leadId, contextKey: "purchases" });
  }
}

/**
 * Concrete CEO AI Connector using IToolExecutor.
 */
export class CEOAIConnector implements ICEOAIConnector, ICEOGrowthAIConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async getCustomerIntelligenceContext(leadId: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_customer", { businessId: this.tenantId, leadId });
  }

  async dispatchCrmAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getEnterpriseAggregates(): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "record_channel_performance", { businessId: this.tenantId, channel: "ALL" });
  }

  async evaluateWorkflowRules(scope: string, targetKey: string, payload: any): Promise<boolean> {
    const executor = container.resolve<any>("IToolExecutor");
    const result = await executor.execute(this.actorProfile, "apply_growth_policy", { businessId: this.tenantId, scope, targetKey, rules: payload });
    return result.allowed !== false;
  }

  async dispatchGrowthAction(toolName: string, args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, toolName, { ...args, businessId: this.tenantId });
  }

  async getEnterpriseCACAndLTV(): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "record_channel_performance", { businessId: this.tenantId, channel: "ALL" });
  }
}

/**
 * Interface for Executive AI Scheduling actions (Phase 11).
 */
export interface IExecutiveAISchedulingConnector {
  tenantId: string;
  actorProfile: ActorProfile;
  scheduleAppointment(args: any): Promise<any>;
  modifyAppointment(args: any): Promise<any>;
  monitorAppointment(appointmentKey: string): Promise<any>;
}

/**
 * Concrete Executive AI Scheduling Connector routing calls through the Runtime IToolExecutor.
 */
export class ExecutiveAISchedulingConnector implements IExecutiveAISchedulingConnector {
  constructor(public tenantId: string, public actorProfile: ActorProfile) {}

  async scheduleAppointment(args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "create_booking", { ...args, businessId: this.tenantId });
  }

  async modifyAppointment(args: any): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "reschedule_booking", { ...args, businessId: this.tenantId });
  }

  async monitorAppointment(appointmentKey: string): Promise<any> {
    const executor = container.resolve<any>("IToolExecutor");
    return executor.execute(this.actorProfile, "retrieve_booking", { appointmentKey, businessId: this.tenantId });
  }
}

